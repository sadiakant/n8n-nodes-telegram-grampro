import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { getClient } from '../core/clientManager';
import { safeExecute } from '../core/floodWaitHandler';
import { withRateLimit } from '../core/rateLimiter';
import { Api } from 'teleproto';
import bigInt from 'big-integer';
import { CustomFile } from 'teleproto/client/uploads';

import { logger } from '../core/logger';
import { prepareTelegramTextInput, renderTelegramEntities } from '../core/messageFormatting';
import type { TelegramClientInstance, TelegramCredentials, TelegramEntity } from '../core/types';
import {
	buildSharedAlbumPayload,
	buildSharedMessagePayload,
	resolveMessageContextFromEntities,
} from '../core/payloadBuilders';

type Stringable = { toString: () => string } | string | number | bigint;

type TelegramPeerRef = {
	userId?: Stringable;
	chatId?: Stringable;
	channelId?: Stringable;
	user_id?: Stringable;
	chat_id?: Stringable;
	channel_id?: Stringable;
	toString?: () => string;
};

type TelegramEntityView = {
	id?: Stringable;
	accessHash?: Stringable;
	access_hash?: Stringable;
	className?: string;
	_?: string;
	title?: string;
	username?: string;
	firstName?: string;
	lastName?: string;
	broadcast?: boolean;
	megagroup?: boolean;
	creator?: boolean;
	adminRights?: {
		deleteMessages?: boolean;
		delete_messages?: boolean;
	} | null;
	admin_rights?: {
		deleteMessages?: boolean;
		delete_messages?: boolean;
	} | null;
};

type TelegramDocumentAttributeView = {
	className?: string;
	fileName?: string;
	text?: string;
};

type TelegramMessageEntityView = {
	className?: string;
	_?: string;
	offset?: number;
	length?: number;
	url?: string;
	userId?: Stringable;
	user_id?: Stringable;
	language?: string;
};

type TelegramPollAnswerView = {
	text?: string;
};

type TelegramPollView = {
	question?: string;
	answers?: TelegramPollAnswerView[];
	publicVoters?: boolean;
	multipleChoice?: boolean;
	quiz?: boolean;
};

type TelegramMediaView = {
	photo?: {
		id?: Stringable;
		accessHash?: Stringable;
		fileReference?: Buffer | Uint8Array;
	};
	document?: {
		mimeType?: string;
		attributes?: TelegramDocumentAttributeView[];
	};
	video?: unknown;
	geo?: {
		lat?: number;
		long?: number;
	};
	contact?: {
		phoneNumber?: string;
		firstName?: string;
		lastName?: string;
		vcard?: string;
	};
	poll?: TelegramPollView;
	dice?: {
		emoji?: string;
	};
	className?: string;
	_?: string;
};

type TelegramMessageView = {
	id: number;
	message?: string;
	text?: string;
	caption?: string;
	date: number;
	out?: boolean;
	media?: TelegramMediaView;
	poll?: TelegramPollView;
	dice?: {
		emoji?: string;
	};
	sticker?: unknown;
	voice?: unknown;
	audio?: unknown;
	entities?: unknown[];
	fromId?: TelegramPeerRef;
	peerId?: TelegramPeerRef;
	replyTo?: {
		replyToMsgId?: number;
	};
	replyToMsgId?: number;
	groupedId?: Stringable;
	post_author?: string;
	chatId?: Stringable;
	_?: string;
};

type CopyOptions = {
	includeCaption?: boolean;
	downloadTimeout?: number;
};

type StreamLike = {
	on: (event: 'data' | 'end' | 'error', listener: (...args: unknown[]) => void) => void;
};

type ReaderLike = {
	read: () => Promise<{ done: boolean; value: Uint8Array }>;
};

type ReadableStreamLike = {
	getReader: () => ReaderLike;
};

function toIdString(value: Stringable | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}

	return value.toString();
}

function toBigIntValue(value: Stringable | undefined, fallback = 0) {
	return bigInt(value !== undefined ? value.toString() : fallback.toString());
}

function toBytes(value: Buffer | Uint8Array | undefined): Buffer {
	return value ? Buffer.from(value) : Buffer.alloc(0);
}

function getPeerIdString(peer?: TelegramPeerRef): string | null {
	return (
		toIdString(peer?.userId) ||
		toIdString(peer?.chatId) ||
		toIdString(peer?.channelId) ||
		toIdString(peer?.user_id) ||
		toIdString(peer?.chat_id) ||
		toIdString(peer?.channel_id) ||
		(peer?.toString ? peer.toString() : null) ||
		null
	);
}

function getMessageText(message: TelegramMessageView | null | undefined, fallback = ''): string {
	return message?.message ?? message?.text ?? message?.caption ?? fallback;
}

function getRichMessageText(
	message: TelegramMessageView | null | undefined,
	fallback = '',
): string {
	const text = getMessageText(message, fallback);
	return renderTelegramEntities(text, normalizeMessageEntities(message?.entities));
}

function normalizeMessageEntities(entities: unknown[] | undefined): TelegramMessageEntityView[] {
	if (!Array.isArray(entities)) {
		return [];
	}

	return entities.filter(
		(entity): entity is TelegramMessageEntityView => typeof entity === 'object' && entity !== null,
	);
}

function getEntityLabel(entity: TelegramEntityView | null | undefined): string {
	if (!entity) {
		return 'Unknown';
	}

	if (entity.title) {
		return entity.title;
	}

	const fullName = [entity.firstName, entity.lastName].filter(Boolean).join(' ');
	if (fullName) {
		return fullName;
	}

	return entity.username || 'Unknown';
}

function getFormattedEntityId(
	entity: TelegramEntityView | null | undefined,
	fallback: string,
): string {
	const rawId = toIdString(entity?.id);
	if (!rawId) {
		return fallback;
	}

	if (entity?.className === 'Channel' || entity?._ === 'channel') {
		return `-100${rawId}`;
	}

	if (entity?.className === 'Chat' || entity?._ === 'chat') {
		return `-${rawId}`;
	}

	return rawId;
}

function isResolvablePeerObject(value: unknown): boolean {
	return typeof value === 'object' && value !== null;
}

function normalizePeerReference(rawId: unknown): string | unknown {
	if (typeof rawId !== 'string') {
		return rawId;
	}

	let normalized = rawId.trim();
	if (!normalized) {
		return normalized;
	}

	const topicMatch = normalized.match(
		/(?:https?:\/\/)?t\.me\/(?:c\/)?([a-zA-Z0-9_-]+)(?:\/\d+)?\/?$/i,
	);
	if (topicMatch) {
		normalized = topicMatch[1];
	}

	if (/^\d+$/.test(normalized)) {
		return normalized;
	}

	return normalized;
}

function getInputReferenceAliases(rawId: string): string[] {
	const trimmed = rawId.trim();
	if (!trimmed) {
		return [];
	}

	const aliases = new Set<string>([trimmed]);

	if (trimmed.startsWith('@')) {
		aliases.add(trimmed.slice(1));
	} else if (/^[a-zA-Z][a-zA-Z0-9_]{2,}$/.test(trimmed)) {
		aliases.add(`@${trimmed}`);
	}

	if (/^-100\d+$/.test(trimmed)) {
		aliases.add(trimmed.slice(4));
	} else if (/^-\d+$/.test(trimmed)) {
		aliases.add(trimmed.slice(1));
	} else if (/^\d+$/.test(trimmed)) {
		aliases.add(`-${trimmed}`);
		aliases.add(`-100${trimmed}`);
	}

	return Array.from(aliases);
}

function getEntityReferenceAliases(entity: TelegramEntityView): Set<string> {
	const aliases = new Set<string>();
	const rawId = toIdString(entity.id);
	if (rawId) {
		aliases.add(rawId);
		if (entity.className === 'Channel' || entity._ === 'channel') {
			aliases.add(`-100${rawId}`);
		}
		if (entity.className === 'Chat' || entity._ === 'chat') {
			aliases.add(`-${rawId}`);
		}
	}

	if (typeof entity.username === 'string' && entity.username.trim()) {
		aliases.add(entity.username.trim().toLowerCase());
		aliases.add(`@${entity.username.trim().toLowerCase()}`);
	}

	return aliases;
}

function matchesEntityReference(entity: TelegramEntityView, rawReference: string): boolean {
	const inputAliases = getInputReferenceAliases(rawReference).map((candidate) =>
		candidate.toLowerCase(),
	);
	const entityAliases = getEntityReferenceAliases(entity);

	return inputAliases.some((candidate) => entityAliases.has(candidate));
}

function isChannelEntity(entity: TelegramEntityView | null | undefined): boolean {
	return !!entity && (entity.className === 'Channel' || entity._ === 'channel');
}

function isChatEntity(entity: TelegramEntityView | null | undefined): boolean {
	return !!entity && (entity.className === 'Chat' || entity._ === 'chat');
}

function detectPeerKind(
	entity: TelegramEntityView | null,
	peer: unknown,
): 'channel' | 'chat' | 'user' | 'unknown' {
	if (isChannelEntity(entity)) return 'channel';
	if (isChatEntity(entity)) return 'chat';
	if (entity && (entity.className === 'User' || entity._ === 'user')) return 'user';

	const candidate = peer as
		| {
				channelId?: unknown;
				channel_id?: unknown;
				chatId?: unknown;
				chat_id?: unknown;
				userId?: unknown;
				user_id?: unknown;
		  }
		| undefined;

	if (candidate?.channelId !== undefined || candidate?.channel_id !== undefined) return 'channel';
	if (candidate?.chatId !== undefined || candidate?.chat_id !== undefined) return 'chat';
	if (candidate?.userId !== undefined || candidate?.user_id !== undefined) return 'user';
	return 'unknown';
}

function canDeleteHistoryForEveryone(entity: TelegramEntityView | null): boolean | null {
	if (!entity) return null;
	if (entity.creator) return true;

	const rights = entity.adminRights || entity.admin_rights;
	if (!rights) return false;

	return !!(rights.deleteMessages || rights.delete_messages);
}

function getRpcErrorCode(message: string): string {
	const errorCodeMatch = message.match(/\b[A-Z_]{3,}\b/);
	return errorCodeMatch?.[0] || 'DELETE_HISTORY_FAILED';
}

function isAdminRequiredErrorCode(errorCode: string): boolean {
	return (
		errorCode === 'CHAT_ADMIN_REQUIRED' ||
		errorCode === 'RIGHT_FORBIDDEN' ||
		errorCode === 'MESSAGE_DELETE_FORBIDDEN'
	);
}

function toInputChannel(channelLike: unknown): Api.InputChannel | null {
	const candidate = channelLike as
		| {
				id?: Stringable;
				channelId?: Stringable;
				channel_id?: Stringable;
				accessHash?: Stringable;
				access_hash?: Stringable;
		  }
		| undefined;
	if (!candidate) {
		return null;
	}

	const rawChannelId = candidate.channelId ?? candidate.channel_id ?? candidate.id;
	const rawAccessHash = candidate.accessHash ?? candidate.access_hash;
	if (rawChannelId === undefined || rawAccessHash === undefined) {
		return null;
	}

	return new Api.InputChannel({
		channelId: toBigIntValue(rawChannelId),
		accessHash: toBigIntValue(rawAccessHash),
	});
}

async function editMessageLoose(
	client: TelegramClientInstance,
	chatId: unknown,
	params: Record<string, unknown>,
): Promise<TelegramMessageView> {
	return (await client.editMessage(
		chatId as never,
		params as never,
	)) as unknown as TelegramMessageView;
}

async function getMessagesLoose(
	client: TelegramClientInstance,
	peer: unknown,
	params: Record<string, unknown>,
): Promise<TelegramMessageView[]> {
	const resolvedPeer = await resolvePeer(client, peer);
	return (await client.getMessages(
		resolvedPeer as never,
		params as never,
	)) as unknown as TelegramMessageView[];
}

async function getEntityLoose(
	client: TelegramClientInstance,
	peer: unknown,
): Promise<TelegramEntityView> {
	const resolvedPeer = await resolvePeer(client, peer);
	return (await client.getEntity(resolvedPeer as never)) as unknown as TelegramEntityView;
}

async function sendMessageLoose(
	client: TelegramClientInstance,
	peer: unknown,
	params: Record<string, unknown>,
): Promise<TelegramMessageView> {
	// Resolve the peer first to handle numeric user IDs that aren't cached
	const resolvedPeer = await resolvePeer(client, peer);
	const result = (await client.sendMessage(resolvedPeer as never, params as never)) as unknown;
	return (Array.isArray(result) ? result[0] : result) as TelegramMessageView;
}

async function forwardMessagesLoose(
	client: TelegramClientInstance,
	peer: unknown,
	params: Record<string, unknown>,
): Promise<TelegramMessageView> {
	const resolvedPeer = await resolvePeer(client, peer);
	const resolvedParams = { ...params };
	if ('fromPeer' in resolvedParams) {
		resolvedParams.fromPeer = await resolvePeer(
			client,
			(resolvedParams as { fromPeer?: unknown }).fromPeer,
		);
	}
	const result = (await client.forwardMessages(
		resolvedPeer as never,
		resolvedParams as never,
	)) as unknown;
	return (Array.isArray(result) ? result[0] : result) as TelegramMessageView;
}

async function* iterMessagesLoose(
	client: TelegramClientInstance,
	peer: unknown,
	params: Record<string, unknown>,
): AsyncIterable<TelegramMessageView> {
	const resolvedPeer = await resolvePeer(client, peer);
	for await (const message of client.iterMessages(
		resolvedPeer as never,
		params as never,
	) as unknown as AsyncIterable<TelegramMessageView>) {
		yield message;
	}
}

type DialogView = {
	entity?: TelegramEntityView;
	id?: Stringable;
	username?: string;
};

function iterDialogsLoose(
	client: TelegramClientInstance,
	params: Record<string, unknown>,
): AsyncIterable<DialogView> {
	return client.iterDialogs(params as never) as unknown as AsyncIterable<DialogView>;
}

async function downloadMediaLoose(
	client: TelegramClientInstance,
	target: unknown,
	params: Record<string, unknown>,
): Promise<unknown> {
	return await client.downloadMedia(target as never, params as never);
}

export async function messageRouter(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const creds = (await this.getCredentials('telegramGramProApi')) as TelegramCredentials;

	const client = await getClient(creds.apiId, creds.apiHash, creds.session);

	switch (operation) {
		case 'sendText':
			return sendText.call(this, client, i);
		case 'forwardMessage':
			return forwardMessage.call(this, client, i);
		case 'getHistory':
			return getHistory.call(this, client, i);
		case 'editMessage':
			return editMessage.call(this, client, i);
		case 'deleteMessage':
			return deleteMessage.call(this, client, i);
		case 'deleteHistory':
			return deleteHistory.call(this, client, i);
		case 'pinMessage':
			return pinMessage.call(this, client, i);
		case 'unpinMessage':
			return unpinMessage.call(this, client, i);
		case 'sendPoll':
			return sendPoll.call(this, client, i);
		case 'copyMessage':
			return copyMessage.call(this, client, i);
		case 'editMessageMedia':
			return editMessageMedia.call(this, client, i);
		case 'copyRestrictedContent':
			return copyRestrictedContent.call(this, client, i);
		default:
			throw new Error(`Message operation not supported: ${operation}`);
	}
}

// --- FUNCTIONS ---

async function editMessage(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const editFromSelf = this.getNodeParameter('editFromSelf', i, false) as boolean;
	const chatId = editFromSelf ? 'me' : this.getNodeParameter('chatId', i);
	const messageId = Number(this.getNodeParameter('messageId', i));
	const textRaw = this.getNodeParameter('text', i);
	const text = typeof textRaw === 'string' ? textRaw : (textRaw ?? '').toString();
	const noWebpage = this.getNodeParameter('noWebpage', i) as boolean;
	const formattedInput = prepareTelegramTextInput(text);

	const result = await safeExecute(() =>
		editMessageLoose(client, chatId, {
			message: messageId,
			text: formattedInput.text,
			parseMode: formattedInput.parseMode,
			linkPreview: !noWebpage,
		}),
	);

	// Fetch detailed message info after edit
	let detailedMessage: TelegramMessageView | null = null;
	try {
		const messages = await getMessagesLoose(client, chatId, { ids: [result.id] });
		if (messages && messages.length > 0) {
			detailedMessage = messages[0];
		}
	} catch (error) {
		logger.warn('Failed to fetch detailed message info after edit: ' + (error as Error).message);
	}

	let sourceName = 'Unknown';
	let formattedSourceId = typeof chatId === 'string' ? chatId : '';
	try {
		const entity = await getEntityLoose(client, chatId);
		if (entity) {
			sourceName = getEntityLabel(entity);
			formattedSourceId = getFormattedEntityId(entity, formattedSourceId);
		}
	} catch {
		/* intentionally ignoring */
	}

	const mediaInfo = extractMediaInfo(detailedMessage?.media);
	const messageDate = detailedMessage?.date;
	const replyToId = detailedMessage?.replyTo?.replyToMsgId || null;
	const isOutgoing = detailedMessage?.out !== undefined ? detailedMessage.out : true;
	const finalRawText = getMessageText(detailedMessage, getMessageText(result, text));
	const finalText = getRichMessageText(detailedMessage, getRichMessageText(result, text));

	return [
		{
			json: {
				success: true,
				message: 'Message Edited successfully',
				id: result.id,
				sourceName,
				sourceId: formattedSourceId,
				text: finalText,
				rawText: finalRawText,
				date: messageDate,
				humanDate: messageDate ? formatDateWithTime(new Date(messageDate * 1000)) : null,
				fromId: getPeerIdString(detailedMessage?.fromId),
				chatId: formattedSourceId,
				isReply: !!replyToId,
				isOutgoing,
				direction: isOutgoing ? 'sent' : 'received',
				hasMedia: mediaInfo.hasMedia,
				mediaType: getMessageType(detailedMessage),
				noWebpage: noWebpage,
			},
			pairedItem: { item: i },
		},
	];
}

async function editMessageMedia(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const editMediaFromSelf = this.getNodeParameter('editMediaFromSelf', i, false) as boolean;
	const chatId = editMediaFromSelf ? 'me' : (this.getNodeParameter('chatId', i) as string);
	const messageId = Number(this.getNodeParameter('messageId', i));
	const media = this.getNodeParameter('media', i);
	const captionInput = this.getNodeParameter('caption', i, '') as string;
	const captionEntitiesInput = this.getNodeParameter('captionEntities', i, []) as unknown[];

	let finalCaption = captionInput;
	let finalEntities = captionEntitiesInput;
	let debugInfo = 'Using new caption';
	const formattedCaptionInput = prepareTelegramTextInput(captionInput);

	if (!captionInput || captionInput.trim() === '') {
		try {
			const messages = await getMessagesLoose(client, chatId, { ids: [messageId] });
			if (messages && messages.length > 0 && messages[0]) {
				const msg = messages[0];
				// Only preserve original caption if it exists
				finalCaption = getMessageText(msg, captionInput);
				finalEntities = msg.entities || captionEntitiesInput;
				debugInfo = 'Successfully preserved original text';
			} else {
				debugInfo = `Error: Message ${messageId} not found in chat ${chatId}. Check your 'Chat ID' field!`;
			}
		} catch (error) {
			debugInfo = `Fetch error: ${(error as Error).message}`;
		}
	}

	const result = await safeExecute(() =>
		editMessageLoose(client, chatId, {
			message: messageId,
			file: media,
			text:
				finalEntities && finalEntities.length > 0
					? finalCaption
					: formattedCaptionInput.text || finalCaption,
			parseMode:
				finalEntities && finalEntities.length > 0 ? undefined : formattedCaptionInput.parseMode,
			formattingEntities: finalEntities && finalEntities.length > 0 ? finalEntities : undefined,
		}),
	);

	// Get detailed message information after editing
	let detailedMessage: TelegramMessageView | null = null;
	try {
		const messages = await getMessagesLoose(client, chatId, { ids: [result.id] });
		if (messages && messages.length > 0) {
			detailedMessage = messages[0];
		}
	} catch (error) {
		logger.warn('Failed to fetch detailed message info after edit: ' + (error as Error).message);
	}

	return [
		{
			json: {
				success: true,
				id: result.id,
				text: getRichMessageText(result),
				rawText: getMessageText(result),
				debug_logic: debugInfo,
				target_chat: chatId,
				...(detailedMessage && {
					sourceName: 'Unknown',
					sourceId: chatId,
					date: detailedMessage.date,
					humanDate: formatDateWithTime(new Date(detailedMessage.date * 1000)),
					fromId: getPeerIdString(detailedMessage.fromId),
					chatId: getPeerIdString(detailedMessage.peerId),
					isReply: !!detailedMessage.replyTo,
					isOutgoing: detailedMessage.out,
					direction: detailedMessage.out ? 'sent' : 'received',
					hasMedia: !!detailedMessage.media,
					hasWebPreview: extractMediaInfo(detailedMessage.media).hasWebPreview,
					mediaType: getMessageType(detailedMessage),
				}),
			},
			pairedItem: { item: i },
		},
	];
}

async function deleteMessage(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const chatId = this.getNodeParameter('chatId', i);
	const messageId = Number(this.getNodeParameter('messageId', i));
	const revoke = this.getNodeParameter('revoke', i) as boolean;

	// Fetch message details before deletion for rich response
	let detailedMessage: TelegramMessageView | null = null;
	try {
		const messages = await getMessagesLoose(client, chatId, { ids: [messageId] });
		if (messages && messages.length > 0) {
			detailedMessage = messages[0];
		}
	} catch (error) {
		logger.warn('Failed to fetch message before delete: ' + (error as Error).message);
	}

	await safeExecute(() => client.deleteMessages(chatId as never, [messageId], { revoke } as never));

	// Resolve entity info for source
	let sourceName = 'Unknown';
	let formattedSourceId = typeof chatId === 'string' ? chatId : '';
	try {
		const entity = await getEntityLoose(client, chatId);
		if (entity) {
			sourceName = getEntityLabel(entity);
			formattedSourceId = getFormattedEntityId(entity, formattedSourceId);
		}
	} catch {
		/* intentionally ignoring */
	}

	const mediaInfo = extractMediaInfo(detailedMessage?.media);
	const messageDate = detailedMessage?.date;
	const replyToId = detailedMessage?.replyTo?.replyToMsgId || null;
	const isOutgoing = detailedMessage?.out !== undefined ? detailedMessage.out : true;
	const finalRawText = getMessageText(detailedMessage);
	const finalText = getRichMessageText(detailedMessage);
	const fromId = getPeerIdString(detailedMessage?.fromId);

	return [
		{
			json: {
				success: true,
				message: 'Message Deleted successfully',
				id: messageId,
				sourceName,
				sourceId: formattedSourceId,
				text: finalText,
				rawText: finalRawText,
				date: messageDate,
				humanDate: messageDate ? formatDateWithTime(new Date(messageDate * 1000)) : null,
				fromId: fromId,
				chatId: formattedSourceId,
				isReply: !!replyToId,
				isOutgoing,
				direction: isOutgoing ? 'sent' : 'received',
				hasMedia: mediaInfo.hasMedia,
				hasWebPreview: mediaInfo.hasWebPreview,
				mediaType: getMessageType(detailedMessage),
				deletedId: messageId,
				revoked: revoke,
				'Delete of Everyone': revoke,
			},
			pairedItem: { item: i },
		},
	];
}

// --- UPDATED DELETE HISTORY FUNCTION ---
async function deleteHistory(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const chatId = this.getNodeParameter('chatId', i) as string;
	const maxId = (this.getNodeParameter('maxId', i) as number) || 0;
	const revoke = this.getNodeParameter('revoke', i) as boolean;
	const normalizedChatId = String(normalizePeerReference(chatId) ?? chatId).trim();

	try {
		if (!normalizedChatId) {
			return [
				{
					json: {
						success: false,
						chatId,
						normalizedChatId,
						errorCode: 'INVALID_CHAT_ID',
						error:
							'Chat ID is empty or invalid. Provide a numeric chat ID, @username, or a valid t.me link.',
						operation: 'deleteHistory',
						recoverable: true,
					},
					pairedItem: { item: i },
				},
			];
		}

		if (!client.connected) {
			await client.connect();
		}

		const peer = await resolvePeer(client, normalizedChatId);
		let entity: TelegramEntityView | null = null;
		try {
			entity = await getEntityLoose(client, normalizedChatId);
		} catch {
			// Best effort only; some peers may resolve as input entities without full metadata.
		}
		const peerKind = detectPeerKind(entity, peer);

		// Channel/supergroup handling:
		// - revoke=false: clear locally (like app "clear history") via messages.DeleteHistory(justClear=true)
		// - revoke=true: delete for everyone via channels.DeleteHistory (admin-only)
		if (peerKind === 'channel') {
			let channelInput = toInputChannel(entity as unknown) || toInputChannel(peer);
			if (!channelInput) {
				try {
					channelInput = toInputChannel(await client.getInputEntity(normalizedChatId as never));
				} catch {
					// Keep null; handled below with friendly CHANNEL_RESOLVE_FAILED message.
				}
			}

			if (!revoke) {
				try {
					await client.invoke(
						new Api.channels.DeleteHistory({
							channel: channelInput as never,
							maxId: maxId,
							forEveryone: false,
						}),
					);

					return [
						{
							json: {
								success: true,
								chatId,
								normalizedChatId,
								deletedCount: null,
								maxId: maxId,
								revoked: false,
								peerKind,
								strategy: 'channels.DeleteHistory(local-clear)',
							},
							pairedItem: { item: i },
						},
					];
				} catch (localError) {
					const localMessage =
						localError instanceof Error ? localError.message : String(localError);
					const localErrorCode = getRpcErrorCode(localMessage);

					return [
						{
							json: {
								success: false,
								chatId,
								normalizedChatId,
								errorCode: localErrorCode,
								error: localMessage,
								operation: 'deleteHistory',
								recoverable: true,
								peerKind,
								strategy: 'channels.DeleteHistory(local-clear)',
								hint:
									localErrorCode === 'PEER_ID_INVALID'
										? 'This account could not resolve a valid InputPeer for local clear. Open this channel once in Telegram app and retry, or pass @username instead of numeric ID.'
										: 'Telegram did not allow local channel history clear for this chat.',
							},
							pairedItem: { item: i },
						},
					];
				}
			}

			const everyonePermission = canDeleteHistoryForEveryone(entity);
			if (everyonePermission === false) {
				return [
					{
						json: {
							success: false,
							chatId,
							normalizedChatId,
							errorCode: 'ADMIN_REQUIRED',
							error:
								'Delete for Everyone requires channel/supergroup admin rights (delete messages). Turn off Delete for Everyone to clear only your own history.',
							operation: 'deleteHistory',
							recoverable: true,
							hint: 'Set "Delete for Everyone" to false, or run with an admin account.',
						},
						pairedItem: { item: i },
					},
				];
			}

			if (!channelInput) {
				return [
					{
						json: {
							success: false,
							chatId,
							normalizedChatId,
							errorCode: 'CHANNEL_RESOLVE_FAILED',
							error:
								'Unable to build InputChannel with access hash for this channel. Open the channel once and retry.',
							operation: 'deleteHistory',
							recoverable: true,
							peerKind,
							strategy: 'channels.DeleteHistory',
						},
						pairedItem: { item: i },
					},
				];
			}

			try {
				await client.invoke(
					new Api.channels.DeleteHistory({
						channel: channelInput as never,
						maxId: maxId,
						forEveryone: true,
					}),
				);

				return [
					{
						json: {
							success: true,
							chatId,
							normalizedChatId,
							deletedCount: null,
							maxId: maxId,
							revoked: revoke,
							peerKind,
							strategy: 'channels.DeleteHistory',
						},
						pairedItem: { item: i },
					},
				];
			} catch (channelError) {
				const channelMessage =
					channelError instanceof Error ? channelError.message : String(channelError);
				const channelErrorCode = getRpcErrorCode(channelMessage);
				const isAdminError =
					isAdminRequiredErrorCode(channelErrorCode) ||
					(channelErrorCode === 'CHANNEL_INVALID' && revoke && !!entity);

				return [
					{
						json: {
							success: false,
							chatId,
							normalizedChatId,
							errorCode: isAdminError ? 'ADMIN_REQUIRED' : channelErrorCode,
							error: channelMessage,
							operation: 'deleteHistory',
							recoverable: true,
							peerKind,
							strategy: 'channels.DeleteHistory',
							hint:
								isAdminError || (revoke && channelErrorCode === 'PEER_ID_INVALID')
									? 'Delete for Everyone needs admin rights. Set "Delete for Everyone" to false to clear only your side.'
									: 'If this channel is private, ensure this account is a member and can open it in Telegram app.',
						},
						pairedItem: { item: i },
					},
				];
			}
		}

		// 1. GET TOTAL COUNT BEFORE DELETION
		let preDeleteCount = 0;
		try {
			// 'limit: 0' fetches metadata (including total count) without fetching message bodies
			const countResult = (await client.getMessages(
				peer as never,
				{ limit: 0 } as never,
			)) as unknown as {
				total?: number;
			};
			preDeleteCount = countResult.total || 0;
		} catch {
			// If fetching count fails, we gracefully degrade to 0
		}

		let offset = 0;
		let response;
		let loopCount = 0;

		// 2. PERFORM DELETION
		do {
			try {
				response = (await client.invoke(
					new Api.messages.DeleteHistory({
						peer: peer as never,
						maxId: maxId,
						revoke: revoke,
						justClear: false,
					}),
				)) as Api.messages.AffectedHistory;
			} catch (messagesError) {
				const messagesErrorMessage =
					messagesError instanceof Error ? messagesError.message : String(messagesError);
				const messagesErrorCode = getRpcErrorCode(messagesErrorMessage);

				// Fallback: if peer was detected/treated as channel, retry with channel API.
				if (messagesErrorCode === 'PEER_ID_INVALID' && peerKind === 'unknown') {
					await client.invoke(
						new Api.channels.DeleteHistory({
							channel: peer as never,
							maxId: maxId,
							forEveryone: revoke,
						}),
					);
					return [
						{
							json: {
								success: true,
								chatId,
								normalizedChatId,
								deletedCount: null,
								maxId: maxId,
								revoked: revoke,
								iterations: 1,
								peerKind: 'channel',
								strategy: 'channels.DeleteHistory(fallback)',
							},
							pairedItem: { item: i },
						},
					];
				}

				throw messagesError;
			}

			offset = response.offset;
			loopCount++;

			if (loopCount > 100) {
				throw new Error(
					`Delete history safety cap exceeded after ${loopCount} iterations (offset=${offset}). Aborting to prevent an infinite loop.`,
				);
			}
			if (offset > 0) await new Promise((resolve) => setTimeout(resolve, 100));
		} while (offset > 0);

		return [
			{
				json: {
					success: true,
					chatId,
					normalizedChatId,
					deletedCount: preDeleteCount,
					maxId: maxId,
					revoked: revoke,
					iterations: loopCount,
					peerKind,
					strategy: 'messages.DeleteHistory',
				},
				pairedItem: { item: i },
			},
		];
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const errorCode = getRpcErrorCode(message);
		const isPeerResolutionIssue =
			errorCode === 'PEER_ID_INVALID' ||
			message.toLowerCase().includes('could not resolve telegram entity');
		const isAdminError =
			errorCode === 'CHAT_ADMIN_REQUIRED' ||
			errorCode === 'RIGHT_FORBIDDEN' ||
			errorCode === 'MESSAGE_DELETE_FORBIDDEN';

		return [
			{
				json: {
					success: false,
					chatId,
					normalizedChatId,
					errorCode: isAdminError ? 'ADMIN_REQUIRED' : errorCode,
					error: message,
					operation: 'deleteHistory',
					recoverable: true,
					hint: isAdminError
						? 'You do not have permission to delete for everyone in this chat. Set "Delete for Everyone" to false.'
						: isPeerResolutionIssue
							? 'Make sure this account has access to the target chat. Try @username or open the chat once so Telegram can cache entity access.'
							: undefined,
				},
				pairedItem: { item: i },
			},
		];
	}
}

async function pinMessage(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const chatId = this.getNodeParameter('chatId', i);
	const messageId = Number(this.getNodeParameter('messageId', i));
	const notify = this.getNodeParameter('notify', i) as boolean;

	// Pin the message
	await safeExecute(() => client.pinMessage(chatId as never, messageId, { notify } as never));

	// Fetch detailed message info after pinning
	let detailedMessage: TelegramMessageView | null = null;
	try {
		const messages = await getMessagesLoose(client, chatId, { ids: [messageId] });
		if (messages && messages.length > 0) {
			detailedMessage = messages[0];
		}
	} catch (error) {
		logger.warn('Failed to fetch detailed message info after pin: ' + (error as Error).message);
	}

	// Resolve entity info for source
	let sourceName = 'Unknown';
	let formattedSourceId = typeof chatId === 'string' ? chatId : '';
	try {
		const entity = await getEntityLoose(client, chatId);
		if (entity) {
			sourceName = getEntityLabel(entity);
			formattedSourceId = getFormattedEntityId(entity, formattedSourceId);
		}
	} catch {
		/* intentionally ignoring */
	}

	const mediaInfo = extractMediaInfo(detailedMessage?.media);
	const messageDate = detailedMessage?.date;
	const replyToId = detailedMessage?.replyTo?.replyToMsgId || null;
	const isOutgoing = detailedMessage?.out !== undefined ? detailedMessage.out : true;
	const finalRawText = getMessageText(detailedMessage);
	const finalText = getRichMessageText(detailedMessage);
	const fromId = getPeerIdString(detailedMessage?.fromId);

	return [
		{
			json: {
				success: true,
				message: 'Message Pinned successfully',
				id: messageId,
				sourceName,
				sourceId: formattedSourceId,
				text: finalText,
				rawText: finalRawText,
				date: messageDate,
				humanDate: messageDate ? formatDateWithTime(new Date(messageDate * 1000)) : null,
				fromId,
				chatId: formattedSourceId,
				isReply: !!replyToId,
				isOutgoing,
				direction: isOutgoing ? 'sent' : 'received',
				hasMedia: mediaInfo.hasMedia,
				hasWebPreview: mediaInfo.hasWebPreview,
				mediaType: getMessageType(detailedMessage),
				notified: notify,
				pinnedId: messageId,
			},
			pairedItem: { item: i },
		},
	];
}

async function sendText(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const sendToSelf = this.getNodeParameter('sendToSelf', i, false) as boolean;
	const chatId = sendToSelf ? 'me' : (this.getNodeParameter('chatId', i) as string);
	const text = this.getNodeParameter('text', i) as string;
	const replyTo = this.getNodeParameter('replyTo', i) as number;
	const webPreview = this.getNodeParameter('webPreview', i, true) as boolean;
	const attachMedia = this.getNodeParameter('attachMedia', i, false) as boolean;
	const mediaUrl = this.getNodeParameter('mediaUrl', i, '') as string;
	const formattedInput = prepareTelegramTextInput(text);

	let fileToSend: CustomFile | undefined;
	let hasMedia = false;
	let mediaType: string = 'other';
	const selectedType = this.getNodeParameter('mediaType', i, 'document') as string;

	if (!webPreview && attachMedia && selectedType !== 'text') {
		const binaryProperty = this.getNodeParameter('mediaBinaryProperty', i, 'data') as string;
		const items = this.getInputData();
		const item = items[i];

		const binaryData = item?.binary?.[binaryProperty];

		if (binaryData) {
			const buffer = await this.helpers.getBinaryDataBuffer(i, binaryProperty);
			const fileName = binaryData.fileName || `upload_${Date.now()}`;
			fileToSend = new CustomFile(fileName, buffer.length, '', buffer);
			hasMedia = true;
			mediaType = selectedType || inferMediaTypeFromMime(binaryData.mimeType);
		} else if (mediaUrl && mediaUrl.trim() !== '') {
			// Download the URL and send as uploaded file to avoid WEBPAGE_MEDIA_EMPTY
			const { buffer, mimeType, fileName } = await downloadUrlToBuffer(mediaUrl);
			const safeName = fileName || `upload_${Date.now()}`;
			fileToSend = new CustomFile(safeName, buffer.length, '', buffer);
			hasMedia = true;
			mediaType =
				selectedType || inferMediaTypeFromMime(mimeType) || inferMediaTypeFromMimeFromUrl(mediaUrl);
		} else {
			throw new Error(
				`Binary property '${binaryProperty}' is missing or empty on item ${i} and no Media URL provided`,
			);
		}
	}

	const result = await withRateLimit(async () =>
		safeExecute(() =>
			sendMessageLoose(client, chatId, {
				message: formattedInput.text,
				replyTo: replyTo > 0 ? replyTo : undefined,
				linkPreview: webPreview,
				file: fileToSend,
				parseMode: formattedInput.parseMode,
			}),
		),
	);

	const msg = result;
	const resolvedMediaType = hasMedia ? mediaType : getMessageType(msg);
	const chatIdStr = chatId?.toString?.() ?? '';
	const textStr = text ?? '';
	return await formatSendResult.call(
		this,
		client,
		msg,
		chatIdStr,
		textStr,
		hasMedia,
		resolvedMediaType,
		replyTo,
		i,
		!!fileToSend ||
			(msg.media &&
				(msg.media.className === 'MessageMediaWebPage' || msg.media._ === 'messageMediaWebPage'))
			? true
			: undefined,
	);
}

async function formatSendResult(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	msg: TelegramMessageView,
	chatId: string,
	text: string,
	hasMedia: boolean,
	mediaType: string,
	replyTo: number,
	i: number,
	hasWebPreviewOverride?: boolean,
): Promise<INodeExecutionData[]> {
	let senderId: string | null = getPeerIdString(msg.fromId);

	if (!senderId) {
		try {
			const me = await client.getMe();
			senderId = me?.id?.toString() || null;
		} catch {
			senderId = null;
		}
	}

	let sourceName = 'Unknown';
	let formattedSourceId = typeof chatId === 'string' ? chatId : '';
	try {
		const entity = await getEntityLoose(client, chatId);
		if (entity) {
			sourceName = getEntityLabel(entity);
			formattedSourceId = getFormattedEntityId(entity, formattedSourceId);
		}
	} catch {
		/* intentionally ignoring */
	}

	const mediaInfo = extractMediaInfo(msg.media);
	const finalHasMedia = hasMedia || mediaInfo.hasMedia;
	const finalMediaType = hasMedia ? mediaType : getMessageType(msg);
	const messageDate = msg.date;
	const finalRawText = getMessageText(msg, text);
	const finalText = getRichMessageText(msg, text);
	const isOutgoing = msg.out !== undefined ? msg.out : true;
	const replyToId = msg.replyTo?.replyToMsgId || null;

	return [
		{
			json: {
				success: true,
				message: 'Message Send Successfully',
				id: msg.id,
				sourceName,
				sourceId: formattedSourceId,
				text: finalText,
				rawText: finalRawText,
				date: messageDate,
				humanDate: messageDate ? formatDateWithTime(new Date(messageDate * 1000)) : null,
				fromId: senderId,
				chatId: formattedSourceId,
				isReply: replyTo > 0 || !!replyToId,
				isOutgoing,
				direction: isOutgoing ? 'sent' : 'received',
				hasMedia: finalHasMedia,
				hasWebPreview:
					hasWebPreviewOverride !== undefined ? hasWebPreviewOverride : mediaInfo.hasWebPreview,
				mediaType: finalMediaType,
				replyToId,
			},
			pairedItem: { item: i },
		},
	];
}

function inferMediaTypeFromMime(mime?: string): string {
	if (!mime) return 'document';
	if (mime.startsWith('image/')) return 'photo';
	if (mime.startsWith('video/')) return 'video';
	return 'document';
}

function inferMediaTypeFromMimeFromUrl(url: string): string {
	const lower = url.toLowerCase();
	if (lower.match(/\.jpg|\.jpeg|\.png|\.gif|\.webp|\.heic|\.heif/)) return 'photo';
	if (lower.match(/\.mp4|\.mov|\.mkv|\.webm/)) return 'video';
	return 'document';
}

async function downloadUrlToBuffer(
	url: string,
): Promise<{ buffer: Buffer; mimeType?: string; fileName?: string }> {
	const res = await fetch(url);
	if (!res.ok)
		throw new Error(`Failed to download media from URL: ${res.status} ${res.statusText}`);
	const arrayBuf = await res.arrayBuffer();
	const buffer = Buffer.from(arrayBuf);
	const mimeType = res.headers.get('content-type') || undefined;
	const disposition = res.headers.get('content-disposition');
	let fileName: string | undefined;
	if (disposition && disposition.includes('filename=')) {
		const match = disposition.match(/filename="?([^";]+)"?/i);
		if (match && match[1]) fileName = match[1];
	} else {
		try {
			const u = new URL(url);
			fileName = u.pathname.split('/').filter(Boolean).pop();
		} catch {
			/* intentionally ignoring */
		}
	}
	return { buffer, mimeType, fileName };
}

function extractMediaInfo(media: TelegramMediaView | undefined): {
	hasMedia: boolean;
	mediaType: string;
	hasWebPreview: boolean;
} {
	if (!media) return { hasMedia: false, mediaType: 'other', hasWebPreview: false };

	if (media.photo || media.className === 'MessageMediaPhoto' || media._ === 'messageMediaPhoto') {
		return { hasMedia: true, mediaType: 'photo', hasWebPreview: false };
	}

	const document =
		media.document ||
		media?.className === 'MessageMediaDocument' ||
		media?._ === 'messageMediaDocument';
	if (document) {
		const mimeType = media.document?.mimeType || '';
		if (mimeType.startsWith('video/'))
			return { hasMedia: true, mediaType: 'video', hasWebPreview: false };
		if (mimeType.startsWith('image/'))
			return { hasMedia: true, mediaType: 'photo', hasWebPreview: false };
		return { hasMedia: true, mediaType: 'document', hasWebPreview: false };
	}

	if (media.video) return { hasMedia: true, mediaType: 'video', hasWebPreview: false };

	if (media.className === 'MessageMediaWebPage' || media._ === 'messageMediaWebPage') {
		// Treat WebPage preview as not typical media, but flag it
		const webpage = (media as Record<string, unknown>).webpage;
		return {
			hasMedia: false,
			mediaType: 'other',
			hasWebPreview: !(webpage instanceof Api.WebPageEmpty) || !!webpage,
		};
	}

	if ('webpage' in media) {
		const webpage = (media as Record<string, unknown>).webpage;
		return {
			hasMedia: false,
			mediaType: 'other',
			hasWebPreview: !!webpage && !(webpage instanceof Api.WebPageEmpty),
		};
	}

	return { hasMedia: true, mediaType: 'other', hasWebPreview: false };
}

function getMessageType(message: TelegramMessageView | null | undefined): string {
	const mediaInfo = extractMediaInfo(message?.media);
	if (mediaInfo.hasMedia) {
		return mediaInfo.mediaType;
	}

	return getMessageText(message).trim() ? 'text' : 'other';
}

function formatDateWithTime(date: Date): string {
	const istFormatter = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Asia/Kolkata',
		year: 'numeric',
		month: 'short',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: true,
	});
	const parts = istFormatter.formatToParts(date);
	const part = (type: string) => parts.find((p) => p.type === type)?.value || '';
	const day = part('day');
	const month = part('month');
	const year = part('year');
	const hour = part('hour');
	const minute = part('minute');
	const second = part('second');
	const dayPeriod = part('dayPeriod');
	const formattedDate = `${day}-${month}-${year}`;
	const timePart = `${hour}:${minute}:${second} ${dayPeriod}`;
	return `${formattedDate} (${timePart})`;
}

async function forwardMessage(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const sourceChatId = this.getNodeParameter('sourceChatId', i);
	const saveToSavedMessages = this.getNodeParameter('saveToSavedMessages', i, false) as boolean;
	const targetChatId = saveToSavedMessages ? 'me' : this.getNodeParameter('targetChatId', i);
	const messageId = Number(this.getNodeParameter('messageId', i));

	const result = await forwardMessagesLoose(client, saveToSavedMessages ? 'me' : targetChatId, {
		fromPeer: sourceChatId,
		messages: [messageId],
	});
	const msg = result;

	const senderId: string | null = getPeerIdString(msg.fromId);

	let sourceName = 'Unknown';
	let formattedTargetId = typeof targetChatId === 'string' ? targetChatId : '';
	try {
		const entity = await getEntityLoose(client, targetChatId);
		if (entity) {
			sourceName = getEntityLabel(entity);
			formattedTargetId = getFormattedEntityId(entity, formattedTargetId);
		}
	} catch {
		/* intentionally ignoring */
	}

	const mediaInfo = extractMediaInfo(msg.media);
	const messageDate = msg.date;
	const isOutgoing = msg.out !== undefined ? msg.out : true;
	const replyToId = msg.replyTo?.replyToMsgId || null;

	return [
		{
			json: {
				success: true,
				message: 'Message forwarded successfully',
				id: msg.id,
				sourceName,
				sourceId: formattedTargetId,
				text: getRichMessageText(msg),
				rawText: getMessageText(msg),
				date: messageDate,
				humanDate: messageDate ? formatDateWithTime(new Date(messageDate * 1000)) : null,
				fromId: senderId,
				chatId: formattedTargetId,
				isReply: !!replyToId,
				isOutgoing,
				direction: isOutgoing ? 'sent' : 'received',
				hasMedia: mediaInfo.hasMedia,
				hasWebPreview: mediaInfo.hasWebPreview,
				mediaType: getMessageType(msg),
				replyToId,
			},
			pairedItem: { item: i },
		},
	];
}

async function getHistory(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const historyFromSelf = this.getNodeParameter('historyFromSelf', i, false) as boolean;
	let chatIdInput = historyFromSelf ? 'me' : (this.getNodeParameter('chatId', i) as string);
	const mode = this.getNodeParameter('mode', i, 'limit') as string;
	const onlyMedia = this.getNodeParameter('onlyMedia', i, false) as boolean;
	const mediaTypes = this.getNodeParameter('mediaType', i, []) as string[];

	let replyToMsgId: number | undefined = undefined;

	// Handle topic/message thread URLs like https://t.me/n8n_nodes_0/75 or https://t.me/c/123456789/123
	if (!historyFromSelf && chatIdInput) {
		const topicMatch = chatIdInput.match(
			/(?:https?:\/\/)?t\.me\/(?:c\/)?([a-zA-Z0-9_-]+)\/(\d+)\/?$/,
		);
		if (topicMatch) {
			chatIdInput = topicMatch[1];
			// Format private channel/group IDs correctly
			if (chatIdInput.match(/^\d+$/)) {
				chatIdInput = `-100${chatIdInput}`;
			}
			replyToMsgId = parseInt(topicMatch[2], 10);
		} else {
			const shortMatch = chatIdInput.match(/(?:https?:\/\/)?t\.me\/(?:c\/)?([a-zA-Z0-9_-]+)\/?$/);
			if (shortMatch) {
				chatIdInput = shortMatch[1];
				if (chatIdInput.match(/^\d+$/)) {
					chatIdInput = `-100${chatIdInput}`;
				}
			}
		}
	}

	let messages: TelegramMessageView[] = [];

	let requestedLimit = 50;
	if (mode === 'limit') {
		requestedLimit = this.getNodeParameter('limit', i, 10) as number;
		// Fetch a bit more than requested to account for albuminous grouping (max 10 messages per album)
		const fetchLimit = requestedLimit + 10;
		const result = await safeExecute(() =>
			getMessagesLoose(client, chatIdInput, { limit: fetchLimit, replyTo: replyToMsgId }),
		);
		messages = Array.isArray(result) ? result : [];
	} else {
		const maxMessages = this.getNodeParameter('maxMessages', i, 500) as number;
		const iterOptions: Record<string, unknown> = {};
		if (maxMessages > 0) iterOptions.limit = maxMessages;
		if (replyToMsgId) iterOptions.replyTo = replyToMsgId;

		if (mode === 'hours') {
			const hours = this.getNodeParameter('hours', i, 24) as number;
			const cutoffTime = Math.floor(Date.now() / 1000) - hours * 3600;
			for await (const msg of iterMessagesLoose(client, chatIdInput, iterOptions)) {
				if (msg.date < cutoffTime) break;
				messages.push(msg);
			}
		} else if (mode === 'range') {
			const fromDateStr = this.getNodeParameter('fromDate', i, '') as string;
			const toDateStr = this.getNodeParameter('toDate', i, '') as string;
			const fromTime = fromDateStr ? Math.floor(new Date(fromDateStr).getTime() / 1000) : 0;
			const toTime = toDateStr
				? Math.floor(new Date(toDateStr).getTime() / 1000)
				: Math.floor(Date.now() / 1000);

			for await (const msg of iterMessagesLoose(client, chatIdInput, iterOptions)) {
				if (msg.date > toTime) continue;
				if (msg.date < fromTime) break;
				messages.push(msg);
			}
		}
	}

	const items = [];
	const chatEntity = (await getEntityLoose(client, chatIdInput)) as TelegramEntity;

	// Group messages by groupedId to support albums in history
	const groups = new Map<string, TelegramMessageView[]>();
	const orderedGroups: Array<{ type: 'single' | 'album'; messages: TelegramMessageView[] }> = [];

	for (const m of messages) {
		if (!m || m._ === 'MessageEmpty') continue;

		const gid = m.groupedId?.toString();
		if (gid) {
			if (!groups.has(gid)) {
				const group: TelegramMessageView[] = [];
				groups.set(gid, group);
				orderedGroups.push({ type: 'album', messages: group });
			}
			groups.get(gid)!.push(m);
		} else {
			orderedGroups.push({ type: 'single', messages: [m] });
		}
	}

	// Batch fetch sender entities for better names (esp. in groups)
	const senderIdSet = new Set<string>();
	for (const m of messages) {
		const sid = (m as unknown as Api.Message).senderId?.toString();
		if (sid) senderIdSet.add(sid);
	}
	const senderEntities = new Map<string, TelegramEntity>();
	if (senderIdSet.size > 0) {
		try {
			// getEntity with an array returns an array of entities
			const entities = (await client.getEntity(Array.from(senderIdSet))) as TelegramEntity[];
			for (const ent of entities) {
				const id = ent.id?.toString();
				if (id) senderEntities.set(id, ent);
			}
		} catch (err) {
			logger.warn('Failed to batch fetch sender entities for history: ' + (err as Error).message);
		}
	}

	for (const group of orderedGroups) {
		const primaryMessage = group.messages[0];
		const messageObj = primaryMessage as unknown as Api.Message;
		const senderId = messageObj.senderId?.toString();
		const senderEntity = senderId ? senderEntities.get(senderId) : undefined;

		const mediaInfo = extractMediaInfo(primaryMessage.media);
		const messageType = getMessageType(primaryMessage);
		const hasMedia = mediaInfo.hasMedia;
		const wantsNonMediaMessages = mediaTypes.includes('text') || mediaTypes.includes('other');

		if (onlyMedia && !hasMedia && !wantsNonMediaMessages) continue;

		if (onlyMedia && mediaTypes.length > 0 && !mediaTypes.includes(messageType)) {
			continue;
		}

		// Resolve context from entities
		const messageContext = resolveMessageContextFromEntities(messageObj, chatEntity, senderEntity);

		let payload;
		if (group.type === 'album') {
			payload = buildSharedAlbumPayload(group.messages as unknown as Api.Message[], messageContext);
		} else {
			payload = buildSharedMessagePayload(messageObj, messageContext);
		}

		items.push({
			json: {
				...payload,
				humanDate: formatDateWithTime(new Date(primaryMessage.date * 1000)),
			},
			pairedItem: { item: i },
		});
	}

	return items.slice(0, requestedLimit);
}

async function unpinMessage(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const chatId = this.getNodeParameter('chatId', i) as string;
	const messageId = Number(this.getNodeParameter('messageId', i));

	await safeExecute(() =>
		client.invoke(
			new Api.messages.UpdatePinnedMessage({
				peer: chatId,
				id: messageId,
				unpin: true,
			}),
		),
	);

	// Fetch detailed message info
	let detailedMessage: TelegramMessageView | null = null;
	try {
		const messages = await getMessagesLoose(client, chatId, { ids: [messageId] });
		if (messages && messages.length > 0) {
			detailedMessage = messages[0];
		}
	} catch (error) {
		logger.warn('Failed to fetch detailed message info after unpin: ' + (error as Error).message);
	}

	// Resolve entity info for source
	let sourceName = 'Unknown';
	let formattedSourceId = typeof chatId === 'string' ? chatId : '';
	try {
		const entity = await getEntityLoose(client, chatId);
		if (entity) {
			sourceName = getEntityLabel(entity);
			formattedSourceId = getFormattedEntityId(entity, formattedSourceId);
		}
	} catch {
		/* intentionally ignoring */
	}

	const mediaInfo = extractMediaInfo(detailedMessage?.media);
	const messageDate = detailedMessage?.date;
	const replyToId = detailedMessage?.replyTo?.replyToMsgId || null;
	const isOutgoing = detailedMessage?.out !== undefined ? detailedMessage.out : true;
	const finalRawText = getMessageText(detailedMessage);
	const finalText = getRichMessageText(detailedMessage);
	const fromId = getPeerIdString(detailedMessage?.fromId);

	return [
		{
			json: {
				success: true,
				message: 'Message Unpinned successfully',
				id: messageId,
				sourceName,
				sourceId: formattedSourceId,
				text: finalText,
				rawText: finalRawText,
				date: messageDate,
				humanDate: messageDate ? formatDateWithTime(new Date(messageDate * 1000)) : null,
				fromId,
				chatId: formattedSourceId,
				isReply: !!replyToId,
				isOutgoing,
				direction: isOutgoing ? 'sent' : 'received',
				hasMedia: mediaInfo.hasMedia,
				hasWebPreview: mediaInfo.hasWebPreview,
				mediaType: getMessageType(detailedMessage),
				unpinnedId: messageId,
			},
			pairedItem: { item: i },
		},
	];
}

async function sendPoll(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const chatId = this.getNodeParameter('chatId', i) as string;
	const question = this.getNodeParameter('pollQuestion', i) as string;
	const options = this.getNodeParameter('pollOptions', i) as string[];
	const isQuiz = this.getNodeParameter('isQuiz', i) as boolean;
	const isAnonymous = this.getNodeParameter('anonymous', i, true) as boolean;

	let correctAnswers: number[] | undefined = undefined;
	if (isQuiz) {
		const correctIndex = this.getNodeParameter('correctAnswerIndex', i) as number;
		correctAnswers = [correctIndex];
	}

	const peer = await getEntityLoose(client, chatId);
	const isBroadcastChannel = peer.className === 'Channel' && peer.broadcast === true;
	const publicVoters = isBroadcastChannel ? false : !isAnonymous;
	const pollId = bigInt(Math.floor(Math.random() * 1000000000));

	await safeExecute(() =>
		client.invoke(
			new Api.messages.SendMedia({
				peer: chatId as never,
				media: new Api.InputMediaPoll({
					poll: new Api.Poll({
						id: pollId,
						question: new Api.TextWithEntities({
							text: question,
							entities: [],
						}),
						answers: options.map(
							(opt, index) =>
								new Api.PollAnswer({
									text: new Api.TextWithEntities({ text: opt, entities: [] }),
									option: Buffer.from(index.toString()),
								}),
						),
						closed: false,
						publicVoters: publicVoters,
						multipleChoice: false,
						quiz: isQuiz,
						hash: bigInt(0),
					}),
					correctAnswers: correctAnswers,
				}),
				message: '',
				randomId: bigInt(Math.floor(Math.random() * 1000000000)),
			}),
		),
	);

	const pollType = isAnonymous ? 'Anonymous Voting' : 'Public Voting';
	const formattedDate = null; // Telegram does not return a reliable poll timestamp in this call

	return [
		{
			json: {
				success: true,
				message: 'Create Poll successfully',
				pollId: pollId.toString(),
				title: question,
				options: options.join(', '),
				poll_type: pollType,
				create_time: formattedDate,
				isQuiz: isQuiz,
			},
			pairedItem: { item: i },
		},
	];
}

async function copyMessage(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const sourceChatId = this.getNodeParameter('sourceChatId', i);
	const saveToSavedMessages = this.getNodeParameter('saveToSavedMessages', i, false) as boolean;
	const targetChatId = saveToSavedMessages ? 'me' : this.getNodeParameter('targetChatId', i);
	const messageId = Number(this.getNodeParameter('messageId', i));
	const caption = this.getNodeParameter('caption', i, '') as string;
	const disableLinkPreview = this.getNodeParameter('disableLinkPreview', i, false) as boolean;

	logger.info(
		`Copy Message start: source=${String(sourceChatId)} messageId=${messageId} target=${String(targetChatId)}`,
	);

	const fromPeer = await resolvePeer(client, sourceChatId);
	const toPeer = saveToSavedMessages ? 'me' : await resolvePeer(client, targetChatId);

	const messages = await safeExecute(() =>
		getMessagesLoose(client, fromPeer, { ids: [messageId] }),
	);

	const originalMessage = messages[0] as TelegramMessageView | undefined;
	if (!originalMessage) throw new Error('Original message not found');

	let messageContent = getMessageText(originalMessage);
	if (caption && caption.trim()) messageContent = caption;

	// --- FIX START ---
	// Check if media exists and if it is a WebPage (Link Preview).
	// WebPage objects cannot be sent as "files".
	let mediaToSend = originalMessage.media;

	if (
		mediaToSend &&
		(mediaToSend.className === 'MessageMediaWebPage' || mediaToSend._ === 'messageMediaWebPage')
	) {
		mediaToSend = undefined;
	}
	// --- FIX END ---

	const result = await withRateLimit(async () =>
		safeExecute(() =>
			sendMessageLoose(client, toPeer, {
				message: messageContent,
				file: mediaToSend, // Use the filtered variable here
				linkPreview: !disableLinkPreview,
				formattingEntities: originalMessage.entities || [],
			}),
		),
	);

	logger.info(
		`Copy Message success: source=${String(sourceChatId)} messageId=${messageId} copiedId=${result.id}`,
	);

	let senderId: string | null = getPeerIdString(result.fromId);

	if (!senderId && originalMessage.fromId) {
		senderId = getPeerIdString(originalMessage.fromId);
	}

	if (!senderId && originalMessage.post_author) senderId = originalMessage.post_author;
	if (!senderId && originalMessage.peerId) {
		senderId = getPeerIdString(originalMessage.peerId);
	}

	return [
		{
			json: {
				success: true,
				message: 'Message copied successfully',
				copiedId: result.id,
				originalId: originalMessage.id,
				text: getRichMessageText(result),
				rawText: getMessageText(result),
				chatId: toIdString(result.chatId),
				fromId: senderId,
				date: result.date,
				hasMedia: !!mediaToSend, // Update status to reflect what was actually sent
				caption: caption || getRichMessageText(originalMessage),
				rawCaption: caption || getMessageText(originalMessage),
			},
			pairedItem: { item: i },
		},
	];
}

/**
 * Robust peer resolver to avoid "Could not find the input entity" errors when the client
 * has not cached a user/channel yet. We try getInputEntity first, then search dialogs.
 */
async function resolvePeer(client: TelegramClientInstance, rawId: unknown): Promise<unknown> {
	if (isResolvablePeerObject(rawId)) {
		return rawId;
	}

	const normalizedRawId = normalizePeerReference(rawId);
	const asString =
		typeof normalizedRawId === 'string' ? normalizedRawId.trim() : String(normalizedRawId);
	if (!asString || asString.toLowerCase() === 'me') return 'me';

	const candidates = getInputReferenceAliases(asString);

	let initialError: unknown;
	try {
		const result = await client.getInputEntity(asString as never);
		// Many teleproto methods return dummy entities with accessHash=0 when unresolvable
		if (result && typeof result === 'object') {
			if ('accessHash' in result && String(result.accessHash) === '0') {
				throw new Error('Dummy entity with 0 accessHash resolved; requires dialog search');
			}

			// Reject blind InputPeerChat creation if it was guessed from a positive ID alias
			const isInputChat =
				result.className === 'InputPeerChat' ||
				(result as unknown as { _?: string })._ === 'inputPeerChat';
			if (isInputChat && /^\d+$/.test(asString)) {
				throw new Error('Dummy InputPeerChat parsed from positive string; requires dialog search');
			}
		}
		return result;
	} catch (error) {
		initialError = error;
	}

	try {
		// Fallback: walk through dialogs to find a matching peer by id/username
		for await (const dialog of iterDialogsLoose(client, { limit: 5000 })) {
			const entity = (dialog.entity || dialog) as TelegramEntityView;
			for (const candidate of candidates) {
				if (matchesEntityReference(entity, candidate)) {
					return await client.getInputEntity(entity as never);
				}
			}
		}
	} catch {
		// Ignore iterDialogs errors
	}

	if (/^\d+$/.test(asString)) {
		throw new Error(
			`Could not resolve Telegram entity for numeric ID ${asString}. ` +
				`If this is a channel/group from a previous node, pass its full chat ID (for example -100${asString}) or make sure it appears in this account's dialog list. ` +
				`If this is a user, Telegram also requires a cached access hash, so use their @username or interact with them first.`,
		);
	}

	throw (initialError as Error) || new Error(`Could not resolve Telegram entity: ${asString}`);
}

async function copyRestrictedContent(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const sourceChatId = this.getNodeParameter('sourceChatId', i) as string;
	const messageId = this.getNodeParameter('messageId', i) as string;
	const saveToSavedMessages = this.getNodeParameter('saveToSavedMessages', i, false) as boolean;
	const includeCaption = this.getNodeParameter('includeCaption', i, true) as boolean;
	const downloadTimeout = this.getNodeParameter('downloadTimeout', i, 60) as number;

	// Only get targetChatId if not saving to saved messages
	const targetChatId = saveToSavedMessages
		? ''
		: (this.getNodeParameter('targetChatId', i) as string);

	try {
		logger.info(`Attempting to copy restricted message ${messageId} from chat ${sourceChatId}`);

		// 1. Get the message
		const messages = await getMessagesLoose(client, sourceChatId, {
			ids: [parseInt(messageId, 10)],
		});

		if (!messages || messages.length === 0) {
			throw new Error(`Message ${messageId} not found in chat ${sourceChatId}`);
		}

		const message = messages[0] as TelegramMessageView | undefined;
		if (!message) {
			throw new Error(`Message ${messageId} not found in chat ${sourceChatId}`);
		}

		// 2. Check if message has content to copy
		if (!message.media && !message.text && !message.message) {
			throw new Error('Message has no content to copy');
		}

		// 3. Determine target chat
		const finalTargetChatId = saveToSavedMessages ? 'me' : targetChatId;

		// 4. Handle different media types
		let result: TelegramMessageView;

		if (message.media?.photo) {
			result = await handlePhoto(client, message, finalTargetChatId, {
				includeCaption,
				downloadTimeout,
			});
		} else if (message.media?.video) {
			result = await handleVideo(client, message, finalTargetChatId, {
				includeCaption,
				downloadTimeout,
			});
		} else if (message.media?.document) {
			result = await handleDocument(client, message, finalTargetChatId, {
				includeCaption,
				downloadTimeout,
			});
		} else if (message.sticker) {
			result = await handleSticker(client, message, finalTargetChatId, { downloadTimeout });
		} else if (message.voice) {
			result = await handleVoice(client, message, finalTargetChatId, {
				includeCaption,
				downloadTimeout,
			});
		} else if (message.audio) {
			result = await handleAudio(client, message, finalTargetChatId, {
				includeCaption,
				downloadTimeout,
			});
		} else if (message.media?.geo) {
			result = await handleLocation(client, message, finalTargetChatId, { includeCaption });
		} else if (message.media?.contact) {
			result = await handleContact(client, message, finalTargetChatId);
		} else if (message.media?.poll) {
			result = await handlePoll(client, message, finalTargetChatId, { includeCaption });
		} else if (message.media?.dice) {
			result = await handleDice(client, message, finalTargetChatId);
		} else if (message.text || message.message) {
			result = await handleText(client, message, finalTargetChatId, { includeCaption });
		} else {
			throw new Error(`Unsupported media type: ${JSON.stringify(message)}`);
		}

		return [
			{
				json: {
					success: true,
					message: 'Restricted content copied successfully',
					messageId: result.id,
					chatId: finalTargetChatId,
					timestamp: result.date,
					originalMessageId: messageId,
					sourceChatId: sourceChatId,
					mediaType: getMessageType(message),
				},
				pairedItem: { item: i },
			},
		];
	} catch (error) {
		logger.error('Failed to copy restricted content:', error);

		// Check if it's a restriction error
		if (
			(error as Error).message.includes('FORBIDDEN') ||
			(error as Error).message.includes('RESTRICTED') ||
			(error as Error).message.includes('SAVING_CONTENT_RESTRICTED')
		) {
			throw new Error(
				`Content is restricted and cannot be copied. Error: ${(error as Error).message}`,
				{ cause: error },
			);
		}

		throw error;
	}
}

// Helper function to download media with timeout
async function downloadMediaWithTimeout(
	client: TelegramClientInstance,
	message: TelegramMessageView,
	timeoutSeconds: number = 60,
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error(`Download timeout after ${timeoutSeconds} seconds`));
		}, timeoutSeconds * 1000);

		client
			.downloadMedia(message as never, { stream: true } as never)
			.then((stream: unknown) => {
				clearTimeout(timeout);
				resolve(stream);
			})
			.catch((error: unknown) => {
				clearTimeout(timeout);
				reject(error);
			});
	});
}

// Helper function to download media to buffer
async function downloadMediaBuffer(
	client: TelegramClientInstance,
	message: TelegramMessageView,
): Promise<Buffer> {
	try {
		// Download media - may return Buffer directly or a stream
		const result = await downloadMediaLoose(client, message, { stream: true });

		// If result is already a Buffer, return it directly
		if (Buffer.isBuffer(result)) {
			return result;
		}

		// If result is a stream-like object with on method
		if (result && typeof result === 'object' && 'on' in result && typeof result.on === 'function') {
			return new Promise((resolve, reject) => {
				const chunks: Buffer[] = [];
				const stream = result as StreamLike;
				stream.on('data', (chunk: unknown) => chunks.push(Buffer.from(chunk as Uint8Array)));
				stream.on('end', () => resolve(Buffer.concat(chunks)));
				stream.on('error', reject);
			});
		}

		// If result is a ReadableStream (browser/web stream)
		if (
			result &&
			typeof result === 'object' &&
			'getReader' in result &&
			typeof result.getReader === 'function'
		) {
			const reader = (result as ReadableStreamLike).getReader();
			const chunks: Uint8Array[] = [];
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
			}
			return Buffer.concat(chunks.map((c) => Buffer.from(c)));
		}

		// Fallback: try to convert result to buffer
		return Buffer.from(String(result));
	} catch (error) {
		throw new Error(`Failed to download media: ${error}`, {
			cause: error,
		});
	}
}

// Helper function to extract filename from message attributes
function getFilename(message: TelegramMessageView): string | undefined {
	const attributes = message.media?.document?.attributes;
	if (!attributes) return undefined;
	const filenameAttr = attributes.find(
		(attribute: TelegramDocumentAttributeView) =>
			attribute.className === 'DocumentAttributeFilename',
	);
	return filenameAttr ? filenameAttr.fileName : undefined;
}

// Photo handler
async function handlePhoto(
	client: TelegramClientInstance,
	message: TelegramMessageView,
	targetChatId: string,
	options: CopyOptions,
): Promise<TelegramMessageView> {
	const caption = options.includeCaption ? getMessageText(message) : '';

	// For photos, we need to create InputMediaPhoto from the message media
	// This allows forwarding the photo without downloading/re-uploading
	const photoMedia = message.media?.photo;

	if (!photoMedia) {
		throw new Error('No photo found in message');
	}

	// Try direct forwarding first (faster)
	try {
		const inputPhoto = new Api.InputPhoto({
			id: toBigIntValue(photoMedia.id),
			accessHash: toBigIntValue(photoMedia.accessHash),
			fileReference: toBytes(photoMedia.fileReference),
		});

		const inputMediaPhoto = new Api.InputMediaPhoto({
			id: inputPhoto,
		});

		return (await client.invoke(
			new Api.messages.SendMedia({
				peer: targetChatId,
				media: inputMediaPhoto,
				message: caption,
				randomId: bigInt(Math.floor(Math.random() * 1000000000)),
			}),
		)) as unknown as TelegramMessageView;
	} catch (forwardError: unknown) {
		const forwardErrorMessage =
			forwardError instanceof Error ? forwardError.message : String(forwardError);
		// If forwarding is restricted, fall back to download-and-upload
		const isRestrictedError =
			forwardErrorMessage.includes('FORBIDDEN') ||
			forwardErrorMessage.includes('RESTRICTED') ||
			forwardErrorMessage.includes('CHAT_FORWARDS_RESTRICTED') ||
			forwardErrorMessage.includes('400');

		if (isRestrictedError) {
			logger.info(`Direct photo forwarding restricted, falling back to download-and-upload`);

			// Download the photo to buffer
			const photoBuffer = await downloadMediaBuffer(client, message);

			// Create CustomFile to ensure filename is preserved
			const file = new CustomFile('photo.jpg', photoBuffer.length, '', photoBuffer);

			// Send as a new file upload
			return await sendMessageLoose(client, targetChatId, {
				file: file,
				message: caption,
			});
		}

		// If it's not a restriction error, re-throw it
		throw forwardError;
	}
}

// Video handler
async function handleVideo(
	client: TelegramClientInstance,
	message: TelegramMessageView,
	targetChatId: string,
	options: CopyOptions,
): Promise<TelegramMessageView> {
	const caption = options.includeCaption ? getMessageText(message) : '';

	// Download video to buffer
	const videoBuffer = await downloadMediaBuffer(client, message);

	const filename = getFilename(message) || `video_${Date.now()}.mp4`;
	const file = new CustomFile(filename, videoBuffer.length, '', videoBuffer);

	return await sendMessageLoose(client, targetChatId, {
		file: file,
		message: caption,
		formattingEntities: message.entities || [],
		attributes: message.media?.document?.attributes,
	});
}

// Document handler
async function handleDocument(
	client: TelegramClientInstance,
	message: TelegramMessageView,
	targetChatId: string,
	options: CopyOptions,
): Promise<TelegramMessageView> {
	const caption = options.includeCaption ? getMessageText(message) : '';

	// Download document to buffer
	const docBuffer = await downloadMediaBuffer(client, message);

	const filename = getFilename(message) || `document_${Date.now()}`;
	const file = new CustomFile(filename, docBuffer.length, '', docBuffer);

	return await sendMessageLoose(client, targetChatId, {
		file: file,
		message: caption,
		formattingEntities: message.entities || [],
		attributes: message.media?.document?.attributes,
	});
}

// Sticker handler
async function handleSticker(
	client: TelegramClientInstance,
	message: TelegramMessageView,
	targetChatId: string,
	options: CopyOptions,
): Promise<TelegramMessageView> {
	// Download sticker
	const stickerStream = await downloadMediaWithTimeout(client, message, options.downloadTimeout);

	return await sendMessageLoose(client, targetChatId, {
		file: stickerStream,
	});
}

// Voice message handler
async function handleVoice(
	client: TelegramClientInstance,
	message: TelegramMessageView,
	targetChatId: string,
	options: CopyOptions,
): Promise<TelegramMessageView> {
	const caption = options.includeCaption ? getMessageText(message) : '';

	const voiceBuffer = await downloadMediaBuffer(client, message);

	const filename = getFilename(message) || `voice_${Date.now()}.ogg`;
	const file = new CustomFile(filename, voiceBuffer.length, '', voiceBuffer);

	return await sendMessageLoose(client, targetChatId, {
		file: file,
		message: caption,
		formattingEntities: message.entities || [],
		attributes: message.media?.document?.attributes,
	});
}

// Audio handler
async function handleAudio(
	client: TelegramClientInstance,
	message: TelegramMessageView,
	targetChatId: string,
	options: CopyOptions,
): Promise<TelegramMessageView> {
	const caption = options.includeCaption ? getMessageText(message) : '';

	const audioBuffer = await downloadMediaBuffer(client, message);

	const filename = getFilename(message) || `audio_${Date.now()}.mp3`;
	const file = new CustomFile(filename, audioBuffer.length, '', audioBuffer);

	return await sendMessageLoose(client, targetChatId, {
		file: file,
		message: caption,
		formattingEntities: message.entities || [],
		attributes: message.media?.document?.attributes,
	});
}

// Location handler
async function handleLocation(
	client: TelegramClientInstance,
	message: TelegramMessageView,
	targetChatId: string,
	options: CopyOptions,
): Promise<TelegramMessageView> {
	const caption = options.includeCaption ? getMessageText(message) : '';

	return (await client.invoke(
		new Api.messages.SendMedia({
			peer: targetChatId,
			media: new Api.InputMediaGeoPoint({
				geoPoint: new Api.InputGeoPoint({
					lat: message.media?.geo?.lat ?? 0,
					long: message.media?.geo?.long ?? 0,
				}),
			}),
			message: caption,
			randomId: bigInt(Math.floor(Math.random() * 1000000000)),
		}),
	)) as unknown as TelegramMessageView;
}

// Contact handler
async function handleContact(
	client: TelegramClientInstance,
	message: TelegramMessageView,
	targetChatId: string,
): Promise<TelegramMessageView> {
	return (await client.invoke(
		new Api.messages.SendMedia({
			peer: targetChatId,
			media: new Api.InputMediaContact({
				phoneNumber: message.media?.contact?.phoneNumber || '',
				firstName: message.media?.contact?.firstName || '',
				lastName: message.media?.contact?.lastName || '',
				vcard: message.media?.contact?.vcard || '',
			}),
			message: '',
			randomId: bigInt(Math.floor(Math.random() * 1000000000)),
		}),
	)) as unknown as TelegramMessageView;
}

// Poll handler
async function handlePoll(
	client: TelegramClientInstance,
	message: TelegramMessageView,
	targetChatId: string,
	options: CopyOptions,
): Promise<TelegramMessageView> {
	const caption = options.includeCaption ? getMessageText(message) : '';
	const poll = message.poll || message.media?.poll;

	// Reuse the logic from the sendPoll operation which uses Api.InputMediaPoll
	return (await client.invoke(
		new Api.messages.SendMedia({
			peer: targetChatId,
			media: new Api.InputMediaPoll({
				poll: new Api.Poll({
					id: bigInt(Math.floor(Math.random() * 1000000000)),
					question: new Api.TextWithEntities({
						text: poll?.question || '',
						entities: [],
					}),
					answers:
						poll?.answers?.map(
							(answer: TelegramPollAnswerView, index: number) =>
								new Api.PollAnswer({
									text: new Api.TextWithEntities({
										text: answer.text || '',
										entities: [],
									}),
									option: Buffer.from(index.toString()),
								}),
						) || [],
					closed: false,
					publicVoters: poll?.publicVoters,
					multipleChoice: poll?.multipleChoice,
					quiz: poll?.quiz,
					hash: bigInt(0),
				}),
			}),
			message: caption,
			randomId: bigInt(Math.floor(Math.random() * 1000000000)),
		}),
	)) as unknown as TelegramMessageView;
}

// Dice handler
async function handleDice(
	client: TelegramClientInstance,
	message: TelegramMessageView,
	targetChatId: string,
): Promise<TelegramMessageView> {
	return (await client.invoke(
		new Api.messages.SendMedia({
			peer: targetChatId,
			media: new Api.InputMediaDice({
				emoticon: message.dice?.emoji || 'ðŸŽ²',
			}),
			message: '',
			randomId: bigInt(Math.floor(Math.random() * 1000000000)),
		}),
	)) as unknown as TelegramMessageView;
}

// Text handler (no media)
async function handleText(
	client: TelegramClientInstance,
	message: TelegramMessageView,
	targetChatId: string,
	options: CopyOptions,
): Promise<TelegramMessageView> {
	const text = options.includeCaption ? getMessageText(message) : '';

	return await sendMessageLoose(client, targetChatId, {
		message: text,
		formattingEntities: message.entities || [],
	});
}
