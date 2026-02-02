import { IExecuteFunctions } from 'n8n-workflow';
import { getClient } from '../../core/clientManager';
import { safeExecute } from '../../core/floodWaitHandler';
import { Api } from 'telegram';
import bigInt from 'big-integer';

export async function chatRouter(this: IExecuteFunctions, operation: string) {

	const creds: any = await this.getCredentials('telegramApi');

	const client = await getClient(
		creds.apiId,
		creds.apiHash,
		creds.session,
	);

	switch (operation) {
		case 'getDialogs': return getDialogs.call(this, client);
		case 'getChat': return getChat.call(this, client);
        case 'joinChat': return joinChat.call(this, client);
        case 'leaveChat': return leaveChat.call(this, client);
		case 'joinGroup': return joinGroup.call(this, client);
		case 'leaveGroup': return leaveGroup.call(this, client);
		case 'createChat': return createChat.call(this, client);
		case 'createChannel': return createChannel.call(this, client);

		default:
			throw new Error(`Chat operation not supported: ${operation}`);
	}
}

// ----------------------

async function getChat(this: IExecuteFunctions, client: any) {

	const chatId = this.getNodeParameter('chatId', 0);

	const chat = await client.getEntity(chatId);

	return [[{
		json: {
			id: chat.id,
			title: chat.title,
			username: chat.username,
		},
	}]];
}

// ----------------------

async function getDialogs(this: IExecuteFunctions, client: any) {

	const limit = this.getNodeParameter('limit', 0);

	const dialogs = await client.getDialogs({ limit });

	const items = dialogs.map((d: any) => ({
		json: {
			id: d.id,
			title: d.title,
			unread: d.unreadCount,
		},
	}));

	return [items];
}


async function joinChat(this: IExecuteFunctions, client: any) {
    const chatId = this.getNodeParameter('chatId', 0) as string;

    const result = await safeExecute(async () => {
        if (chatId.includes('t.me/+') || chatId.includes('joinchat/')) {
            // Extract the hash from the link
            const hash = chatId.split('/').pop()?.replace('+', '');
            return await client.invoke(new Api.messages.ImportChatInvite({ hash }));
        }
        
        // Default to public join
        return await client.invoke(new Api.channels.JoinChannel({ channel: chatId }));
    });

    return [[{ json: { success: true, result } }]];
}

async function joinGroup(this: IExecuteFunctions, client: any) {
    const chatId = this.getNodeParameter('chatId', 0) as string;

    const result = await safeExecute(async () => {
        if (chatId.includes('t.me/+') || chatId.includes('joinchat/')) {
            // Extract the hash from the link
            const hash = chatId.split('/').pop()?.replace('+', '');
            return await client.invoke(new Api.messages.ImportChatInvite({ hash }));
        }
        
        // For groups, we need to use different API calls
        try {
            // Try to join as a basic group first
            return await client.invoke(new Api.messages.AddChatUser({
                chatId: bigInt(chatId),
                userId: 'me',
                fwdLimit: 0
            }));
        } catch (error) {
            // If that fails, try as a supergroup
            return await client.invoke(new Api.channels.JoinChannel({ channel: chatId }));
        }
    });

    return [[{ json: { success: true, result } }]];
}

async function leaveGroup(this: IExecuteFunctions, client: any) {
    const chatId = this.getNodeParameter('chatId', 0) as string;

    const result = await safeExecute(async () => {
        try {
            // Try to leave as a basic group first
            return await client.invoke(new Api.messages.DeleteChatUser({
                chatId: bigInt(chatId),
                userId: 'me'
            }));
        } catch (error) {
            // If that fails, try as a supergroup/channel
            return await client.invoke(new Api.channels.LeaveChannel({
                channel: chatId
            }));
        }
    });

    return [[{ json: { success: true, result } }]];
}

async function leaveChat(this: IExecuteFunctions, client: any) {
    const chatId = this.getNodeParameter('chatId', 0) as string;

    const result = await safeExecute(() => 
        client.invoke(new Api.channels.LeaveChannel({
            channel: chatId,
        }))
    );

    return [[{ json: { success: true, result } }]];
}
async function createChat(this: IExecuteFunctions, client: any) {
    const title = this.getNodeParameter('chatTitle', 0) as string;
    const about = this.getNodeParameter('chatAbout', 0) as string;

    // This creates a Supergroup (Megagroup)
    const result = await safeExecute(() => 
        client.invoke(new Api.channels.CreateChannel({
            title: title,
            about: about,
            megagroup: true, // This makes it a Group/Supergroup
            broadcast: false,
        }))
    );

    const chat = (result as any).chats[0];
    return [[{ json: { success: true, chatId: chat.id.toString(), title: chat.title } }]];
}

async function createChannel(this: IExecuteFunctions, client: any) {
    const title = this.getNodeParameter('chatTitle', 0) as string;
    const about = this.getNodeParameter('chatAbout', 0) as string;

    // This creates a Broadcast Channel
    const result = await safeExecute(() => 
        client.invoke(new Api.channels.CreateChannel({
            title: title,
            about: about,
            megagroup: false,
            broadcast: true, // This makes it a Channel
        }))
    );

    const chat = (result as any).chats[0];
    return [[{ json: { success: true, chatId: chat.id.toString(), title: chat.title } }]];
}