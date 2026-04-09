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
import { getClient } from '../TelegramGramPro/core/clientManager';
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
						description:
							'Trigger on new messages from private chats, groups, channels, or bots',
					},
					{
						name: 'Edited Message',
						value: 'edited_message',
						description: 'Trigger when an existing message visible to the account is edited',
					},
				],
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				options: [
					{
						displayName: 'Download Images/Files',
						name: 'download',
						type: 'boolean',
						default: false,
						description:
							'Whether to attach media for photos, videos, and documents in binary.data',
					},
					{
						displayName: 'Message Direction',
						name: 'messageDirection',
						type: 'options',
						default: 'incoming',
						options: [
							{
								name: 'Incoming Only',
								value: 'incoming',
							},
							{
								name: 'Outgoing Only',
								value: 'outgoing',
							},
							{
								name: 'Both',
								value: 'both',
							},
						],
						description:
							'User accounts receive both incoming and outgoing updates, so choose which direction should trigger the workflow',
					},
					{
						displayName: 'Restrict to Chat IDs/Usernames',
						name: 'chatIds',
						type: 'string',
						default: '',
						description:
							'Comma-separated chat IDs, @usernames, or titles to match. Numeric aliases such as 123, -123, and -100123 are matched automatically.',
					},
					{
						displayName: 'Restrict to Chat Types',
						name: 'chatTypes',
						type: 'multiOptions',
						default: ['private', 'group', 'channel'],
						options: [
							{
								name: 'Private',
								value: 'private',
							},
							{
								name: 'Group',
								value: 'group',
							},
							{
								name: 'Channel',
								value: 'channel',
							},
						],
						description: 'Which chat sources are allowed to emit events',
					},
					{
						displayName: 'Restrict to User IDs/Usernames',
						name: 'userIds',
						type: 'string',
						default: '',
						description:
							'Comma-separated sender IDs, @usernames, or names to match. Numeric aliases such as 123, -123, and -100123 are matched automatically.',
					},
				],
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
			messageDirection: config.messageDirection,
			chatTypes: config.chatTypes.join(','),
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
						await client.disconnect();
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
			const item = await createExecutionItem(context, message, payload, config);
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
