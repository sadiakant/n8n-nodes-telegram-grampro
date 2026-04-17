import { ITriggerFunctions, NodeParameterValueType, INodeExecutionData } from 'n8n-workflow';
import { Api } from 'teleproto';

import { TelegramTriggerPayload } from '../TelegramGramPro/core/types';
import {
	buildTriggerPayload as buildTriggerPayloadShared,
	buildAlbumTriggerPayload as buildAlbumTriggerPayloadShared,
	createSharedBinaryExecutionItem,
	MessageContext as SharedMessageContext,
	resolveMessageContext as resolveMessageContextShared,
	SupportedUpdate,
} from '../TelegramGramPro/core/payloadBuilders';

type ParameterContext = Pick<ITriggerFunctions, 'getNode' | 'getNodeParameter' | 'helpers'>;

export type ListeningMode = 'incoming' | 'outgoing';

const ALL_UPDATES: SupportedUpdate[] = [
	'message',
	'edited_message',
	'deleted_message',
	'user_update',
];
const ALL_LISTENING_MODES: ListeningMode[] = ['incoming', 'outgoing'];
const DEDUPE_TTL_MS = 10 * 60 * 1000;

export interface TriggerConfig {
	updates: SupportedUpdate[];
	listeningMode: ListeningMode[];
	disableBinary: boolean;
	allMessages: boolean;
	onlyUserMessages: boolean;
	onlyChannelMessages: boolean;
	onlyGroupMessages: boolean;
	exceptSelectedChatsOnly: boolean;
	exceptSelectedChats: string[];
	selectedChatsOnly: boolean;
	selectedChats: string[];
}

export type MessageContext = SharedMessageContext;
export { SupportedUpdate };

export function parseTriggerConfig(this: ITriggerFunctions): TriggerConfig {
	const updates = normalizeUpdates(this.getNodeParameter('updates', []));
	const listeningMode = normalizeListeningModes(this.getNodeParameter('listeningMode', []));
	const disableBinary = this.getNodeParameter('disableBinary', false) as boolean;

	const filterMode = this.getNodeParameter('filterMode', '') as string;
	const hasFilterMode = typeof filterMode === 'string' && filterMode.length > 0;
	const allMessages = hasFilterMode
		? filterMode === 'all'
		: (this.getNodeParameter('allMessages', true) as boolean);
	const onlyUserMessages = hasFilterMode
		? filterMode === 'onlyPrivate'
		: (this.getNodeParameter('onlyUserMessages', false) as boolean);
	const onlyChannelMessages = hasFilterMode
		? filterMode === 'onlyChannels'
		: (this.getNodeParameter('onlyChannelMessages', false) as boolean);
	const onlyGroupMessages = hasFilterMode
		? filterMode === 'onlyGroups'
		: (this.getNodeParameter('onlyGroupMessages', false) as boolean);

	const chatFilterMode = this.getNodeParameter('chatFilterMode', '') as string;
	const hasChatFilterMode = typeof chatFilterMode === 'string' && chatFilterMode.length > 0;
	const selectedChatsOnly = hasChatFilterMode
		? chatFilterMode === 'include'
		: (this.getNodeParameter('selectedChatsOnly', false) as boolean);
	const exceptSelectedChatsOnly = hasChatFilterMode
		? chatFilterMode === 'exclude'
		: (this.getNodeParameter('exceptSelectedChatsOnly', false) as boolean);

	let selectedChats: string[] = [];
	if (selectedChatsOnly) {
		selectedChats = parseChatList(this, this.getNodeParameter('selectedChats', ''));
	}

	let exceptSelectedChats: string[] = [];
	if (exceptSelectedChatsOnly) {
		exceptSelectedChats = parseChatList(this, this.getNodeParameter('exceptSelectedChats', ''));
	}

	return {
		updates,
		listeningMode,
		disableBinary,
		allMessages,
		onlyUserMessages,
		onlyChannelMessages,
		onlyGroupMessages,
		exceptSelectedChatsOnly,
		exceptSelectedChats,
		selectedChatsOnly,
		selectedChats,
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

	if (config.onlyUserMessages && !messageContext.isPrivateChat) {
		return false;
	}

	if (config.onlyChannelMessages && !messageContext.isChannelChat) {
		return false;
	}

	if (config.onlyGroupMessages && !messageContext.isGroupChat) {
		return false;
	}

	if (config.selectedChatsOnly && !matchesSelectedChat(messageContext, config.selectedChats)) {
		return false;
	}

	if (
		config.exceptSelectedChatsOnly &&
		matchesSelectedChat(messageContext, config.exceptSelectedChats)
	) {
		return false;
	}

	return true;
}

export async function resolveMessageContext(message: Api.Message): Promise<MessageContext> {
	return (await resolveMessageContextShared(message)) as MessageContext;
}

export function buildTriggerPayload(
	updateType: SupportedUpdate | undefined,
	message: Api.Message,
	messageContext: MessageContext,
): TelegramTriggerPayload {
	return buildTriggerPayloadShared(updateType, message, messageContext);
}

export function buildAlbumTriggerPayload(
	updateType: SupportedUpdate | undefined,
	messages: Api.Message[],
	messageContext: MessageContext,
): TelegramTriggerPayload {
	return buildAlbumTriggerPayloadShared(updateType, messages, messageContext);
}

export async function createExecutionItem(
	context: ITriggerFunctions,
	message: Api.Message,
	payload: TelegramTriggerPayload,
	disableBinary: boolean,
): Promise<INodeExecutionData> {
	return createSharedBinaryExecutionItem(context, [message], payload, disableBinary);
}

export async function createAlbumExecutionItem(
	context: ITriggerFunctions,
	messages: Api.Message[],
	payload: TelegramTriggerPayload,
	disableBinary: boolean,
): Promise<INodeExecutionData> {
	return createSharedBinaryExecutionItem(context, messages, payload, disableBinary);
}

export function createAlbumDeduplicationKey(
	updateType: SupportedUpdate,
	messages: Api.Message[],
): string {
	const first = messages[0];
	const last = messages[messages.length - 1];
	const gid = first.groupedId?.toString() ?? 'none';

	return [
		updateType,
		gid,
		messages.length,
		first.id,
		last.id,
		first.chatId?.toString() ?? 'unknown',
	].join(':');
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
		message.chatId?.toString() ?? 'unknown-chat',
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
): string[] {
	if (typeof rawChatList !== 'string') {
		return [];
	}

	try {
		let parsed: unknown;
		try {
			parsed = JSON.parse(rawChatList);
		} catch {
			parsed = rawChatList;
		}

		if (typeof parsed === 'string' || typeof parsed === 'number' || typeof parsed === 'bigint') {
			return normalizeChatEntries([parsed]);
		}

		if (!Array.isArray(parsed)) {
			// Try comma separated
			const parts = String(rawChatList)
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
			return normalizeChatEntries(parts);
		}

		return normalizeChatEntries(parsed);
	} catch {
		return [];
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
	let rawValue: string | null = null;
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
		rawValue = String(value);
	} else if (typeof value === 'object' && value !== null && 'toString' in value) {
		rawValue = value.toString();
	}

	if (rawValue === null) return null;

	const normalized = rawValue.trim().toLowerCase();
	if (!normalized) return null;

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

function cleanupExpiredKeys(seenKeys: Map<string, number>, now: number): void {
	for (const [key, seenAt] of seenKeys.entries()) {
		if (now - seenAt > DEDUPE_TTL_MS) {
			seenKeys.delete(key);
		}
	}
}
