import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { getClient } from '../core/clientManager';
import { safeExecute } from '../core/floodWaitHandler';
import { Api } from 'telegram';
import path from 'path';
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

	fileName = ensureFileNameExtension(fileName, mimeType, normalizedBuffer);

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

function ensureFileNameExtension(fileName: string, mimeType: string, buffer: Buffer): string {
	if (path.extname(fileName)) {
		return fileName;
	}

	const extension =
		getExtensionFromMimeType(mimeType) ||
		getExtensionFromMimeType(detectMimeTypeFromBuffer(buffer));
	return extension ? `${fileName}${extension}` : fileName;
}

function getExtensionFromMimeType(mimeType: string | undefined): string {
	if (!mimeType) {
		return '';
	}

	const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();
	const knownExtensions: Record<string, string> = {
		'application/gzip': '.gz',
		'application/json': '.json',
		'application/octet-stream': '',
		'application/pdf': '.pdf',
		'application/zip': '.zip',
		'audio/mpeg': '.mp3',
		'audio/ogg': '.ogg',
		'image/gif': '.gif',
		'image/jpeg': '.jpg',
		'image/png': '.png',
		'image/webp': '.webp',
		'text/html': '.html',
		'text/plain': '.txt',
		'video/mp4': '.mp4',
		'video/quicktime': '.mov',
		'video/webm': '.webm',
	};

	return knownExtensions[normalizedMime] ?? '';
}

function detectMimeTypeFromBuffer(buffer: Buffer): string | undefined {
	if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
		return 'image/jpeg';
	}

	if (
		buffer.length >= 8 &&
		buffer[0] === 0x89 &&
		buffer[1] === 0x50 &&
		buffer[2] === 0x4e &&
		buffer[3] === 0x47 &&
		buffer[4] === 0x0d &&
		buffer[5] === 0x0a &&
		buffer[6] === 0x1a &&
		buffer[7] === 0x0a
	) {
		return 'image/png';
	}

	if (buffer.length >= 6) {
		const gifHeader = buffer.subarray(0, 6).toString('ascii');
		if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
			return 'image/gif';
		}
	}

	if (
		buffer.length >= 12 &&
		buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
		buffer.subarray(8, 12).toString('ascii') === 'WEBP'
	) {
		return 'image/webp';
	}

	if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
		return 'application/pdf';
	}

	if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
		return 'application/zip';
	}

	if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
		return 'video/mp4';
	}

	return undefined;
}
