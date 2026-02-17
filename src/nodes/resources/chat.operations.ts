import { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import { getClient } from '../../core/clientManager';
import { safeExecute } from '../../core/floodWaitHandler';
import { Api } from 'telegram';

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
    let targetLimit = (typeof rawLimit === 'number' && !isNaN(rawLimit) && rawLimit > 0) ? rawLimit : Infinity;
    const groupByFolders = this.getNodeParameter('groupByFolders', i, false) as boolean;


    // Avoid caching when unbounded or very large
    const useCache = targetLimit !== Infinity && targetLimit <= 500 && !groupByFolders;
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

    // Fetch folders/filters if grouping is requested
    let filters: any[] = [];
    if (groupByFolders) {
        try {
            const res: any = await client.invoke(new Api.messages.GetDialogFilters());
            filters = Array.isArray(res) ? res : (res?.filters || []);
        } catch {
            filters = [];
        }
    }

    const items: INodeExecutionData[] = [];
    const allChats: IDataObject[] = [];
    let count = 0;

    const dialogs: any[] = await client.getDialogs({
        limit: targetLimit === Infinity ? undefined : targetLimit,
    });

    for (const dialog of dialogs) {
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
        const joinedDate = null;

        const chatJson: IDataObject = {
            id,
            title,
            username,
            account_type: accountType,
            type: visibility,
            audience,
            joinedDate,
            createDate,
            unread: dialog.unreadCount ?? 0,
        };

        if (groupByFolders) {
            allChats.push(chatJson);
        } else {
            items.push({
                json: chatJson,
                pairedItem: { item: i },
            });
        }

        count++;
    }

    if (groupByFolders) {
        const groupedResults: INodeExecutionData[] = [];
        const assignedChatIds = new Set<string>();

        // Helper to match chat ID with a peer
        const matchPeer = (peer: any, chatId: string) => {
            if (!peer) return false;
            const peerId = peer.userId || peer.chatId || peer.channelId;
            return peerId?.toString() === chatId;
        };

        for (const filter of filters) {
            if (filter.className === 'DialogFilterDefault') continue;

            let folderNameRaw = filter.title || `Folder ${filter.id}`;
            if (typeof folderNameRaw === 'object' && (folderNameRaw as any).text) {
                folderNameRaw = (folderNameRaw as any).text;
            }
            const folderName = String(folderNameRaw);

            // Normalize folder name to a safe key for n8n expressions (alphanumeric only)
            const safeKey = folderName.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || `folder_${filter.id}`;

            const folderChats: IDataObject[] = [];

            // A folder includes peers explicitly or by type flags
            for (const chat of allChats) {
                let included = false;
                const chatIdStr = chat.id as string;

                // 1. Check explicit inclusions
                if (filter.includePeers) {
                    for (const peer of filter.includePeers) {
                        if (matchPeer(peer, chatIdStr)) {
                            included = true;
                            break;
                        }
                    }
                }

                // 2. Check type flags if not explicitly included
                if (!included) {
                    const accType = chat.account_type as string;
                    if (filter.contacts && accType === 'user') included = true;
                    if (filter.nonContacts && accType === 'user') included = true;
                    if (filter.groups && accType === 'group') included = true;
                    if (filter.broadcasts && accType === 'channel') included = true;
                    if (filter.bots && accType === 'bot') included = true;
                }

                // 3. Check explicit exclusions
                if (included && filter.excludePeers) {
                    for (const peer of filter.excludePeers) {
                        if (matchPeer(peer, chatIdStr)) {
                            included = false;
                            break;
                        }
                    }
                }

                if (included) {
                    folderChats.push(chat);
                    assignedChatIds.add(chatIdStr);
                }
            }

            if (folderChats.length > 0) {
                groupedResults.push({
                    json: {
                        [safeKey]: folderChats,
                        folder_name: folderName,
                    },
                    pairedItem: { item: i },
                });
            }
        }

        // Add "Other" folder for chats not in any folder
        const otherChats = allChats.filter(chat => !assignedChatIds.has(chat.id as string));
        if (otherChats.length > 0) {
            groupedResults.push({
                json: {
                    Other: otherChats,
                    folder_name: 'Other',
                },
                pairedItem: { item: i },
            });
        }

        // If no grouping was possible, return flat list
        if (groupedResults.length === 0) {
            return allChats.map(chat => ({ json: chat, pairedItem: { item: i } }));
        }

        return groupedResults;
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
                chatId: BigInt(numericId) as any,
                userId: 'me',
                fwdLimit: 0
            }));
        } catch {
            // Fallback to channel/supergroup join
            return await client.invoke(new Api.channels.JoinChannel({ channel: chatId }));
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
        } catch {
            // Try basic group leave
            const numericId = normalizeIdForGroup(chatId);
            return await client.invoke(new Api.messages.DeleteChatUser({
                chatId: BigInt(numericId) as any,
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
    } catch { inviteLink = null; }

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
    } catch { inviteLink = null; }

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
