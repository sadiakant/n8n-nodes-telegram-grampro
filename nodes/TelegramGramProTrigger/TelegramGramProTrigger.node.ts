import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ITriggerFunctions,
	ITriggerResponse,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { Api } from 'teleproto';
import { Album } from 'teleproto/events/Album';
import { EditedMessage } from 'teleproto/events/EditedMessage';
import { NewMessage } from 'teleproto/events/NewMessage';
import { DeletedMessage } from 'teleproto/events/DeletedMessage';
import { UserUpdate } from 'teleproto/events/UserUpdate';
import type { AlbumEvent } from 'teleproto/events/Album';
import type { EditedMessageEvent } from 'teleproto/events/EditedMessage';
import type { NewMessageEvent } from 'teleproto/events/NewMessage';
import type { DeletedMessageEvent } from 'teleproto/events/DeletedMessage';
import type { UserUpdateEvent } from 'teleproto/events/UserUpdate';

import { testTelegramApi } from '../../credentials/TelegramGramProApi.credentials';
import { disconnectClient, getClient } from '../TelegramGramPro/core/clientManager';
import { logger } from '../TelegramGramPro/core/logger';
import { buildUserUpdatePayload } from '../TelegramGramPro/core/payloadBuilders';
import type { TelegramCredentials, TelegramTriggerPayload } from '../TelegramGramPro/core/types';
import {
	buildTriggerPayload,
	buildAlbumTriggerPayload,
	createDedupeTracker,
	createAlbumDeduplicationKey,
	createExecutionItem,
	createAlbumExecutionItem,
	createMessageDeduplicationKey,
	parseTriggerConfig,
	resolveMessageContext,
	shouldProcessMessage,
	type SupportedUpdate,
} from './trigger.shared';

type RegisteredHandler = {
	event: NewMessage | EditedMessage | Album | DeletedMessage | UserUpdate;
	handler: (...args: unknown[]) => void;
};

type MessageSnapshotStore = ReturnType<typeof createMessageSnapshotStore>;

const MESSAGE_SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;
const MESSAGE_SNAPSHOT_MAX_SIZE = 5000;

export class TelegramGramProTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Telegram GramPro Trigger',
		name: 'telegramGramProTrigger',
		icon: 'file:telegram-grampro.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '=Updates: {{$parameter["updates"].join(", ")}}',
		description: 'Starts the workflow on Telegram user account updates',
		defaults: {
			name: 'Telegram GramPro Trigger',
		},
		codex: {
			categories: ['Communication'],
			alias: ['Telegram GramPro Trigger', 'GramPro Trigger'],
			resources: {
				credentialDocumentation: [
					{
						url: 'https://github.com/sadiakant/n8n-nodes-telegram-grampro/blob/main/docs/AUTHORIZATION_GUIDE.md',
					},
				],
				primaryDocumentation: [
					{
						url: 'https://github.com/sadiakant/n8n-nodes-telegram-grampro/blob/main/docs/OPERATIONS_GUIDE.md',
					},
				],
			},
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'telegramGramProApi',
				required: true,
				testedBy: 'testTelegramApi',
			},
		],
		properties: [
			{
				displayName:
					'Telegram user accounts do not support Bot API webhooks. This trigger keeps your MTProto session connected while the workflow is active.',
				name: 'userAccountNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Trigger On',
				name: 'updates',
				type: 'multiOptions',
				required: true,
				default: ['message'],
				options: [
					{
						name: 'Message',
						value: 'message',
						description:
							'Trigger on new messages from private chats, bots, groups, supergroups, or channels',
					},
					{
						name: 'Edited Message',
						value: 'edited_message',
						description: 'Trigger when an existing message visible to the account is edited',
					},
					{
						name: 'Deleted Message',
						value: 'deleted_message',
						description: 'Trigger when a message is deleted (teleproto feature)',
					},
					{
						name: 'User Update',
						value: 'user_update',
						description: 'Trigger when a user goes online, offline, or changes status (teleproto feature)',
					},
				],
			},
			{
				displayName: 'Listening Mode',
				name: 'listeningMode',
				type: 'multiOptions',
				required: true,
				default: ['incoming', 'outgoing'],
				options: [
					{
						name: 'Incoming Messages',
						value: 'incoming',
						description: 'Listen only for incoming messages',
					},
					{
						name: 'Outgoing Messages',
						value: 'outgoing',
						description: 'Listen only for outgoing messages',
					},
				],
			},
			{
				displayName: 'Disable Binary',
				name: 'disableBinary',
				type: 'boolean',
				default: true,
				description:
					'Whether to skip downloading media binaries and return only media metadata in JSON',
			},
			{
				displayName: 'All Messages',
				name: 'allMessages',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						onlyUserMessages: [false],
						onlyChannelMessages: [false],
						onlyGroupMessages: [false],
						selectedChatsOnly: [false],
					},
				},
				description:
					'Whether to capture all messages from users, bots, groups, supergroups, and channels',
			},
			{
				displayName: 'Only User Messages',
				name: 'onlyUserMessages',
				type: 'boolean',
				default: false,
				displayOptions: {
					hide: {
						selectedChatsOnly: [true],
					},
				},
				description: 'Whether to capture only private user or bot messages',
			},
			{
				displayName: 'Only Channel Messages',
				name: 'onlyChannelMessages',
				type: 'boolean',
				default: false,
				displayOptions: {
					hide: {
						selectedChatsOnly: [true],
					},
				},
				description: 'Whether to capture only broadcast channel messages or posts',
			},
			{
				displayName: 'Only Group Messages',
				name: 'onlyGroupMessages',
				type: 'boolean',
				default: false,
				displayOptions: {
					hide: {
						selectedChatsOnly: [true],
					},
				},
				description: 'Whether to capture only group, supergroup, and gigagroup messages',
			},
			{
				displayName: 'Selected Chats Only',
				name: 'selectedChatsOnly',
				type: 'boolean',
				default: false,
				displayOptions: {
					hide: {
						onlyUserMessages: [true],
						onlyChannelMessages: [true],
						onlyGroupMessages: [true],
					},
				},
				description:
					'Whether to capture messages only when the chat or sender matches your selected list (this disables All Messages)',
			},
			{
				displayName: 'Except Selected Chats Only',
				name: 'exceptSelectedChatsOnly',
				type: 'boolean',
				default: false,
				description:
					'Whether to ignore messages when the chat or sender matches your excluded list',
			},
			{
				displayName: 'Selected Chats',
				name: 'selectedChats',
				type: 'string',
				default: '[]',
				displayOptions: {
					show: {
						selectedChatsOnly: [true],
					},
				},
				description:
					'JSON array of chat IDs, usernames, or names to match. Example: ["group1","user1","@username","-100123456789","1122334455"].',
			},
			{
				displayName: 'Except Selected Chats',
				name: 'exceptSelectedChats',
				type: 'string',
				default: '[]',
				displayOptions: {
					show: {
						exceptSelectedChatsOnly: [true],
					},
				},
				description:
					'JSON array of chat IDs, usernames, or names to ignore. Example: ["username1","channel1","channel2","group1"].',
			},
		],
		usableAsTool: true,
	};

	methods = {
		credentialTest: {
			testTelegramApi,
		},
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const credentials = (await this.getCredentials('telegramGramProApi')) as TelegramCredentials;
		if (!credentials) {
			throw new NodeOperationError(this.getNode(), 'Telegram GramPro credentials are required.');
		}

		const config = parseTriggerConfig.call(this);
		const client = await getClient(
			credentials.apiId,
			credentials.apiHash,
			credentials.session,
			{
				receiveUpdates: true,
				cacheClient: true,
				verifyAuthorization: true,
				autoReconnect: true,
			},
			'trigger',
		);

		if (!client.connected) {
			await client.connect();
		}

		const dedupe = createDedupeTracker();
		const messageSnapshots = createMessageSnapshotStore();
		const handlers: RegisteredHandler[] = [];

		for (const updateType of config.updates) {
			const registration = createRegistration(
				updateType,
				async (items) => {
					this.emit([items]);
				},
				this,
				client,
				config,
				dedupe,
				messageSnapshots,
			);

			client.addEventHandler(registration.handler, registration.event);
			handlers.push(registration);

			if (updateType === 'message') {
				const albumRegistration = createAlbumRegistration(
					async (items) => {
						this.emit([items]);
					},
					this,
					client,
					config,
					dedupe,
					messageSnapshots,
				);

				client.addEventHandler(albumRegistration.handler, albumRegistration.event);
				handlers.push(albumRegistration);
			}
		}

		const includesDeleted = config.updates.includes('deleted_message');
		const includesMessage = config.updates.includes('message');
		const includesEdited = config.updates.includes('edited_message');

		if (includesDeleted && !includesMessage) {
			const cacheMessageRegistration = createRegistration(
				'message',
				async () => {},
				this,
				client,
				config,
				dedupe,
				messageSnapshots,
				false,
			);
			client.addEventHandler(cacheMessageRegistration.handler, cacheMessageRegistration.event);
			handlers.push(cacheMessageRegistration);

			const cacheAlbumRegistration = createAlbumRegistration(
				async () => {},
				this,
				client,
				config,
				dedupe,
				messageSnapshots,
				false,
			);
			client.addEventHandler(cacheAlbumRegistration.handler, cacheAlbumRegistration.event);
			handlers.push(cacheAlbumRegistration);
		}

		if (includesDeleted && !includesEdited) {
			const cacheEditedRegistration = createRegistration(
				'edited_message',
				async () => {},
				this,
				client,
				config,
				dedupe,
				messageSnapshots,
				false,
			);
			client.addEventHandler(cacheEditedRegistration.handler, cacheEditedRegistration.event);
			handlers.push(cacheEditedRegistration);
		}

		logger.info('[TelegramGramProTrigger] Trigger activated', {
			nodeName: this.getNode().name,
			updates: config.updates.join(','),
			listeningMode: config.listeningMode.join(','),
			allMessages: config.allMessages,
			disableBinary: config.disableBinary,
			exceptSelectedChatsOnly: config.exceptSelectedChatsOnly,
			selectedChatsOnly: config.selectedChatsOnly,
		});

		return {
			closeFunction: async () => {
				for (const { handler, event } of handlers) {
					try {
						client.removeEventHandler(handler, event);
					} catch (error) {
						logger.warn('[TelegramGramProTrigger] Failed to remove event handler', {
							error: getErrorMessage(error),
							updateEvent: event.constructor.name,
						});
					}
				}

				if (client.listEventHandlers().length === 0) {
					try {
						const apiId =
							typeof credentials.apiId === 'string'
								? Number.parseInt(credentials.apiId, 10)
								: credentials.apiId;
						await disconnectClient(apiId, credentials.session, 'trigger');
					} catch (error) {
						logger.warn('[TelegramGramProTrigger] Failed to disconnect update client', {
							error: getErrorMessage(error),
						});
					}
				}

				logger.info('[TelegramGramProTrigger] Trigger deactivated', {
					nodeName: this.getNode().name,
				});
			},
		};
	}
}

function createRegistration(
	updateType: SupportedUpdate,
	emit: (items: INodeExecutionData[]) => Promise<void>,
	context: ITriggerFunctions,
	client: Awaited<ReturnType<typeof getClient>>,
	config: ReturnType<typeof parseTriggerConfig>,
	dedupe: ReturnType<typeof createDedupeTracker>,
	messageSnapshots: MessageSnapshotStore,
	emitEvents = true,
): RegisteredHandler {
	const processEvent = async (
		event: NewMessageEvent | EditedMessageEvent,
		currentUpdateType: SupportedUpdate,
	): Promise<void> => {
		try {
			const message = event.message;
			if (!(message instanceof Api.Message)) {
				return;
			}

			if (currentUpdateType === 'message' && message.groupedId && emitEvents) {
				return;
			}

			const dedupeKey = createMessageDeduplicationKey(currentUpdateType, message);
			if (!dedupe.shouldEmit(dedupeKey)) {
				return;
			}

			const messageContext = await resolveMessageContext(message);
			const payload = buildTriggerPayload(currentUpdateType, message, messageContext);
			messageSnapshots.remember(payload);

			if (!emitEvents) {
				return;
			}
			if (!shouldProcessMessage(message, messageContext, config)) {
				return;
			}
			const item = await createExecutionItem(context, message, payload, config.disableBinary);
			await emit([item]);
		} catch (error) {
			logger.error('[TelegramGramProTrigger] Failed to process Telegram update', {
				error: getErrorMessage(error),
				updateType: currentUpdateType,
				nodeName: context.getNode().name,
			});
		}
	};

	if (updateType === 'edited_message') {
		const event = new EditedMessage({});
		const handler = (...args: unknown[]): void => {
			void processEvent(args[0] as EditedMessageEvent, 'edited_message');
		};

		return {
			event,
			handler,
		};
	}

	if (updateType === 'deleted_message') {
		const event = new DeletedMessage({});
		const handler = (...args: unknown[]): void => {
			void (async () => {
				const deletedEvent = args[0] as DeletedMessageEvent;
				try {
					const payload = await buildDeletedMessagePayload(deletedEvent, messageSnapshots, client);
					await emit([{ json: payload as unknown as IDataObject }]);
				} catch (error) {
					logger.error('[TelegramGramProTrigger] Failed to process deleted message update', {
						error: getErrorMessage(error),
						updateType: 'deleted_message',
						nodeName: context.getNode().name,
					});
				}
			})();
		};

		return {
			event,
			handler,
		};
	}

	if (updateType === 'user_update') {
		const event = new UserUpdate({});
		const handler = (...args: unknown[]): void => {
			void (async () => {
				const userEvent = args[0] as UserUpdateEvent;
				try {
					const payload = await buildUserUpdatePayload(userEvent);
					await emit([{ json: payload as unknown as IDataObject }]);
				} catch (error) {
					logger.error('[TelegramGramProTrigger] Failed to process user update', {
						error: getErrorMessage(error),
						updateType: 'user_update',
						nodeName: context.getNode().name,
					});
				}
			})();
		};

		return {
			event,
			handler,
		};
	}

	const event = new NewMessage({});
	const handler = (...args: unknown[]): void => {
		void processEvent(args[0] as NewMessageEvent, 'message');
	};

	return {
		event,
		handler,
	};
}

function createAlbumRegistration(
	emit: (items: INodeExecutionData[]) => Promise<void>,
	context: ITriggerFunctions,
	client: Awaited<ReturnType<typeof getClient>>,
	config: ReturnType<typeof parseTriggerConfig>,
	dedupe: ReturnType<typeof createDedupeTracker>,
	messageSnapshots: MessageSnapshotStore,
	emitEvents = true,
): RegisteredHandler {
	const event = new Album({});
	const handler = (...args: unknown[]): void => {
		void processAlbumEvent(
			args[0] as AlbumEvent,
			emit,
			context,
			client,
			config,
			dedupe,
			messageSnapshots,
			emitEvents,
		);
	};

	return {
		event,
		handler,
	};
}

async function processAlbumEvent(
	event: AlbumEvent,
	emit: (items: INodeExecutionData[]) => Promise<void>,
	context: ITriggerFunctions,
	client: Awaited<ReturnType<typeof getClient>>,
	config: ReturnType<typeof parseTriggerConfig>,
	dedupe: ReturnType<typeof createDedupeTracker>,
	messageSnapshots: MessageSnapshotStore,
	emitEvents = true,
): Promise<void> {
	try {
		const messages = event.messages.filter(
			(message): message is Api.Message => message instanceof Api.Message,
		);
		if (messages.length === 0) {
			return;
		}

		const primaryMessage =
			messages.find((message) => (message.message ?? message.text ?? '').trim()) ?? messages[0];
		const dedupeKey = createAlbumDeduplicationKey('message', messages);
		if (!dedupe.shouldEmit(dedupeKey)) {
			return;
		}

		const messageContext = await resolveMessageContext(primaryMessage);
		const payload = buildAlbumTriggerPayload('message', messages, messageContext);
		for (const albumMessage of messages) {
			const albumMessagePayload = buildTriggerPayload('message', albumMessage, messageContext);
			messageSnapshots.remember(albumMessagePayload);
		}

		if (!emitEvents) {
			return;
		}
		if (!shouldProcessMessage(primaryMessage, messageContext, config)) {
			return;
		}
		const item = await createAlbumExecutionItem(context, messages, payload, config.disableBinary);
		await emit([item]);
	} catch (error) {
		logger.error('[TelegramGramProTrigger] Failed to process Telegram album update', {
			error: getErrorMessage(error),
			nodeName: context.getNode().name,
		});
	}
}

function createMessageSnapshotStore() {
	const byId = new Map<string, { payload: TelegramTriggerPayload; timestamp: number }>();
	const byChatAndId = new Map<string, { payload: TelegramTriggerPayload; timestamp: number }>();

	const cleanup = (): void => {
		const now = Date.now();

		for (const [key, entry] of byId.entries()) {
			if (now - entry.timestamp > MESSAGE_SNAPSHOT_TTL_MS) {
				byId.delete(key);
			}
		}

		for (const [key, entry] of byChatAndId.entries()) {
			if (now - entry.timestamp > MESSAGE_SNAPSHOT_TTL_MS) {
				byChatAndId.delete(key);
			}
		}

		trimMap(byId, MESSAGE_SNAPSHOT_MAX_SIZE);
		trimMap(byChatAndId, MESSAGE_SNAPSHOT_MAX_SIZE);
	};

	return {
		remember(payload: TelegramTriggerPayload): void {
			const messageId = normalizeMessageId(payload.messageId);
			if (!messageId) {
				return;
			}

			const snapshot = {
				payload: { ...payload },
				timestamp: Date.now(),
			};

			byId.set(messageId, snapshot);
			const chatId = typeof payload.chatId === 'string' ? payload.chatId : null;
			if (chatId) {
				for (const alias of expandNumericIdAliases(chatId)) {
					byChatAndId.set(`${alias}:${messageId}`, snapshot);
				}
			}

			cleanup();
		},

		get(deletedEvent: DeletedMessageEvent): TelegramTriggerPayload | undefined {
			cleanup();

			const eventChatId = getDeletedEventChatId(deletedEvent);
			const deletedIds = Array.isArray(deletedEvent.deletedIds) ? deletedEvent.deletedIds : [];

			for (const deletedId of deletedIds) {
				const messageId = String(deletedId);
				if (eventChatId) {
					for (const alias of expandNumericIdAliases(eventChatId)) {
						const scoped = byChatAndId.get(`${alias}:${messageId}`);
						if (scoped) {
							return scoped.payload;
						}
					}
				}

				const generic = byId.get(messageId);
				if (generic) {
					return generic.payload;
				}
			}

			return undefined;
		},

		async waitFor(
			deletedEvent: DeletedMessageEvent,
			timeoutMs = 800,
			intervalMs = 80,
		): Promise<TelegramTriggerPayload | undefined> {
			const startedAt = Date.now();
			while (Date.now() - startedAt <= timeoutMs) {
				const snapshot = this.get(deletedEvent);
				if (snapshot) {
					return snapshot;
				}
				await sleep(intervalMs);
			}
			return undefined;
		},
	};
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function normalizeMessageId(value: unknown): string | null {
	if (typeof value === 'string' && value.trim()) {
		return value.trim();
	}

	if (typeof value === 'number' && Number.isFinite(value)) {
		return String(value);
	}

	return null;
}

function trimMap<T>(map: Map<string, T>, maxSize: number): void {
	if (map.size <= maxSize) {
		return;
	}

	const overflow = map.size - maxSize;
	const keys = map.keys();
	for (let i = 0; i < overflow; i += 1) {
		const next = keys.next();
		if (next.done) {
			return;
		}
		map.delete(next.value);
	}
}

async function buildDeletedMessagePayload(
	deletedEvent: DeletedMessageEvent,
	messageSnapshots: MessageSnapshotStore,
	client: Awaited<ReturnType<typeof getClient>>,
): Promise<IDataObject> {
	const deletedIds = Array.isArray(deletedEvent.deletedIds) ? deletedEvent.deletedIds : [];
	const firstDeletedId = deletedIds[0];
	const snapshot =
		messageSnapshots.get(deletedEvent) ?? (await messageSnapshots.waitFor(deletedEvent));
	const chatInfo = await resolveDeletedEventChatInfo(deletedEvent, snapshot, client);
	const date = new Date().toISOString();
	const senderFallbackName =
		chatInfo.chatType === 'user' || chatInfo.chatType === 'bot' || chatInfo.chatType === 'channel'
			? chatInfo.chatName
			: null;
	const senderFallbackId =
		chatInfo.chatType === 'user' || chatInfo.chatType === 'bot' ? chatInfo.chatId : null;

	return {
		updateType: 'deleted_message',
		date,
		editDate: null,
		deletedIds,
		deletedCount: deletedIds.length,
		deletedId: firstDeletedId,
		messageId: firstDeletedId ? String(firstDeletedId) : undefined,
		groupedId: snapshot?.groupedId,
		mediaCount: snapshot?.mediaCount,
		message: snapshot?.message,
		rawMessage: snapshot?.rawMessage,
		chatName: chatInfo.chatName ?? senderFallbackName,
		chatId: chatInfo.chatId,
		chatType: chatInfo.chatType,
		senderName: snapshot?.senderName ?? senderFallbackName,
		senderId: snapshot?.senderId ?? senderFallbackId,
		senderIsBot: snapshot?.senderIsBot ?? null,
		isPrivate: chatInfo.isPrivate ?? false,
		isGroup: chatInfo.isGroup ?? false,
		isChannel: chatInfo.isChannel,
		isOutgoing: snapshot?.isOutgoing,
		messageType: snapshot?.messageType ?? 'other',
		hasMedia: snapshot?.hasMedia ?? false,
		fileName: snapshot?.fileName,
		fileExtension: snapshot?.fileExtension,
		mimeType: snapshot?.mimeType,
		size: snapshot?.size,
		bytes: snapshot?.bytes,
		mediaFiles: snapshot?.mediaFiles,
		hasWebPreview: snapshot?.hasWebPreview,
		mediaDownloadError: snapshot?.mediaDownloadError,
	};
}

async function resolveDeletedEventChatInfo(
	deletedEvent: DeletedMessageEvent,
	snapshot?: TelegramTriggerPayload,
	client?: Awaited<ReturnType<typeof getClient>>,
): Promise<{
	chatName: string | null;
	chatId: string | null;
	chatType: 'user' | 'bot' | 'group' | 'supergroup' | 'channel' | 'unknown';
	isPrivate: boolean | undefined;
	isGroup: boolean | undefined;
	isChannel: boolean;
}> {
	const fallbackChatId = getDeletedEventChatId(deletedEvent) ?? snapshot?.chatId ?? null;
	const fallbackIsPrivate = snapshot?.isPrivate ?? deletedEvent.isPrivate;
	const fallbackIsGroup = snapshot?.isGroup ?? deletedEvent.isGroup;
	const fallbackIsChannel = Boolean(snapshot?.isChannel) || deletedEvent.isChannel;
	const fallbackChatType: 'user' | 'bot' | 'group' | 'supergroup' | 'channel' | 'unknown' =
		snapshot?.chatType ??
		(fallbackIsChannel
			? 'channel'
			: fallbackIsGroup
				? 'group'
				: fallbackIsPrivate
					? 'user'
					: 'unknown');

	try {
		const chat = await deletedEvent.getChat();
		if (!chat) {
			return {
				chatName: snapshot?.chatName ?? null,
				chatId: fallbackChatId,
				chatType: fallbackChatType,
				isPrivate: fallbackIsPrivate,
				isGroup: fallbackIsGroup,
				isChannel: fallbackIsChannel,
			};
		}

		if (chat instanceof Api.User) {
			const name = [chat.firstName, chat.lastName].filter(Boolean).join(' ').trim();
			return {
				chatName: name || chat.username || null,
				chatId: fallbackChatId ?? String(chat.id),
				chatType: chat.bot ? 'bot' : 'user',
				isPrivate: true,
				isGroup: false,
				isChannel: false,
			};
		}

		if (chat instanceof Api.Chat || chat instanceof Api.ChatEmpty) {
			const title = chat instanceof Api.Chat ? chat.title : null;
			return {
				chatName: title ?? null,
				chatId: fallbackChatId,
				chatType: 'group',
				isPrivate: false,
				isGroup: true,
				isChannel: false,
			};
		}

		if (chat instanceof Api.Channel || chat instanceof Api.ChannelForbidden) {
			const isBroadcast = chat instanceof Api.Channel ? Boolean(chat.broadcast) : true;
			const title = chat.title ?? null;
			return {
				chatName: title,
				chatId: fallbackChatId,
				chatType: isBroadcast ? 'channel' : 'supergroup',
				isPrivate: false,
				isGroup: !isBroadcast,
				isChannel: true,
			};
		}
	} catch {
		// Fall back to metadata exposed by DeletedMessageEvent when chat cannot be resolved.
	}

	// Try one more direct entity resolution path when event entities are not present.
	if (client && fallbackChatId) {
		try {
			const entity = (await client.getEntity(fallbackChatId as never)) as unknown;
			if (entity instanceof Api.User) {
				const name = [entity.firstName, entity.lastName].filter(Boolean).join(' ').trim();
				return {
					chatName: name || entity.username || null,
					chatId: fallbackChatId ?? String(entity.id),
					chatType: entity.bot ? 'bot' : 'user',
					isPrivate: true,
					isGroup: false,
					isChannel: false,
				};
			}
			if (entity instanceof Api.Chat || entity instanceof Api.ChatForbidden) {
				return {
					chatName: entity.title ?? null,
					chatId: fallbackChatId,
					chatType: 'group',
					isPrivate: false,
					isGroup: true,
					isChannel: false,
				};
			}
			if (entity instanceof Api.Channel || entity instanceof Api.ChannelForbidden) {
				const isBroadcast = entity instanceof Api.Channel ? Boolean(entity.broadcast) : true;
				return {
					chatName: entity.title ?? null,
					chatId: fallbackChatId,
					chatType: isBroadcast ? 'channel' : 'supergroup',
					isPrivate: false,
					isGroup: !isBroadcast,
					isChannel: true,
				};
			}
		} catch {
			// Ignore fallback resolution failures.
		}
	}

	return {
		chatName: snapshot?.chatName ?? null,
		chatId: fallbackChatId,
		chatType: fallbackChatType,
		isPrivate: fallbackIsPrivate,
		isGroup: fallbackIsGroup,
		isChannel: fallbackIsChannel,
	};
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

function getDeletedEventChatId(deletedEvent: DeletedMessageEvent): string | null {
	const originalUpdate = deletedEvent.originalUpdate;
	if (originalUpdate instanceof Api.UpdateDeleteChannelMessages) {
		return normalizeDeletedChannelId(originalUpdate.channelId);
	}
	const chatId = deletedEvent.chatId;
	if (chatId === undefined || chatId === null) {
		return null;
	}
	return chatId.toString();
}

function normalizeDeletedChannelId(value: unknown): string | null {
	if (typeof value === 'number' || typeof value === 'bigint') {
		const id = String(value);
		if (id.startsWith('-100')) return id;
		if (id.startsWith('-')) return id;
		return `-100${id}`;
	}
	if (typeof value === 'string') {
		const id = value.trim();
		if (!id) return null;
		if (id.startsWith('-100')) return id;
		if (id.startsWith('-')) return id;
		if (/^\d+$/.test(id)) return `-100${id}`;
		return id;
	}
	if (typeof value === 'object' && value !== null && 'toString' in value) {
		return normalizeDeletedChannelId(value.toString());
	}
	return null;
}

function expandNumericIdAliases(value: string): string[] {
	const trimmed = value.trim();
	if (!trimmed) {
		return [];
	}
	const aliases = new Set<string>([trimmed]);
	if (!/^-?\d+$/.test(trimmed)) {
		return Array.from(aliases);
	}
	if (trimmed.startsWith('-100') && trimmed.length > 4) {
		const bare = trimmed.slice(4);
		aliases.add(bare);
		aliases.add(`-${bare}`);
		return Array.from(aliases);
	}
	if (trimmed.startsWith('-')) {
		const bare = trimmed.slice(1);
		aliases.add(bare);
		aliases.add(`-100${bare}`);
		return Array.from(aliases);
	}
	aliases.add(`-${trimmed}`);
	aliases.add(`-100${trimmed}`);
	return Array.from(aliases);
}
