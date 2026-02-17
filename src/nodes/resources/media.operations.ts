import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { getClient } from '../../core/clientManager';
import { safeExecute } from '../../core/floodWaitHandler';

export async function mediaRouter(this: IExecuteFunctions, operation: string, i: number): Promise<INodeExecutionData[]> {

	const creds: any = await this.getCredentials('telegramApi');

	const client = await getClient(
		creds.apiId,
		creds.apiHash,
		creds.session,
	);

	switch (operation) {

		case 'downloadMedia':
			return downloadMedia.call(this, client, i);

		default:
			throw new Error(`Media operation not supported: ${operation}`);
	}
}

// ----------------

async function downloadMedia(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {

	const chatId = this.getNodeParameter('chatId', i);
	const messageId = this.getNodeParameter('messageId', i);

	const msg = await safeExecute(() =>
		client.getMessages(chatId, { ids: [messageId] }),
	) as any[];

	const message: any = msg[0];

	if (!message?.media) {
		throw new Error('No media found in message');
	}

	const buffer = await safeExecute(() =>
		client.downloadMedia(message.media),
	) as Buffer | Uint8Array;

	const normalizedBuffer = ensureBuffer(buffer);

	// Determine mime type and file name
	let mimeType = 'application/octet-stream';
	let fileName = `file_${Date.now()}`;

	if (message.media.document) {
		mimeType = message.media.document.mimeType || mimeType;
		const filenameAttr = message.media.document.attributes?.find((a: any) => a.className === 'DocumentAttributeFilename');
		if (filenameAttr) fileName = filenameAttr.fileName;
	} else if (message.media.photo) {
		mimeType = 'image/jpeg';
		fileName = `photo_${Date.now()}.jpg`;
	}

	return [{
		json: {
			success: true,
			fileName,
			mimeType,
			size: normalizedBuffer.length
		},
		binary: {
			data: {
				data: normalizedBuffer.toString('base64'),
				mimeType,
				fileName,
			}
		},
		pairedItem: { item: i },
	}];
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
