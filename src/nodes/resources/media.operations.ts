import { IExecuteFunctions } from 'n8n-workflow';
import { getClient } from '../../core/clientManager';
import { safeExecute } from '../../core/floodWaitHandler';
import fs from 'fs';

export async function mediaRouter(this: IExecuteFunctions, operation: string) {

	const creds: any = await this.getCredentials('telegramApi');

	const client = await getClient(
		creds.apiId,
		creds.apiHash,
		creds.session,
	);

	switch (operation) {

		case 'downloadMedia':
			return downloadMedia.call(this, client);

		default:
			throw new Error(`Media operation not supported: ${operation}`);
	}
}

// ----------------

async function downloadMedia(this: IExecuteFunctions, client: any) {

	const chatId = this.getNodeParameter('chatId', 0);
	const messageId = this.getNodeParameter('messageId', 0);

	const msg = await safeExecute(() =>
		client.getMessages(chatId, { ids: [messageId] }),
	);

	const message = msg[0];

	if (!message?.media) {
		throw new Error('No media found in message');
	}

	const buffer = await safeExecute(() =>
		client.downloadMedia(message.media),
	);

	const filePath = `./telegram_media_${Date.now()}`;

	fs.writeFileSync(filePath, buffer);

	return [[{
		json: {
			filePath,
			size: buffer.length,
			success: true,
		},
	}]];
}
