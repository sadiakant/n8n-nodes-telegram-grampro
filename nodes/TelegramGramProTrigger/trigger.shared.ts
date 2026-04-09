import { Api } from 'telegram';
import type {
	IBinaryData,
	IDataObject,
	INodeExecutionData,
	ITriggerFunctions,
	NodeParameterValueType,
} from 'n8n-workflow';

import type { TelegramTriggerPayload } from '../TelegramGramPro/core/types';

type ParameterContext = Pick<ITriggerFunctions, 'getNode' | 'getNodeParameter' | 'helpers'>;

export type SupportedUpdate = 'message' | 'edited_message';

type SupportedDirection = 'incoming' | 'outgoing' | 'both';
type SupportedChatType = 'private' | 'group' | 'channel';

const ALL_UPDATES: SupportedUpdate[] = ['message', 'edited_message'];
const ALL_CHAT_TYPES: SupportedChatType[] = ['private', 'group', 'channel'];
const DEFAULT_MESSAGE_DIRECTION: SupportedDirection = 'incoming';
const DEDUPE_TTL_MS = 10 * 60 * 1000;

export interface TriggerConfig {
	updates: SupportedUpdate[];
	downloadMedia: boolean;
	messageDirection: SupportedDirection;
	chatTypes: SupportedChatType[];
	chatIds: string[];
	userIds: string[];
}

export interface MessageContext {
	chatName: string | null;
	chatUsername: string | null;
	chatId: string | null;
	senderName: string | null;
	senderUsername: string | null;
	senderId: string | null;
}

export function parseTriggerConfig(context: ParameterContext): TriggerConfig {
	const updates = normalizeUpdates(context.getNodeParameter('updates', ['message']));
	const additionalFields = normalizeDataObject(
		context.getNodeParameter('additionalFields', {}),
		context.getNode().name,
	);

	return {
		updates,
		downloadMedia: Boolean(additionalFields.download),
		messageDirection: normalizeDirection(additionalFields.messageDirection),
		chatTypes: normalizeChatTypes(additionalFields.chatTypes),
		chatIds: parseCommaSeparatedValues(additionalFields.chatIds),
		userIds: parseCommaSeparatedValues(additionalFields.userIds),
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
	if (!matchesDirection(message, config.messageDirection)) {
		return false;
	}

	if (!matchesChatType(message, config.chatTypes)) {
		return false;
	}

	if (!matchesConfiguredValues(config.chatIds, [
		messageContext.chatId,
		messageContext.chatUsername,
		messageContext.chatName,
	])) {
		return false;
	}

	if (!matchesConfiguredValues(config.userIds, [
		messageContext.senderId,
		messageContext.senderUsername,
		messageContext.senderName,
	])) {
		return false;
	}

	return true;
}

export function buildTriggerPayload(
	updateType: SupportedUpdate,
	message: Api.Message,
	messageContext: MessageContext,
): TelegramTriggerPayload {
	const messageType = detectMessageType(message);

	return {
		updateType,
		message: message.message ?? message.text ?? '',
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
	};
}

export async function createExecutionItem(
	context: ITriggerFunctions,
	message: Api.Message,
	payload: TelegramTriggerPayload,
	config: TriggerConfig,
): Promise<INodeExecutionData> {
	const item: INodeExecutionData = {
		json: payload as unknown as IDataObject,
	};

	if (!config.downloadMedia || !shouldAttachBinary(payload.messageType)) {
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

	const parsed = value.filter((entry): entry is SupportedUpdate =>
		typeof entry === 'string' && ALL_UPDATES.includes(entry as SupportedUpdate),
	);

	return parsed.length > 0 ? parsed : ['message'];
}

function normalizeDirection(value: unknown): SupportedDirection {
	return value === 'incoming' || value === 'outgoing' || value === 'both'
		? value
		: DEFAULT_MESSAGE_DIRECTION;
}

function normalizeChatTypes(value: unknown): SupportedChatType[] {
	if (!Array.isArray(value) || value.length === 0) {
		return ALL_CHAT_TYPES;
	}

	const parsed = value.filter(
		(entry): entry is SupportedChatType =>
			typeof entry === 'string' && ALL_CHAT_TYPES.includes(entry as SupportedChatType),
	);

	return parsed.length > 0 ? parsed : ALL_CHAT_TYPES;
}

function normalizeDataObject(value: NodeParameterValueType | object, nodeName: string): IDataObject {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`Node "${nodeName}" returned invalid additional fields configuration.`);
	}

	return value as IDataObject;
}

function parseCommaSeparatedValues(value: unknown): string[] {
	if (typeof value !== 'string') {
		return [];
	}

	return value
		.split(',')
		.map((entry) => normalizeMatchValue(entry))
		.filter((entry): entry is string => entry !== null);
}

function matchesDirection(message: Api.Message, direction: SupportedDirection): boolean {
	if (direction === 'both') {
		return true;
	}

	return direction === 'outgoing' ? Boolean(message.out) : !message.out;
}

function matchesChatType(message: Api.Message, chatTypes: SupportedChatType[]): boolean {
	if (message.isPrivate) {
		return chatTypes.includes('private');
	}

	if (message.isGroup) {
		return chatTypes.includes('group');
	}

	if (message.isChannel) {
		return chatTypes.includes('channel');
	}

	return false;
}

function matchesConfiguredValues(configuredValues: string[], candidates: Array<string | null>): boolean {
	if (configuredValues.length === 0) {
		return true;
	}

	const normalizedCandidates = new Set<string>();
	for (const candidate of candidates) {
		const normalized = normalizeMatchValue(candidate);
		if (!normalized) {
			continue;
		}

		normalizedCandidates.add(normalized);
		for (const alias of expandIdAliases(normalized)) {
			normalizedCandidates.add(alias);
		}
	}

	return configuredValues.some((configuredValue) => {
		if (normalizedCandidates.has(configuredValue)) {
			return true;
		}

		return expandIdAliases(configuredValue).some((alias) => normalizedCandidates.has(alias));
	});
}

function normalizeMatchValue(value: unknown): string | null {
	if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') {
		return null;
	}

	const normalized = String(value).trim().toLowerCase();
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
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
		return String(value);
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
		messageType === 'photo' ? 'image/jpeg' : document?.mimeType ?? 'application/octet-stream';
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

	if (
		typeof value === 'object' &&
		'getReader' in value &&
		typeof value.getReader === 'function'
	) {
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
