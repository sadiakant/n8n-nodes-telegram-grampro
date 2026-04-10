import { Api } from 'telegram';
import type {
	IBinaryData,
	IDataObject,
	INodeExecutionData,
	ITriggerFunctions,
	NodeParameterValueType,
} from 'n8n-workflow';

import { renderTelegramEntities } from '../TelegramGramPro/core/messageFormatting';
import type { TelegramTriggerPayload } from '../TelegramGramPro/core/types';

type ParameterContext = Pick<ITriggerFunctions, 'getNode' | 'getNodeParameter' | 'helpers'>;

export type SupportedUpdate = 'message' | 'edited_message';
export type ListeningMode = 'incoming' | 'outgoing';

const ALL_UPDATES: SupportedUpdate[] = ['message', 'edited_message'];
const ALL_LISTENING_MODES: ListeningMode[] = ['incoming', 'outgoing'];
const DEDUPE_TTL_MS = 10 * 60 * 1000;

export interface TriggerConfig {
	updates: SupportedUpdate[];
	listeningMode: ListeningMode[];
	allMessages: boolean;
	onlyUserMessages: boolean;
	onlyChannelMessages: boolean;
	onlyGroupMessages: boolean;
	exceptSelectedChatsOnly: boolean;
	exceptSelectedChats: string[];
	selectedChatsOnly: boolean;
	selectedChats: string[];
}

export interface MessageContext {
	chatName: string | null;
	chatUsername: string | null;
	chatId: string | null;
	senderName: string | null;
	senderUsername: string | null;
	senderId: string | null;
}

type TriggerMessageEntityView = {
	className?: string;
	_?: string;
	offset?: number;
	length?: number;
	url?: string;
};

export function parseTriggerConfig(context: ParameterContext): TriggerConfig {
	const updates = normalizeUpdates(context.getNodeParameter('updates', ['message']));
	const listeningMode = normalizeListeningModes(
		context.getNodeParameter('listeningMode', ['incoming', 'outgoing']),
	);
	const exceptSelectedChatsOnly = Boolean(
		context.getNodeParameter('exceptSelectedChatsOnly', false),
	);
	const rawExceptSelectedChats = context.getNodeParameter('exceptSelectedChats', '[]');
	const rawSelectedChatsOnly = Boolean(context.getNodeParameter('selectedChatsOnly', false));
	const rawOnlyUserMessages = Boolean(context.getNodeParameter('onlyUserMessages', false));
	const rawOnlyChannelMessages = Boolean(context.getNodeParameter('onlyChannelMessages', false));
	const rawOnlyGroupMessages = Boolean(context.getNodeParameter('onlyGroupMessages', false));
	const rawAllMessages = Boolean(context.getNodeParameter('allMessages', true));
	const rawSelectedChats = context.getNodeParameter('selectedChats', '[]');
	const hasOnlyMessageFilters =
		rawOnlyUserMessages || rawOnlyChannelMessages || rawOnlyGroupMessages;
	const selectedChatsOnly = hasOnlyMessageFilters ? false : rawSelectedChatsOnly;
	const onlyUserMessages = selectedChatsOnly ? false : rawOnlyUserMessages;
	const onlyChannelMessages = selectedChatsOnly ? false : rawOnlyChannelMessages;
	const onlyGroupMessages = selectedChatsOnly ? false : rawOnlyGroupMessages;
	const hasSpecificInclusionFilter =
		onlyUserMessages || onlyChannelMessages || onlyGroupMessages || selectedChatsOnly;

	return {
		updates,
		listeningMode,
		allMessages: hasSpecificInclusionFilter ? false : rawAllMessages,
		onlyUserMessages,
		onlyChannelMessages,
		onlyGroupMessages,
		exceptSelectedChatsOnly,
		exceptSelectedChats: exceptSelectedChatsOnly
			? parseChatList(context, rawExceptSelectedChats, 'Except Selected Chats')
			: [],
		selectedChatsOnly,
		selectedChats: selectedChatsOnly
			? parseChatList(context, rawSelectedChats, 'Selected Chats')
			: [],
	};
}

export async function resolveMessageContext(message: Api.Message): Promise<MessageContext> {
	const [chatResult, senderResult] = await Promise.allSettled([
		message.getChat?.(),
		message.getSender?.(),
	]);

	const chatEntity = chatResult.status === 'fulfilled' ? chatResult.value : undefined;
	const senderEntity = senderResult.status === 'fulfilled' ? senderResult.value : undefined;

	return {
		chatName: getEntityLabel(chatEntity) ?? fallbackChatName(message),
		chatUsername: getEntityUsername(chatEntity),
		chatId: normalizeString(message.chatId),
		senderName: getEntityLabel(senderEntity) ?? fallbackSenderName(message, chatEntity),
		senderUsername: getEntityUsername(senderEntity),
		senderId: normalizeString(message.senderId),
	};
}

export function shouldProcessMessage(
	message: Api.Message,
	messageContext: MessageContext,
	config: TriggerConfig,
): boolean {
	if (!matchesListeningMode(message, config.listeningMode)) {
		return false;
	}

	const matchesAllMessages = config.allMessages;
	const matchesUser = config.onlyUserMessages && Boolean(message.isPrivate);
	const matchesChannel = config.onlyChannelMessages && Boolean(message.isChannel);
	const matchesGroup = config.onlyGroupMessages && Boolean(message.isGroup);
	const matchesSelectedChats =
		config.selectedChatsOnly &&
		config.selectedChats.length > 0 &&
		matchesSelectedChat(messageContext, config.selectedChats);

	const shouldInclude =
		matchesAllMessages || matchesUser || matchesChannel || matchesGroup || matchesSelectedChats;

	if (!shouldInclude) {
		return false;
	}

	const matchesExceptSelectedChats =
		config.exceptSelectedChatsOnly &&
		config.exceptSelectedChats.length > 0 &&
		matchesSelectedChat(messageContext, config.exceptSelectedChats);

	return !matchesExceptSelectedChats;
}

export function buildTriggerPayload(
	updateType: SupportedUpdate,
	message: Api.Message,
	messageContext: MessageContext,
): TelegramTriggerPayload {
	const messageType = detectMessageType(message);
	const rawMessage = getMessageText(message);
	const hasMedia = !!message.media;
	const hasWebPreview = detectWebPreview(message);

	return {
		updateType,
		message: getRichMessageText(message),
		rawMessage,
		date: toIsoDate(message.date),
		editDate: toIsoDate(message.editDate),
		chatName: messageContext.chatName,
		chatId: messageContext.chatId,
		senderName: messageContext.senderName,
		senderId: messageContext.senderId,
		messageId: String(message.id),
		isPrivate: Boolean(message.isPrivate),
		isGroup: Boolean(message.isGroup),
		isChannel: Boolean(message.isChannel),
		isOutgoing: Boolean(message.out),
		messageType,
		hasMedia,
		hasWebPreview,
	};
}

export async function createExecutionItem(
	context: ITriggerFunctions,
	message: Api.Message,
	payload: TelegramTriggerPayload,
): Promise<INodeExecutionData> {
	const item: INodeExecutionData = {
		json: payload as unknown as IDataObject,
	};

	if (!shouldAttachBinary(payload.messageType)) {
		return item;
	}

	try {
		const binaryData = await downloadBinaryData(context, message, payload.messageType);
		if (binaryData) {
			item.binary = {
				data: binaryData,
			};
		}
	} catch (error) {
		item.json.mediaDownloadError = getErrorMessage(error);
	}

	return item;
}

export function createDedupeTracker() {
	const seenKeys = new Map<string, number>();

	return {
		shouldEmit(key: string): boolean {
			const now = Date.now();
			cleanupExpiredKeys(seenKeys, now);

			if (seenKeys.has(key)) {
				return false;
			}

			seenKeys.set(key, now);
			return true;
		},
	};
}

export function createMessageDeduplicationKey(
	updateType: SupportedUpdate,
	message: Api.Message,
): string {
	return [
		updateType,
		normalizeString(message.chatId) ?? 'unknown-chat',
		String(message.id),
		String(message.editDate ?? message.date ?? 0),
		message.out ? 'out' : 'in',
	].join(':');
}

function normalizeUpdates(value: NodeParameterValueType | object): SupportedUpdate[] {
	if (!Array.isArray(value)) {
		return ['message'];
	}

	const parsed = value.filter(
		(entry): entry is SupportedUpdate =>
			typeof entry === 'string' && ALL_UPDATES.includes(entry as SupportedUpdate),
	);

	return parsed.length > 0 ? parsed : ['message'];
}

function getMessageText(message: Api.Message): string {
	return message.message ?? message.text ?? '';
}

function getRichMessageText(message: Api.Message): string {
	const text = getMessageText(message);
	return renderTelegramEntities(text, normalizeMessageEntities(message.entities));
}

function normalizeMessageEntities(
	entities: Api.TypeMessageEntity[] | undefined,
): TriggerMessageEntityView[] {
	if (!Array.isArray(entities)) {
		return [];
	}

	return entities
		.filter(
			(entity): entity is Api.TypeMessageEntity => typeof entity === 'object' && entity !== null,
		)
		.map((entity) => entity as unknown as TriggerMessageEntityView);
}

function normalizeListeningModes(value: NodeParameterValueType | object): ListeningMode[] {
	if (!Array.isArray(value)) {
		return [...ALL_LISTENING_MODES];
	}

	const parsed = value.filter(
		(entry): entry is ListeningMode =>
			typeof entry === 'string' && ALL_LISTENING_MODES.includes(entry as ListeningMode),
	);

	return parsed.length > 0 ? parsed : [...ALL_LISTENING_MODES];
}

function matchesListeningMode(message: Api.Message, listeningMode: ListeningMode[]): boolean {
	const direction: ListeningMode = message.out ? 'outgoing' : 'incoming';
	return listeningMode.includes(direction);
}

function parseChatList(
	context: ParameterContext,
	rawChatList: NodeParameterValueType | object,
	fieldLabel: string,
): string[] {
	if (typeof rawChatList !== 'string') {
		throw new Error(`Node "${context.getNode().name}" returned invalid ${fieldLabel} value.`);
	}

	try {
		const parsed = JSON.parse(rawChatList);
		if (typeof parsed === 'string' || typeof parsed === 'number' || typeof parsed === 'bigint') {
			return normalizeChatEntries([parsed]);
		}

		if (!Array.isArray(parsed)) {
			throw new Error(`${fieldLabel} must be a JSON array, string, or number.`);
		}

		return normalizeChatEntries(parsed);
	} catch (error) {
		const fallbackValues = rawChatList
			.split(',')
			.map((entry) => entry.trim())
			.filter((entry) => entry.length > 0);

		if (fallbackValues.length > 0) {
			return normalizeChatEntries(fallbackValues);
		}

		throw new Error(
			`${fieldLabel} must be a valid JSON array, single value, or comma-separated list. Example: ["group1","@username","-100123456789","1122334455"] or 8569392472. ${getErrorMessage(error)}`,
		);
	}
}

function normalizeChatEntries(values: unknown[]): string[] {
	const expanded = new Set<string>();

	for (const value of values) {
		const normalized = normalizeMatchValue(value);
		if (!normalized) {
			continue;
		}

		for (const alias of expandIdAliases(normalized)) {
			expanded.add(alias);
		}
	}

	return Array.from(expanded);
}

function matchesSelectedChat(messageContext: MessageContext, selectedChats: string[]): boolean {
	const candidates = new Set<string>();

	for (const value of [
		messageContext.chatId,
		messageContext.senderId,
		messageContext.chatName,
		messageContext.chatUsername,
		messageContext.senderName,
		messageContext.senderUsername,
	]) {
		const normalized = normalizeMatchValue(value);
		if (!normalized) {
			continue;
		}

		candidates.add(normalized);
		for (const alias of expandIdAliases(normalized)) {
			candidates.add(alias);
		}
	}

	return selectedChats.some((entry) => candidates.has(entry));
}

function normalizeMatchValue(value: unknown): string | null {
	const rawValue = stringifyMatchValue(value);
	if (rawValue === null) {
		return null;
	}

	const normalized = rawValue.trim().toLowerCase();
	if (!normalized) {
		return null;
	}

	return normalized.startsWith('@') ? normalized.slice(1) : normalized;
}

function expandIdAliases(value: string): string[] {
	const aliases = new Set([value]);

	if (!/^-?\d+$/.test(value)) {
		return Array.from(aliases);
	}

	if (value.startsWith('-100') && value.length > 4) {
		const bareValue = value.slice(4);
		aliases.add(bareValue);
		aliases.add(`-${bareValue}`);
		return Array.from(aliases);
	}

	if (value.startsWith('-')) {
		const bareValue = value.slice(1);
		aliases.add(bareValue);
		aliases.add(`-100${bareValue}`);
		return Array.from(aliases);
	}

	aliases.add(`-${value}`);
	aliases.add(`-100${value}`);
	return Array.from(aliases);
}

function getEntityLabel(entity: unknown): string | null {
	if (entity instanceof Api.Channel || entity instanceof Api.Chat) {
		return entity.title ?? null;
	}

	if (entity instanceof Api.User) {
		const fullName = [entity.firstName, entity.lastName].filter(Boolean).join(' ').trim();
		return fullName || entity.username || null;
	}

	return null;
}

function getEntityUsername(entity: unknown): string | null {
	if (entity instanceof Api.Channel || entity instanceof Api.User) {
		return entity.username ?? null;
	}

	return null;
}

function fallbackChatName(message: Api.Message): string | null {
	if (message.isPrivate && message.senderId) {
		return message.senderId.toString();
	}

	return normalizeString(message.chatId);
}

function fallbackSenderName(message: Api.Message, chatEntity: unknown): string | null {
	if (message.isChannel && !message.senderId) {
		return getEntityLabel(chatEntity) ?? normalizeString(message.chatId);
	}

	return normalizeString(message.senderId);
}

function normalizeString(value: unknown): string | null {
	return stringifyMatchValue(value);
}

function stringifyMatchValue(value: unknown): string | null {
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
		return String(value);
	}

	if (typeof value === 'object' && value !== null && 'toString' in value) {
		const stringValue = value.toString();
		if (typeof stringValue === 'string' && stringValue !== '[object Object]') {
			return stringValue;
		}
	}

	return null;
}

function detectMessageType(message: Api.Message): TelegramTriggerPayload['messageType'] {
	if (message.photo) {
		return 'photo';
	}

	if (message.video) {
		return 'video';
	}

	if (message.document) {
		return 'document';
	}

	if ((message.message ?? '').trim()) {
		return 'text';
	}

	return 'other';
}

function detectWebPreview(message: Api.Message): boolean {
	if (!message.media) {
		return false;
	}

	if (message.media instanceof Api.MessageMediaWebPage) {
		return !(message.media.webpage instanceof Api.WebPageEmpty);
	}

	// Sometimes web page preview is inside the media directly in different format
	if ('webpage' in message.media) {
		return !!message.media.webpage && !(message.media.webpage instanceof Api.WebPageEmpty);
	}

	return false;
}

function shouldAttachBinary(messageType: TelegramTriggerPayload['messageType']): boolean {
	return messageType === 'photo' || messageType === 'video' || messageType === 'document';
}

async function downloadBinaryData(
	context: ITriggerFunctions,
	message: Api.Message,
	messageType: TelegramTriggerPayload['messageType'],
): Promise<IBinaryData | null> {
	const downloadResult = await downloadMediaLoose(message);
	const buffer = await toBuffer(downloadResult);

	if (!buffer) {
		return null;
	}

	const document = message.document;
	const mimeType =
		messageType === 'photo' ? 'image/jpeg' : (document?.mimeType ?? 'application/octet-stream');
	const fileName =
		getDocumentFileName(document) ?? inferFileName(messageType, message.id, mimeType);

	return await context.helpers.prepareBinaryData(buffer, fileName, mimeType);
}

async function downloadMediaLoose(message: Api.Message): Promise<unknown> {
	return await message.downloadMedia({} as never);
}

async function toBuffer(value: unknown): Promise<Buffer | null> {
	if (!value) {
		return null;
	}

	if (Buffer.isBuffer(value)) {
		return value;
	}

	if (value instanceof Uint8Array) {
		return Buffer.from(value);
	}

	if (typeof value === 'string') {
		return Buffer.from(value);
	}

	if (typeof value === 'object' && 'on' in value && typeof value.on === 'function') {
		return await new Promise((resolve, reject) => {
			const chunks: Buffer[] = [];
			const stream = value as {
				on: (event: string, callback: (chunk?: Uint8Array) => void) => void;
			};

			stream.on('data', (chunk?: Uint8Array) => {
				if (chunk) {
					chunks.push(Buffer.from(chunk));
				}
			});
			stream.on('end', () => resolve(Buffer.concat(chunks)));
			stream.on('error', (error?: Uint8Array) => reject(error));
		});
	}

	if (typeof value === 'object' && 'getReader' in value && typeof value.getReader === 'function') {
		const reader = value.getReader() as {
			read: () => Promise<{ done: boolean; value?: Uint8Array }>;
		};
		const chunks: Uint8Array[] = [];

		while (true) {
			const { done, value: chunk } = await reader.read();
			if (done) {
				break;
			}

			if (chunk) {
				chunks.push(chunk);
			}
		}

		return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
	}

	return null;
}

function getDocumentFileName(document: Api.Document | undefined): string | null {
	if (!document) {
		return null;
	}

	for (const attribute of document.attributes) {
		if (attribute instanceof Api.DocumentAttributeFilename) {
			return attribute.fileName;
		}
	}

	return null;
}

function inferFileName(
	messageType: TelegramTriggerPayload['messageType'],
	messageId: number,
	mimeType: string,
): string {
	if (messageType === 'photo') {
		return `photo_${messageId}.jpg`;
	}

	if (messageType === 'video') {
		return `video_${messageId}${getExtensionFromMimeType(mimeType) || '.mp4'}`;
	}

	return `document_${messageId}${getExtensionFromMimeType(mimeType)}`;
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

function cleanupExpiredKeys(seenKeys: Map<string, number>, now: number): void {
	for (const [key, seenAt] of seenKeys.entries()) {
		if (now - seenAt > DEDUPE_TTL_MS) {
			seenKeys.delete(key);
		}
	}
}

function toIsoDate(value: Date | number | undefined): string | null {
	if (value instanceof Date) {
		return value.toISOString();
	}

	if (typeof value === 'number') {
		return new Date(value * 1000).toISOString();
	}

	return null;
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
