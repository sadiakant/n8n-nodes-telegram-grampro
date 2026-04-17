import { Api } from 'teleproto';
import type { UserUpdateEvent } from 'teleproto/events/UserUpdate';
import type {
	IBinaryData,
	IDataObject,
	INodeExecutionData,
	ITriggerFunctions,
	IExecuteFunctions,
} from 'n8n-workflow';

import { renderTelegramEntities } from './messageFormatting';
import { formatBytesToHuman } from './fileSizeUtils';
import type { TelegramTriggerChatType, TelegramTriggerPayload, TelegramEntity } from './types';

export type SupportedUpdate = 'message' | 'edited_message' | 'deleted_message' | 'user_update';

export interface MessageContext {
	chatName: string | null;
	chatUsername: string | null;
	chatId: string | null;
	chatType: TelegramTriggerChatType;
	isPrivateChat: boolean;
	isGroupChat: boolean;
	isChannelChat: boolean;
	senderName: string | null;
	senderUsername: string | null;
	senderId: string | null;
	senderIsBot: boolean | null;
}

export type MediaPayloadEntry = {
	messageId: string;
	groupedId?: string;
	messageType?: TelegramTriggerPayload['messageType'];
	fileName?: string;
	fileExtension?: string;
	mimeType?: string;
	size?: string;
	bytes?: number;
	binaryProperty?: string;
	binaryBase64?: string;
};

// Generic type for node functions (either Trigger or Execute)
export type NodeExecutionContext = ITriggerFunctions | IExecuteFunctions;

export function buildTriggerPayload(
	updateType: SupportedUpdate | undefined,
	message: Api.Message,
	messageContext: MessageContext,
): TelegramTriggerPayload {
	const mediaFiles = collectMediaPayloadEntries([message]);
	const primaryMedia = mediaFiles[0];
	const fileSizeBytes = primaryMedia?.bytes;
	const fileSizeHuman = primaryMedia?.size;
	const hasMedia = mediaFiles.length > 0;
	const messageType = detectMessageType(message);
	const rawMessage = getMessageText(message);
	const hasWebPreview = detectWebPreview(message);

	return {
		updateType,
		groupedId: normalizeGroupedId(message.groupedId),
		mediaCount: mediaFiles.length,
		message: getRichMessageText(message),
		rawMessage,
		date: toIsoDate(message.date),
		editDate: toIsoDate(message.editDate),
		chatName: messageContext.chatName,
		chatId: messageContext.chatId,
		chatType: messageContext.chatType,
		senderName: messageContext.senderName,
		senderId: messageContext.senderId,
		senderIsBot: messageContext.senderIsBot,
		messageId: String(message.id),
		isPrivate: messageContext.isPrivateChat,
		isGroup: messageContext.isGroupChat,
		isChannel: messageContext.isChannelChat,
		isOutgoing: Boolean(message.out),
		messageType,
		hasMedia,
		fileName: primaryMedia?.fileName,
		fileExtension: primaryMedia?.fileExtension,
		mimeType: primaryMedia?.mimeType,
		size: fileSizeHuman,
		bytes: fileSizeBytes,
		mediaFiles,
		hasWebPreview,
	};
}

export function buildAlbumTriggerPayload(
	updateType: SupportedUpdate | undefined,
	messages: Api.Message[],
	messageContext: MessageContext,
): TelegramTriggerPayload {
	const primaryMessage =
		messages.find((message) => (message.message ?? message.text ?? '').trim()) ?? messages[0];
	const mediaFiles = collectMediaPayloadEntries(messages);
	const primaryMedia = mediaFiles[0];

	return {
		updateType,
		groupedId: normalizeGroupedId(primaryMessage.groupedId),
		mediaCount: mediaFiles.length,
		message: getRichMessageText(primaryMessage),
		rawMessage: getMessageText(primaryMessage),
		date: toIsoDate(primaryMessage.date),
		editDate: toIsoDate(primaryMessage.editDate),
		chatName: messageContext.chatName,
		chatId: messageContext.chatId,
		chatType: messageContext.chatType,
		senderName: messageContext.senderName,
		senderId: messageContext.senderId,
		senderIsBot: messageContext.senderIsBot,
		messageId: String(primaryMessage.id),
		isPrivate: messageContext.isPrivateChat,
		isGroup: messageContext.isGroupChat,
		isChannel: messageContext.isChannelChat,
		isOutgoing: Boolean(primaryMessage.out),
		messageType: primaryMedia?.messageType ?? detectMessageType(primaryMessage),
		hasMedia: mediaFiles.length > 0,
		fileName: primaryMedia?.fileName,
		fileExtension: primaryMedia?.fileExtension,
		mimeType: primaryMedia?.mimeType,
		size: primaryMedia?.size,
		bytes: primaryMedia?.bytes,
		mediaFiles,
		hasWebPreview: messages.some((message) => detectWebPreview(message)),
	};
}

export function buildSharedMessagePayload(
	message: Api.Message,
	messageContext: MessageContext,
): TelegramTriggerPayload {
	return buildTriggerPayload(undefined, message, messageContext);
}

export function buildSharedAlbumPayload(
	messages: Api.Message[],
	messageContext: MessageContext,
): TelegramTriggerPayload {
	return buildAlbumTriggerPayload(undefined, messages, messageContext);
}

export async function buildUserUpdatePayload(
	event: UserUpdateEvent,
): Promise<TelegramTriggerPayload> {
	const user = await event.getUser().catch(() => undefined);
	const statusClassName = getTelegramClassName(event.status);
	const actionClassName = getTelegramClassName(event.action);
	const userId = normalizeString(event.userId);
	const chatId = getUserUpdateChatId(event.originalUpdate);
	const chatType = detectUserUpdateChatType(event.originalUpdate);
	const chatName = user ? getEntityLabel(user) : chatId;
	const senderName = user ? getEntityLabel(user) : userId;
	const statusExpires =
		event.status instanceof Api.UserStatusOnline ? toUnixNumber(event.status.expires) : undefined;
	const statusWasOnline =
		event.status instanceof Api.UserStatusOffline
			? toUnixNumber(event.status.wasOnline)
			: undefined;
	const statusByMe =
		event.status instanceof Api.UserStatusRecently ||
		event.status instanceof Api.UserStatusLastWeek ||
		event.status instanceof Api.UserStatusLastMonth
			? (event.status.byMe ?? undefined)
			: undefined;

	const payload: TelegramTriggerPayload = {
		updateType: 'user_update',
		date: toIsoDate(new Date()),
		chatName,
		chatId,
		chatType,
		senderName,
		senderId: userId,
		senderIsBot: user instanceof Api.User ? Boolean(user.bot) : null,
		isPrivate: chatType === 'user' || chatType === 'bot',
		isGroup: chatType === 'group' || chatType === 'supergroup',
		isChannel: chatType === 'channel',
		messageType: 'other',
		hasMedia: false,
		raw: {
			eventName: event._eventName,
			originalUpdateType: getTelegramClassName(event.originalUpdate),
		},
	};

	payload.userId = userId ?? undefined;
	payload.user = {
		id: userId,
		username: user instanceof Api.User ? (user.username ?? null) : null,
		firstName: user instanceof Api.User ? (user.firstName ?? null) : null,
		lastName: user instanceof Api.User ? (user.lastName ?? null) : null,
		phone: user instanceof Api.User ? (user.phone ?? null) : null,
		isBot: user instanceof Api.User ? Boolean(user.bot) : null,
		isVerified: user instanceof Api.User ? Boolean(user.verified) : null,
		isScam: user instanceof Api.User ? Boolean(user.scam) : null,
		isFake: user instanceof Api.User ? Boolean(user.fake) : null,
		isPremium: user instanceof Api.User ? Boolean(user.premium) : null,
		isSupport: user instanceof Api.User ? Boolean(user.support) : null,
		isMutualContact: user instanceof Api.User ? Boolean(user.mutualContact) : null,
		isContact: user instanceof Api.User ? Boolean(user.contact) : null,
		isDeleted: user instanceof Api.User ? Boolean(user.deleted) : null,
		langCode: user instanceof Api.User ? (user.langCode ?? null) : null,
	};

	payload.status = {
		className: statusClassName,
		online: event.online,
		offline: event.offline,
		recently: event.recently,
		withinWeeks: event.withinWeeks,
		withinMonths: event.withinMonths,
		expires: statusExpires,
		expiresAt: event.until ? event.until.toISOString() : null,
		wasOnline: statusWasOnline,
		lastSeenAt: event.lastSeen ? event.lastSeen.toISOString() : null,
		byMe: statusByMe,
	};

	payload.action = {
		className: actionClassName,
		typing: event.typing,
		cancel: event.cancel,
		recording: event.recording,
		uploading: event.uploading,
		audio: event.audio,
		video: event.video,
		round: event.round,
		photo: event.photo,
		document: event.document,
		geo: event.geo,
		contact: event.contact,
		playing: event.playing,
		sticker: event.sticker,
		uploadProgress: event.uploadProgress,
	};

	return payload;
}

export async function resolveMessageContext(message: Api.Message): Promise<MessageContext> {
	const [chatResult, senderResult] = await Promise.allSettled([
		message.getChat?.(),
		message.getSender?.(),
	]);

	const chatEntity = chatResult.status === 'fulfilled' ? chatResult.value : undefined;
	const senderEntity = senderResult.status === 'fulfilled' ? senderResult.value : undefined;

	return resolveMessageContextFromEntities(
		message,
		chatEntity as TelegramEntity,
		senderEntity as TelegramEntity,
	);
}

export function resolveMessageContextFromEntities(
	message: Api.Message,
	chatEntity: TelegramEntity | undefined,
	senderEntity?: TelegramEntity | undefined,
): MessageContext {
	const chatType = detectChatType(message, chatEntity, senderEntity);

	return {
		chatName: getEntityLabel(chatEntity) ?? fallbackChatName(message),
		chatUsername: getEntityUsername(chatEntity),
		chatId: normalizeString(message.chatId),
		chatType,
		isPrivateChat: isPrivateChatType(chatType),
		isGroupChat: isGroupChatType(chatType),
		isChannelChat: isChannelChatType(chatType),
		senderName: getEntityLabel(senderEntity) ?? fallbackSenderName(message, chatEntity),
		senderUsername: getEntityUsername(senderEntity),
		senderId: normalizeString(message.senderId),
		senderIsBot: senderEntity instanceof Api.User ? Boolean(senderEntity.bot) : null,
	};
}

export async function createSharedBinaryExecutionItem(
	context: NodeExecutionContext,
	messages: Api.Message[],
	payload: TelegramTriggerPayload,
	disableBinary: boolean,
): Promise<INodeExecutionData> {
	const item: INodeExecutionData = {
		json: {
			...payload,
			disableBinary,
		} as unknown as IDataObject,
	};

	const mediaMessages = messages.filter((message) =>
		shouldAttachBinary(detectMessageType(message)),
	);
	if (mediaMessages.length === 0 || disableBinary) {
		return item;
	}

	const mediaFiles = Array.isArray(item.json.mediaFiles)
		? ([...(item.json.mediaFiles as IDataObject[])] as unknown as MediaPayloadEntry[])
		: [];
	const mediaFileIndexByMessageId = new Map<string, number>();

	for (let index = 0; index < mediaFiles.length; index++) {
		const messageId = mediaFiles[index].messageId;
		if (messageId) {
			mediaFileIndexByMessageId.set(messageId, index);
		}
	}

	try {
		item.binary = {};

		for (let index = 0; index < mediaMessages.length; index++) {
			const currentMessage = mediaMessages[index];
			const currentMessageType = detectMessageType(currentMessage);
			const downloadedMedia = await downloadBinaryData(context, currentMessage, currentMessageType);

			if (!downloadedMedia) {
				continue;
			}

			const binaryProperty = index === 0 ? 'data' : `data_${index + 1}`;
			item.binary[binaryProperty] = downloadedMedia.binaryData;

			const targetIndex = mediaFileIndexByMessageId.get(String(currentMessage.id)) ?? index;
			const currentMediaFile =
				mediaFiles[targetIndex] ??
				({
					messageId: String(currentMessage.id),
					messageType: currentMessageType,
				} satisfies MediaPayloadEntry);
			mediaFiles[targetIndex] = {
				...currentMediaFile,
				binaryProperty,
				fileName: downloadedMedia.fileName,
				fileExtension: getFileExtension(downloadedMedia.fileName),
				mimeType: downloadedMedia.mimeType,
				binaryBase64: downloadedMedia.buffer.toString('base64'),
			};
		}

		if (mediaFiles.length > 0) {
			item.json.mediaFiles = mediaFiles as unknown as IDataObject[];
			const firstMedia = mediaFiles[0];
			item.json.fileName = firstMedia.fileName;
			item.json.fileExtension = firstMedia.fileExtension;
			item.json.mimeType = firstMedia.mimeType;
		}

		if (Object.keys(item.binary).length === 0) {
			delete item.binary;
		}
	} catch (error) {
		item.json.mediaDownloadError = getErrorMessage(error);
	}

	return item;
}

// Internal Helpers

function collectMediaPayloadEntries(messages: Api.Message[]): MediaPayloadEntry[] {
	return messages
		.map((message) => createMediaPayloadEntry(message))
		.filter((entry): entry is MediaPayloadEntry => entry !== null);
}

function createMediaPayloadEntry(message: Api.Message): MediaPayloadEntry | null {
	const messageType = detectMessageType(message);
	if (!shouldAttachBinary(messageType)) {
		return null;
	}

	const fileSizeBytes = extractMediaFileSize(message);
	const mediaMetadata = extractMediaMetadata(message, messageType);

	return {
		messageId: String(message.id),
		groupedId: normalizeGroupedId(message.groupedId),
		messageType,
		fileName: mediaMetadata.fileName,
		fileExtension: mediaMetadata.fileExtension,
		mimeType: mediaMetadata.mimeType,
		size: fileSizeBytes ? formatBytesToHuman(fileSizeBytes) : undefined,
		bytes: fileSizeBytes,
	};
}

export function detectMessageType(message: Api.Message): TelegramTriggerPayload['messageType'] {
	if (message.photo) {
		return 'photo';
	}

	if (message.video) {
		return 'video';
	}

	if (message.document) {
		return 'document';
	}
	if (message.media && typeof message.media === 'object' && 'document' in message.media) {
		const doc = (message.media as { document?: Api.Document }).document;
		if (doc) return 'document';
	}

	if ((message.message ?? '').trim()) {
		return 'text';
	}

	return 'other';
}

export function detectWebPreview(message: Api.Message): boolean {
	if (!message.media) {
		return false;
	}

	if (message.media instanceof Api.MessageMediaWebPage) {
		return !(message.media.webpage instanceof Api.WebPageEmpty);
	}

	if ('webpage' in message.media) {
		return !!message.media.webpage && !(message.media.webpage instanceof Api.WebPageEmpty);
	}

	return false;
}

function shouldAttachBinary(messageType: TelegramTriggerPayload['messageType']): boolean {
	return messageType === 'photo' || messageType === 'video' || messageType === 'document';
}

export async function downloadBinaryData(
	context: NodeExecutionContext,
	message: Api.Message,
	messageType: TelegramTriggerPayload['messageType'],
): Promise<{
	binaryData: IBinaryData;
	buffer: Buffer;
	fileName: string;
	mimeType: string;
} | null> {
	const downloadResult = await message.downloadMedia({} as never);
	const buffer = await toBuffer(downloadResult);

	if (!buffer) {
		return null;
	}

	const document = message.document;
	const mimeType =
		messageType === 'photo' ? 'image/jpeg' : (document?.mimeType ?? 'application/octet-stream');
	const fileName =
		getDocumentFileName(document) ?? inferFileName(messageType, message.id, mimeType);
	const binaryData = await context.helpers.prepareBinaryData(buffer, fileName, mimeType);

	return {
		binaryData,
		buffer,
		fileName,
		mimeType,
	};
}

async function toBuffer(value: unknown): Promise<Buffer | null> {
	if (!value) return null;
	if (Buffer.isBuffer(value)) return value;
	if (value instanceof Uint8Array) return Buffer.from(value);
	if (typeof value === 'string') return Buffer.from(value);

	if (
		typeof value === 'object' &&
		value !== null &&
		'on' in value &&
		typeof (value as { on: unknown }).on === 'function'
	) {
		return await new Promise((resolve, reject) => {
			const chunks: Buffer[] = [];
			const stream = value as { on: (event: string, cb: (...args: unknown[]) => void) => void };
			stream.on('data', (chunk: unknown) => chunks.push(Buffer.from(chunk as Uint8Array)));
			stream.on('end', () => resolve(Buffer.concat(chunks)));
			stream.on('error', (err: unknown) => reject(err));
		});
	}

	if (
		typeof value === 'object' &&
		value !== null &&
		'getReader' in value &&
		typeof (value as { getReader: unknown }).getReader === 'function'
	) {
		const reader = (
			value as { getReader: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> } }
		).getReader();
		const chunks: Uint8Array[] = [];
		while (true) {
			const { done, value: chunk } = await reader.read();
			if (done) break;
			if (chunk) chunks.push(chunk);
		}
		return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
	}

	return null;
}

function getDocumentFileName(document: Api.Document | undefined): string | null {
	if (!document) return null;
	for (const attribute of document.attributes) {
		if (attribute instanceof Api.DocumentAttributeFilename) {
			return attribute.fileName;
		}
	}
	return null;
}

function extractMediaMetadata(
	message: Api.Message,
	messageType: TelegramTriggerPayload['messageType'],
): {
	fileName?: string;
	fileExtension?: string;
	mimeType?: string;
} {
	if (!shouldAttachBinary(messageType)) return {};

	const document = message.document;
	const mimeType =
		messageType === 'photo' ? 'image/jpeg' : (document?.mimeType ?? 'application/octet-stream');
	const fileName =
		getDocumentFileName(document) ?? inferFileName(messageType, message.id, mimeType);

	return {
		fileName,
		fileExtension: getFileExtension(fileName),
		mimeType,
	};
}

function inferFileName(
	messageType: TelegramTriggerPayload['messageType'],
	messageId: number,
	mimeType: string,
): string {
	if (messageType === 'photo') return `photo_${messageId}.jpg`;
	if (messageType === 'video')
		return `video_${messageId}${getExtensionFromMimeType(mimeType) || '.mp4'}`;
	return `document_${messageId}${getExtensionFromMimeType(mimeType)}`;
}

function getFileExtension(fileName: string | undefined): string | undefined {
	if (!fileName) return undefined;
	const match = /\.([^.]+)$/.exec(fileName);
	return match ? `.${match[1]}` : undefined;
}

function getExtensionFromMimeType(mimeType: string): string {
	const knownExtensions: Record<string, string> = {
		'application/pdf': '.pdf',
		'application/zip': '.zip',
		'image/gif': '.gif',
		'image/jpeg': '.jpg',
		'image/png': '.png',
		'text/plain': '.txt',
		'video/mp4': '.mp4',
		'video/quicktime': '.mov',
	};
	return knownExtensions[mimeType] ?? '';
}

function extractMediaFileSize(message: Api.Message): number | undefined {
	const extractSize = (obj: unknown): number | undefined => {
		if (!obj || typeof obj !== 'object') return undefined;
		if (Array.isArray(obj)) {
			let max = 0;
			for (const item of obj) {
				const size = extractSize(item);
				if (size !== undefined && size > max) max = size;
				if (typeof item === 'number' && item > max) max = item;
			}
			return max > 0 ? max : undefined;
		}
		const record = obj as Record<string, unknown>;
		if ('sizes' in record) return extractSize(record.sizes);
		if ('size' in record) {
			const val = record.size;
			if (typeof val === 'number') return val;
			if (typeof val === 'bigint') return Number(val);
			if (typeof val === 'object' && val !== null && 'toString' in val) {
				const str = val.toString();
				if (/^\d+$/.test(str)) return Number(str);
			}
		}
		return undefined;
	};

	const msgRec = message as unknown as Record<string, unknown>;
	const candidates = [
		msgRec.document,
		msgRec.video,
		msgRec.audio,
		msgRec.voice,
		msgRec.photo,
		message.media,
	];

	for (const candidate of candidates) {
		const size = extractSize(candidate);
		if (size !== undefined && size > 0) return size;
	}
	return undefined;
}

function detectChatType(
	message: Api.Message,
	chatEntity: TelegramEntity | undefined,
	senderEntity: TelegramEntity | undefined,
): TelegramTriggerChatType {
	if (chatEntity instanceof Api.User) return chatEntity.bot ? 'bot' : 'user';
	if (chatEntity instanceof Api.Chat || chatEntity instanceof Api.ChatForbidden) return 'group';
	if (chatEntity instanceof Api.Channel || chatEntity instanceof Api.ChannelForbidden)
		return chatEntity.broadcast ? 'channel' : 'supergroup';
	if (message.peerId instanceof Api.PeerUser)
		return senderEntity instanceof Api.User && senderEntity.bot ? 'bot' : 'user';
	if (message.peerId instanceof Api.PeerChat) return 'group';
	if (message.peerId instanceof Api.PeerChannel) return message.post ? 'channel' : 'supergroup';
	return 'unknown';
}

function isPrivateChatType(chatType: TelegramTriggerChatType): boolean {
	return chatType === 'user' || chatType === 'bot';
}
function isGroupChatType(chatType: TelegramTriggerChatType): boolean {
	return chatType === 'group' || chatType === 'supergroup';
}
function isChannelChatType(chatType: TelegramTriggerChatType): boolean {
	return chatType === 'channel';
}

function getEntityLabel(entity: TelegramEntity | undefined): string | null {
	if (
		entity instanceof Api.Channel ||
		entity instanceof Api.ChannelForbidden ||
		entity instanceof Api.Chat ||
		entity instanceof Api.ChatForbidden
	)
		return entity.title ?? null;
	if (entity instanceof Api.User) {
		const fullName = [entity.firstName, entity.lastName].filter(Boolean).join(' ').trim();
		return fullName || entity.username || null;
	}
	return null;
}

function getEntityUsername(entity: TelegramEntity | undefined): string | null {
	if (entity instanceof Api.Channel || entity instanceof Api.User) return entity.username ?? null;
	return null;
}

function fallbackChatName(message: Api.Message): string | null {
	if (message.isPrivate && message.senderId) return message.senderId.toString();
	return normalizeString(message.chatId);
}

function fallbackSenderName(
	message: Api.Message,
	chatEntity: TelegramEntity | undefined,
): string | null {
	if (message.isChannel && !message.senderId)
		return getEntityLabel(chatEntity) ?? normalizeString(message.chatId);
	return normalizeString(message.senderId);
}

function normalizeString(value: unknown): string | null {
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint')
		return String(value);
	if (typeof value === 'object' && value !== null && 'toString' in value) {
		const s = value.toString();
		if (typeof s === 'string' && s !== '[object Object]') return s;
	}
	return null;
}

function normalizeGroupedId(value: unknown): string | undefined {
	const s = normalizeString(value);
	return s ?? undefined;
}

function getTelegramClassName(value: unknown): string | null {
	if (!value || typeof value !== 'object') return null;
	const maybeClassName = (value as { className?: unknown }).className;
	return typeof maybeClassName === 'string' ? maybeClassName : null;
}

function getUserUpdateChatId(originalUpdate: unknown): string | null {
	if (originalUpdate instanceof Api.UpdateChatUserTyping)
		return normalizeString(originalUpdate.chatId);
	if (originalUpdate instanceof Api.UpdateChannelUserTyping)
		return normalizeString(originalUpdate.channelId);
	return normalizeString(
		originalUpdate instanceof Api.UpdateUserStatus ? originalUpdate.userId : null,
	);
}

function detectUserUpdateChatType(originalUpdate: unknown): TelegramTriggerChatType {
	if (originalUpdate instanceof Api.UpdateChatUserTyping) return 'group';
	if (originalUpdate instanceof Api.UpdateChannelUserTyping) return 'channel';
	return 'user';
}

function toUnixNumber(value: unknown): number | undefined {
	if (typeof value === 'number') return value;
	if (typeof value === 'bigint') return Number(value);
	if (typeof value === 'object' && value !== null && 'toString' in value) {
		const numericValue = Number(value.toString());
		return Number.isFinite(numericValue) ? numericValue : undefined;
	}
	return undefined;
}

function getMessageText(message: Api.Message): string {
	return message.message ?? message.text ?? '';
}
function getRichMessageText(message: Api.Message): string {
	const t = getMessageText(message);
	const entities = Array.isArray(message.entities) ? message.entities : [];
	return renderTelegramEntities(t, entities as never);
}

export function toIsoDate(value: Date | number | undefined): string | null {
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'number') return new Date(value * 1000).toISOString();
	return null;
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
