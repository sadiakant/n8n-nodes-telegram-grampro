import type {
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ITriggerFunctions,
	ITriggerResponse,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { Api } from 'telegram';
import { EditedMessage } from 'telegram/events/EditedMessage';
import { NewMessage } from 'telegram/events/NewMessage';
import type { EditedMessageEvent } from 'telegram/events/EditedMessage';
import type { NewMessageEvent } from 'telegram/events/NewMessage';

import { testTelegramApi } from '../../credentials/TelegramGramProApi.credentials';
import { disconnectClient, getClient } from '../TelegramGramPro/core/clientManager';
import { logger } from '../TelegramGramPro/core/logger';
import type { TelegramCredentials } from '../TelegramGramPro/core/types';
import {
	buildTriggerPayload,
	createDedupeTracker,
	createExecutionItem,
	createMessageDeduplicationKey,
	parseTriggerConfig,
	resolveMessageContext,
	shouldProcessMessage,
	type SupportedUpdate,
} from './trigger.shared';

type RegisteredHandler = {
	event: NewMessage | EditedMessage;
	handler: (event: NewMessageEvent | EditedMessageEvent) => void;
};

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
						description: 'Trigger on new messages from private chats, groups, channels, or bots',
					},
					{
						name: 'Edited Message',
						value: 'edited_message',
						description: 'Trigger when an existing message visible to the account is edited',
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
				description: 'Whether to capture all messages from users, groups, channels, and bots',
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
				description: 'Whether to capture only channel messages or posts',
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
				description: 'Whether to capture only group and supergroup messages',
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

		const config = parseTriggerConfig(this);
		const client = await getClient(credentials.apiId, credentials.apiHash, credentials.session, {
			receiveUpdates: true,
			cacheClient: true,
			verifyAuthorization: true,
			autoReconnect: true,
		});

		if (!client.connected) {
			await client.connect();
		}

		const dedupe = createDedupeTracker();
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
			);

			client.addEventHandler(registration.handler, registration.event);
			handlers.push(registration);
		}

		logger.info('[TelegramGramProTrigger] Trigger activated', {
			nodeName: this.getNode().name,
			updates: config.updates.join(','),
			listeningMode: config.listeningMode.join(','),
			allMessages: config.allMessages,
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
						await disconnectClient(apiId, credentials.session);
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

			const dedupeKey = createMessageDeduplicationKey(currentUpdateType, message);
			if (!dedupe.shouldEmit(dedupeKey)) {
				return;
			}

			const messageContext = await resolveMessageContext(message);
			if (!shouldProcessMessage(message, messageContext, config)) {
				return;
			}

			const payload = buildTriggerPayload(currentUpdateType, message, messageContext);
			const item = await createExecutionItem(context, message, payload);
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
		const handler = (eventData: EditedMessageEvent): void => {
			void processEvent(eventData, 'edited_message');
		};

		return {
			event,
			handler,
		};
	}

	const event = new NewMessage({});
	const handler = (eventData: NewMessageEvent): void => {
		void processEvent(eventData, 'message');
	};

	return {
		event,
		handler,
	};
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
