import { ITriggerFunctions, INodeType, INodeTypeDescription, ITriggerResponse } from 'n8n-workflow';
import { getClient } from '../core/clientManager';
import { NewMessage } from 'telegram/events';

export class TelegramTrigger implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Telegram GramPro Trigger',
        icon: 'file:icons/telegram.svg',
        name: 'telegramMtprotoTrigger',
        group: ['trigger'],
        version: 1,
        description: 'Triggers on Telegram updates',
        defaults: {
            name: 'Telegram GramPro Trigger',
        },
        codex: {
            categories: ['Trigger']
        },
        inputs: [],
        outputs: ['main' as any], // Cast to any if n8n-workflow version is strict
        credentials: [
            {
                name: 'telegramApi',
                required: true,
            }
        ],
        properties: []
    };

    async trigger(this: ITriggerFunctions) {
        const creds: any = await this.getCredentials('telegramApi');

        const client = await getClient(
            creds.apiId,
            creds.apiHash,
            creds.session
        );

        // Ensure connection is active
        if (!client.connected) {
            await client.connect();
        }   

const handler = async (event: any) => {
    const msg = event.message;
    if (!msg) return;

    // Wrap in double brackets: [[ {json} ]]
    this.emit([
        [
            {
                json: {
                    id: msg.id,
                    text: msg.text,
                    chatId: msg.chatId?.toString(),
                    fromId: msg.fromId?.toString(),
                    date: msg.date
                }
            }
        ]
    ]);
};

        const newMessageEvent = new NewMessage({});
        client.addEventHandler(handler, newMessageEvent);

        // n8n expects the close function to stop the listener
        return {
            close: async () => {
                client.removeEventHandler(handler, newMessageEvent);
            }
        } as ITriggerResponse;
    } 
} 