import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { getClient } from '../core/clientManager';
import { safeExecute } from '../core/floodWaitHandler';
import { Api } from 'telegram';
import type { TelegramClientInstance, TelegramCredentials, TelegramEntity } from '../core/types';
import {
	buildSharedAlbumPayload,
	buildSharedMessagePayload,
	createSharedBinaryExecutionItem,
	resolveMessageContextFromEntities,
} from '../core/payloadBuilders';

export async function mediaRouter(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const creds = (await this.getCredentials('telegramGramProApi')) as TelegramCredentials;

	const client = await getClient(creds.apiId, creds.apiHash, creds.session);

	switch (operation) {
		case 'downloadMedia':
			return downloadMedia.call(this, client, i);

		default:
			throw new Error(`Media operation not supported: ${operation}`);
	}
}

// ----------------

async function downloadMedia(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const chatIdInput = this.getNodeParameter('chatId', i) as string;
	const messageIdInput = Number(this.getNodeParameter('messageId', i));

	// 1. Resolve entity first to ensure client can fetch messages (handles non-cached entities)
	const entity = await client.getEntity(chatIdInput);

	// 2. Fetch the target message
	const messages = (await safeExecute(() =>
		client.getMessages(entity, { ids: [messageIdInput] }),
	)) as Api.Message[];

	const msg = messages?.[0];
	if (!msg || msg instanceof Api.MessageEmpty) {
		throw new Error('Message not found or contains no media');
	}

	const chatEntity = entity as unknown as TelegramEntity;

	// 3. If it's part of an album, fetch the full album
	let albumMessages = [msg];
	const gid = msg.groupedId?.toString();
	if (gid) {
		// Fetch surrounding messages to find the rest of the album
		// Albums are max 10 messages, so fetching 20 around it is safe.
		const surrounding = (await safeExecute(() =>
			client.getMessages(entity, {
				limit: 20,
				offsetId: messageIdInput + 10,
			}),
		)) as Api.Message[];

		albumMessages = surrounding.filter((m) => m.groupedId?.toString() === gid);
		// Ensure stable order (by ID)
		albumMessages.sort((a, b) => a.id - b.id);

		// Fallback: if somehow filter failed to find the original msg (unlikely), ensure it's there
		if (!albumMessages.find((m) => m.id === msg.id)) {
			albumMessages = [msg];
		}
	}

	// 4. Resolve context for the payload
	const senderEntity = (await msg.getSender?.()) as TelegramEntity;
	const messageContext = resolveMessageContextFromEntities(msg, chatEntity, senderEntity);

	// 5. Build the payload
	const payload = gid
		? buildSharedAlbumPayload(albumMessages, messageContext)
		: buildSharedMessagePayload(msg, messageContext);

	// 6. Download and create binary execution item
	const item = await createSharedBinaryExecutionItem(this, albumMessages, payload, false);

	return [item];
}
