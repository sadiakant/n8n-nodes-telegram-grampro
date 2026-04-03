import {
	IDataObject,
	ITriggerFunctions,
	INodeType,
	INodeTypeDescription,
	ITriggerResponse,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';
import { getClient } from '../TelegramGramPro/core/clientManager';
import { testTelegramApi } from '../../credentials/TelegramGramProApi.credentials';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { logger } from '../TelegramGramPro/core/logger';
import type {
	TelegramCredentials,
	TelegramTriggerHandlerRegistration,
	TelegramTriggerPayload,
} from '../TelegramGramPro/core/types';

export class TelegramGramProTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Telegram GramPro Trigger',
		icon: 'file:telegram-grampro.svg',
		name: 'telegramGramProTrigger',
		group: ['trigger'],
		version: 1,
		description: 'Triggers on Telegram updates',
		defaults: {
			name: 'Telegram GramPro Trigger',
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
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: [{ name: 'New Message', value: 'newMessage' }],
				default: ['newMessage'],
				required: true,
				description: 'The events to listen for',
			},
			{
				displayName: 'Chats',
				name: 'chats',
				type: 'string',
				default: '',
				description:
					'Specific Chat IDs, Usernames, or Invite Links to listen to. Leave empty to listen to all chats.',
			},
			{
				displayName: 'Incoming Messages',
				name: 'incoming',
				type: 'boolean',
				default: true,
				description: 'Whether to trigger on incoming messages',
			},
			{
				displayName: 'Outgoing Messages',
				name: 'outgoing',
				type: 'boolean',
				default: false,
				description: 'Whether to trigger on outgoing messages sent by you',
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
		const creds = (await this.getCredentials('telegramGramProApi')) as TelegramCredentials;

		if (!creds) {
			throw new NodeOperationError(this.getNode(), 'No credentials found');
		}

		const events = this.getNodeParameter('events', []) as string[];
		const chats = this.getNodeParameter('chats', '') as string;
		const incoming = this.getNodeParameter('incoming', true) as boolean;
		const outgoing = this.getNodeParameter('outgoing', false) as boolean;

		const client = await getClient(creds.apiId, creds.apiHash, creds.session);

		if (!client) {
			throw new NodeOperationError(this.getNode(), 'Failed to initialize Telegram client.');
		}

		// Ensure connected
		if (!client.connected) {
			await client.connect();
		}

		const chatIds = chats
			.split(',')
			.map((c) => c.trim())
			.filter((c) => c);

		// BigInt replacer for JSON serialization
		const replacer = (_key: string, value: unknown): unknown => {
			if (typeof value === 'bigint') {
				return value.toString();
			}
			return value;
		};

		const eventHandler = async (event: NewMessageEvent) => {
			try {
				const msg = event.message;

				if (msg) {
					const raw = JSON.parse(JSON.stringify(msg, replacer)) as IDataObject;
					const data: TelegramTriggerPayload = {
						message: msg.message,
						date: msg.date,
						chatId: msg.chatId?.toString(),
						senderId: msg.senderId?.toString(),
						isPrivate: msg.isPrivate,
						isGroup: msg.isGroup,
						isChannel: msg.isChannel,
						raw,
					};

					this.emit([this.helpers.returnJsonArray(data)]);
				}
			} catch (error) {
				logger.error('Error processing Telegram event', {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		};

		// Track event handlers for proper cleanup
		const eventHandlers: TelegramTriggerHandlerRegistration[] = [];

		if (events.includes('newMessage')) {
			const eventFilter = new NewMessage({
				chats: chatIds.length > 0 ? chatIds : undefined,
				incoming: incoming,
				outgoing: outgoing,
			});
			client.addEventHandler(eventHandler, eventFilter);
			eventHandlers.push({ handler: eventHandler, event: eventFilter });
		}

		return {
			closeFunction: async () => {
				logger.debug('[TelegramTrigger] Cleaning up event handlers...');
				// Remove all event handlers to prevent memory leaks
				for (const { handler, event } of eventHandlers) {
					try {
						client.removeEventHandler(handler, event);
					} catch (error) {
						logger.error('Error removing event handler', {
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}
				eventHandlers.length = 0;
				// Note: We don't disconnect the client as it might be shared with other nodes
				logger.debug('[TelegramTrigger] Event handlers cleaned up successfully');
			},
		};
	}
}
