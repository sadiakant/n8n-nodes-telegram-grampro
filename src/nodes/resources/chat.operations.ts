import { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import { getClient } from '../../core/clientManager';
import { safeExecute } from '../../core/floodWaitHandler';
import { Api } from 'telegram';
import bigInt from 'big-integer';
import { cache, CacheKeys } from '../../core/cache';

export async function chatRouter(this: IExecuteFunctions, operation: string, i: number): Promise<INodeExecutionData[]> {

    const creds: any = await this.getCredentials('telegramApi');

    const client = await getClient(
        creds.apiId,
        creds.apiHash,
        creds.session,
    );

    switch (operation) {
        case 'getDialogs': return getDialogs.call(this, client, i);
        case 'getChat': return getChat.call(this, client, i);
        case 'joinChat': return joinChat.call(this, client, i);
        case 'leaveChat': return leaveChat.call(this, client, i);
        case 'createChat': return createChat.call(this, client, i);
        case 'createChannel': return createChannel.call(this, client, i);

        default:
            throw new Error(`Chat operation not supported: ${operation}`);
    }
}

// ----------------------

async function getChat(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {

    const chatId = this.getNodeParameter('chatId', i) as string;

    const cacheKey = CacheKeys.getChat(chatId);
    const cachedChat = cache.get(cacheKey);
    if (cachedChat) {
        return [{
            json: cachedChat as IDataObject,
            pairedItem: { item: i },
        }];
    }

    const chat = await client.getEntity(chatId);

    const json: IDataObject = {
        id: chat.id,
        title: chat.title,
        username: chat.username,
    };

    cache.set(cacheKey, json);

    return [{
        json,
        pairedItem: { item: i },
    }];
}

// ----------------------
async function getDialogs(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {

    const rawLimit = this.getNodeParameter('limit', i, null) as number | null;
    const targetLimit = (typeof rawLimit === 'number' && !isNaN(rawLimit)) ? rawLimit : Infinity;

    // Avoid caching when unbounded or very large
    const useCache = targetLimit !== Infinity && targetLimit <= 500;
    const cacheKey = CacheKeys.getDialogs(targetLimit === Infinity ? -1 : targetLimit);
    if (useCache) {
        const cachedDialogs = cache.get(cacheKey);
        if (cachedDialogs) {
            return (cachedDialogs as IDataObject[]).map((d) => ({
                json: d,
                pairedItem: { item: i },
            }));
        }
    }

    const items: INodeExecutionData[] = [];
    let count = 0;

    for await (const dialog of client.iterDialogs({ limit: targetLimit === Infinity ? undefined : targetLimit })) {
        if (targetLimit !== Infinity && count >= targetLimit) break;

        const entity = dialog.entity || dialog;
        const id = entity.id?.toString?.() ?? dialog.id?.toString?.() ?? '';
        const title = entity.title || entity.firstName || entity.username || '';
        const username = entity.username || null;

        let accountType = 'user';
        if (entity.bot) accountType = 'bot';
        else if (entity.className === 'Channel' && entity.broadcast) accountType = 'channel';
        else if (entity.className === 'Channel' && entity.megagroup) accountType = 'group';
        else if (entity.className === 'Chat') accountType = 'group';

        const visibility = entity.username ? 'Public' : 'Private';
        const audience = entity.participantsCount ?? entity.participantCount ?? dialog.participantsCount ?? null;

        const createDate = entity.date ? formatDate(new Date(entity.date * 1000)) : null;
        // Telegram dialogs do not expose reliable join timestamps; avoid misleading values.
        const joinedDate = null;

        items.push({
            json: {
                id,
                title,
                username,
                account_type: accountType,
                type: visibility,
                audience,
                joinedDate,
                createDate,
                unread: dialog.unreadCount ?? 0,
            } as IDataObject,
            pairedItem: { item: i },
        });

        count++;
    }

    if (useCache) {
        cache.set(cacheKey, items.map(({ json }) => json as IDataObject));
    }

    return items;
}

function formatDate(date: Date): string {
    const istString = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    }).format(date);

    const parts = istString.split(',').map(s => s.trim());
    const datePartRaw = parts[0] || '';
    const timePartRaw = parts[1] || '';
    const datePieces = datePartRaw.split(' ');
    const day = datePieces[0] || '';
    const month = datePieces[1] || '';
    const year = datePieces[2] || '';
    const timePieces = timePartRaw.split(' ');
    const time = timePieces[0] || '';
    const ampm = (timePieces[1] || '').toUpperCase();
    const datePart = `${day}-${month}-${year}`;
    return `${datePart} (${time} ${ampm}) - IST`;
}

function normalizeIdForGroup(rawId: string): string {
    // Remove leading -100 or - signs used in supergroup IDs when calling AddChatUser
    let idStr = rawId.trim();
    if (idStr.startsWith('-100')) idStr = idStr.substring(4);
    else if (idStr.startsWith('-')) idStr = idStr.substring(1);
    return idStr;
}


async function joinChat(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const chatId = this.getNodeParameter('chatId', i) as string;

    const result: any = await safeExecute(async () => {
        if (chatId.includes('t.me/+') || chatId.includes('joinchat/')) {
            // Extract the hash from the link
            const hash = chatId.split('/').pop()?.replace('+', '');
            return await client.invoke(new Api.messages.ImportChatInvite({ hash }));
        }

        // Try basic group join via AddChatUser (for legacy/basic groups)
        try {
            const numericId = normalizeIdForGroup(chatId);
            return await client.invoke(new Api.messages.AddChatUser({
                chatId: bigInt(numericId),
                userId: 'me',
                fwdLimit: 0
            }));
        } catch (error) {
            // Fallback to channel/supergroup join
            return await client.invoke(new Api.channels.JoinChannel({ channel: chatId }));
        }
    });

    return [{
        json: { success: true, result: result as any } as IDataObject,
        pairedItem: { item: i },
    }];
}

async function leaveGroup(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const chatId = this.getNodeParameter('chatId', i) as string;

    const result: any = await safeExecute(async () => {
        try {
            // Try to leave as a basic group first
            const numericId = normalizeIdForGroup(chatId);
            return await client.invoke(new Api.messages.DeleteChatUser({
                chatId: bigInt(numericId),
                userId: 'me'
            }));
        } catch (error) {
            // If that fails, try as a supergroup/channel
            return await client.invoke(new Api.channels.LeaveChannel({
                channel: chatId
            }));
        }
    });

    return [{
        json: { success: true, result: result as any } as IDataObject,
        pairedItem: { item: i },
    }];
}

async function leaveChat(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const chatId = this.getNodeParameter('chatId', i) as string;

    const result: any = await safeExecute(async () => {
        try {
            return await client.invoke(new Api.channels.LeaveChannel({ channel: chatId }));
        } catch (error) {
            // Try basic group leave
            const numericId = normalizeIdForGroup(chatId);
            return await client.invoke(new Api.messages.DeleteChatUser({
                chatId: bigInt(numericId),
                userId: 'me'
            }));
        }
    });

    return [{
        json: { success: true, result: result as any } as IDataObject,
        pairedItem: { item: i },
    }];
}
async function createChat(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const title = this.getNodeParameter('chatTitle', i) as string;
    const about = this.getNodeParameter('chatAbout', i) as string;

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

    // Try to generate invite link
    let inviteLink: string | null = null;
    try {
        const peer = await client.getEntity(chat.id);
        const invite = await client.invoke(new Api.messages.ExportChatInvite({ peer }));
        inviteLink = (invite as any).link || null;
    } catch (_) { inviteLink = null; }

    const createdAt = chat.date ? new Date(chat.date * 1000) : null;
    const formattedDate = createdAt ? formatDateWithTime(createdAt) : null;
    const isPublic = !!chat.username;

    return [{
        json: {
            success: true,
            message: 'Group created successfully',
            chatId: chat.id.toString(),
            title: chat.title,
            bio: about || null,
            groupType: isPublic ? 'Public' : 'Private',
            createTime: formattedDate,
            inviteLink: inviteLink,
        } as IDataObject,
        pairedItem: { item: i },
    }];
}

async function createChannel(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const title = this.getNodeParameter('chatTitle', i) as string;
    const about = this.getNodeParameter('chatAbout', i) as string;

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

    // Try to generate invite link
    let inviteLink: string | null = null;
    try {
        const peer = await client.getEntity(chat.id);
        const invite = await client.invoke(new Api.messages.ExportChatInvite({ peer }));
        inviteLink = (invite as any).link || null;
    } catch (_) { inviteLink = null; }

    const createdAt = chat.date ? new Date(chat.date * 1000) : null;
    const formattedDate = createdAt ? formatDateWithTime(createdAt) : null;
    const isPublic = !!chat.username;

    return [{
        json: {
            success: true,
            message: 'Channel created successfully',
            chatId: chat.id.toString(),
            title: chat.title,
            bio: about || null,
            channelType: isPublic ? 'Public' : 'Private',
            createTime: formattedDate,
            inviteLink: inviteLink,
        } as IDataObject,
        pairedItem: { item: i },
    }];
}

// Helpers
function pad(num: number): string {
    return num < 10 ? `0${num}` : `${num}`;
}

function formatDateWithTime(date: Date): string {
    const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = pad(ist.getDate());
    const month = months[ist.getMonth()];
    const year = ist.getFullYear();
    let hours = ist.getHours();
    const minutes = pad(ist.getMinutes());
    const seconds = pad(ist.getSeconds());
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hourStr = pad(hours);
    const datePart = `${day}-${month}-${year}`;
    const timePart = `${hourStr}:${minutes}:${seconds} ${ampm}`;
    return `${datePart} (${timePart}) - IST`;
}
