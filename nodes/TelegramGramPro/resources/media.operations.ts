import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { getClient } from '../core/clientManager';
import { safeExecute } from '../core/floodWaitHandler';
import { Api } from 'telegram';
import type {
	TelegramClientInstance,
	TelegramCredentials,
	TelegramEntityLike,
	TelegramMediaLike,
	TelegramMessageLike,
} from '../core/types';

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
	const chatId = this.getNodeParameter('chatId', i) as TelegramEntityLike;
	const messageId = Number(this.getNodeParameter('messageId', i));

	const messages = (await safeExecute(() =>
		client.getMessages(chatId, { ids: [messageId] }),
	)) as TelegramMessageLike[];

	const message = messages[0];
	const media = message?.media as TelegramMediaLike;

	if (!media) {
		throw new Error('No media found in message');
	}

	const buffer = (await safeExecute(() => client.downloadMedia(media))) as Buffer | Uint8Array;

	const normalizedBuffer = ensureBuffer(buffer);

	// Determine mime type and file name
	let mimeType = 'application/octet-stream';
	let fileName = `file_${Date.now()}`;

	if ('document' in media && media.document instanceof Api.Document) {
		mimeType = media.document.mimeType || mimeType;
		const filenameAttr = media.document.attributes.find(
			(attribute): attribute is Api.DocumentAttributeFilename =>
				attribute instanceof Api.DocumentAttributeFilename,
		);
		if (filenameAttr) fileName = filenameAttr.fileName;
	} else if ('photo' in media && media.photo) {
		mimeType = 'image/jpeg';
		fileName = `photo_${Date.now()}.jpg`;
	}

	return [
		{
			json: {
				success: true,
				fileName,
				mimeType,
				size: normalizedBuffer.length,
			},
			binary: {
				data: {
					data: normalizedBuffer.toString('base64'),
					mimeType,
					fileName,
				},
			},
			pairedItem: { item: i },
		},
	];
}

function ensureBuffer(data: Buffer | Uint8Array): Buffer {
	if (Buffer.isBuffer(data)) {
		return data;
	}

	if (data instanceof Uint8Array) {
		return Buffer.from(data);
	}

	throw new Error('Downloaded media is not in a supported binary format');
}
