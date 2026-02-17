import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { getClient } from '../../core/clientManager';
import { safeExecute } from '../../core/floodWaitHandler';
import { withRateLimit } from '../../core/rateLimiter';
import { Api } from 'telegram';
import { CustomFile } from 'telegram/client/uploads';

import { logger } from '../../core/logger';

export async function messageRouter(this: IExecuteFunctions, operation: string, i: number): Promise<INodeExecutionData[]> {

    const creds: any = await this.getCredentials('telegramApi');

    const client = await getClient(
        creds.apiId,
        creds.apiHash,
        creds.session,
    );

    switch (operation) {
        case 'sendText': return sendText.call(this, client, i);
        case 'forwardMessage': return forwardMessage.call(this, client, i);
        case 'getHistory': return getHistory.call(this, client, i);
        case 'editMessage': return editMessage.call(this, client, i);
        case 'deleteMessage': return deleteMessage.call(this, client, i);
        case 'deleteHistory': return deleteHistory.call(this, client, i);
        case 'pinMessage': return pinMessage.call(this, client, i);
        case 'unpinMessage': return unpinMessage.call(this, client, i);
        case 'sendPoll': return sendPoll.call(this, client, i);
        case 'copyMessage': return copyMessage.call(this, client, i);
        case 'editMessageMedia': return editMessageMedia.call(this, client, i);
        case 'copyRestrictedContent': return copyRestrictedContent.call(this, client, i);
        default:
            throw new Error(`Message operation not supported: ${operation}`);
    }
}

// --- FUNCTIONS ---

async function editMessage(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const editFromSelf = this.getNodeParameter('editFromSelf', i, false) as boolean;
    const chatId = editFromSelf ? 'me' : this.getNodeParameter('chatId', i);
    const messageId = Number(this.getNodeParameter('messageId', i));
    const textRaw = this.getNodeParameter('text', i);
    const text = typeof textRaw === 'string' ? textRaw : (textRaw ?? '').toString();
    const noWebpage = this.getNodeParameter('noWebpage', i) as boolean;

    const result = await safeExecute(() =>
        client.editMessage(chatId, {
            message: messageId,
            text,
            noWebpage
        })
    );

    // Fetch detailed message info after edit
    let detailedMessage: any = null;
    try {
        const messages = await client.getMessages(chatId, { ids: [(result as any).id] });
        if (messages && messages.length > 0) {
            detailedMessage = messages[0];
        }
    } catch (error) {
        logger.warn('Failed to fetch detailed message info after edit: ' + (error as Error).message);
    }

    let sourceName = 'Unknown';
    let formattedSourceId = typeof chatId === 'string' ? chatId : '';
    try {
        const entity = await client.getEntity(chatId);
        if (entity) {
            if ('title' in entity && entity.title) {
                sourceName = entity.title;
            } else if ('firstName' in entity || 'lastName' in entity) {
                sourceName = [entity.firstName, entity.lastName].filter(Boolean).join(' ');
            } else if ('username' in entity && entity.username) {
                sourceName = entity.username;
            }

            const rawId = entity.id ? entity.id.toString() : '';
            if (rawId) {
                if (entity.className === 'Channel' || entity._ === 'channel') formattedSourceId = `-100${rawId}`;
                else if (entity.className === 'Chat' || entity._ === 'chat') formattedSourceId = `-${rawId}`;
                else formattedSourceId = rawId;
            }
        }
    } catch { /* intentionally ignoring */ }

    const mediaInfo = extractMediaInfo(detailedMessage?.media);
    const messageDate = detailedMessage?.date;
    const replyToId = detailedMessage?.replyTo?.replyToMsgId || null;
    const isOutgoing = detailedMessage?.out !== undefined ? detailedMessage.out : true;
    const finalText = detailedMessage?.message ?? (result as any).message ?? text;

    return [{
        json: {
            success: true,
            message: 'Message Edited successfully',
            id: (result as any).id,
            sourceName,
            sourceId: formattedSourceId,
            text: finalText,
            date: messageDate,
            humanDate: messageDate ? formatDateWithTime(new Date(messageDate * 1000)) : null,
            fromId: detailedMessage?.fromId?.userId?.toString() || detailedMessage?.fromId?.toString() || null,
            chatId: formattedSourceId,
            isReply: !!replyToId,
            isOutgoing,
            direction: isOutgoing ? 'sent' : 'received',
            hasMedia: mediaInfo.hasMedia,
            mediaType: mediaInfo.hasMedia ? mediaInfo.mediaType : 'other',
            noWebpage: noWebpage
        },
        pairedItem: { item: i },
    }];
}

async function editMessageMedia(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const editMediaFromSelf = this.getNodeParameter('editMediaFromSelf', i, false) as boolean;
    const chatId = editMediaFromSelf ? 'me' : (this.getNodeParameter('chatId', i) as string);
    const messageId = Number(this.getNodeParameter('messageId', i));
    const media = this.getNodeParameter('media', i);
    const captionInput = this.getNodeParameter('caption', i, '') as string;
    const captionEntitiesInput = this.getNodeParameter('captionEntities', i, []) as any[];
    const parseMode = this.getNodeParameter('parseMode', i, 'default') as string;

    let finalCaption = captionInput;
    let finalEntities = captionEntitiesInput;
    let debugInfo = "Using new caption";

    if (!captionInput || captionInput.trim() === '') {
        try {
            const messages = await client.getMessages(chatId, { ids: [messageId] });
            if (messages && messages.length > 0 && messages[0]) {
                const msg = messages[0];
                // Only preserve original caption if it exists
                finalCaption = msg.message || captionInput;
                finalEntities = msg.entities || captionEntitiesInput;
                debugInfo = "Successfully preserved original text";
            } else {
                debugInfo = `Error: Message ${messageId} not found in chat ${chatId}. Check your 'Chat ID' field!`;
            }
        } catch (error) {
            debugInfo = `Fetch error: ${(error as Error).message}`;
        }
    }

    const result = await safeExecute(() =>
        client.editMessage(chatId, {
            message: messageId,
            file: media,
            text: finalCaption,
            formattingEntities: (finalEntities && finalEntities.length > 0) ? finalEntities : undefined,
            parseMode: (finalEntities && finalEntities.length > 0) ? undefined : (parseMode !== 'default' ? parseMode : undefined)
        })
    );

    // Get detailed message information after editing
    let detailedMessage = null;
    try {
        const messages = await client.getMessages(chatId, { ids: [(result as any).id] });
        if (messages && messages.length > 0) {
            detailedMessage = messages[0];
        }
    } catch (error) {
        logger.warn('Failed to fetch detailed message info after edit: ' + (error as Error).message);
    }

    return [{
        json: {
            success: true,
            id: (result as any).id,
            text: (result as any).message,
            debug_logic: debugInfo,
            target_chat: chatId,
            ...(detailedMessage && {
                sourceName: 'Unknown',
                sourceId: chatId,
                date: detailedMessage.date,
                humanDate: formatDateWithTime(new Date(detailedMessage.date * 1000)),
                fromId: detailedMessage.fromId?.userId?.toString() || detailedMessage.fromId?.toString() || null,
                chatId: detailedMessage.peerId?.userId?.toString() || detailedMessage.peerId?.chatId?.toString() || detailedMessage.peerId?.channelId?.toString() || detailedMessage.peerId?.toString() || null,
                isReply: !!detailedMessage.replyTo,
                isOutgoing: detailedMessage.out,
                direction: detailedMessage.out ? 'sent' : 'received',
                hasMedia: !!detailedMessage.media,
                mediaType: 'other'
            })
        },
        pairedItem: { item: i },
    }];
}

async function deleteMessage(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const chatId = this.getNodeParameter('chatId', i);
    const messageId = Number(this.getNodeParameter('messageId', i));
    const revoke = this.getNodeParameter('revoke', i) as boolean;

    // Fetch message details before deletion for rich response
    let detailedMessage: any = null;
    try {
        const messages = await client.getMessages(chatId, { ids: [messageId] });
        if (messages && messages.length > 0) {
            detailedMessage = messages[0];
        }
    } catch (error) {
        logger.warn('Failed to fetch message before delete: ' + (error as Error).message);
    }

    await safeExecute(() =>
        client.deleteMessages(chatId, [messageId], { revoke })
    );

    // Resolve entity info for source
    let sourceName = 'Unknown';
    let formattedSourceId = typeof chatId === 'string' ? chatId : '';
    try {
        const entity = await client.getEntity(chatId);
        if (entity) {
            if ('title' in entity && entity.title) {
                sourceName = entity.title;
            } else if ('firstName' in entity || 'lastName' in entity) {
                sourceName = [entity.firstName, entity.lastName].filter(Boolean).join(' ');
            } else if ('username' in entity && entity.username) {
                sourceName = entity.username;
            }

            const rawId = entity.id ? entity.id.toString() : '';
            if (rawId) {
                if (entity.className === 'Channel' || entity._ === 'channel') formattedSourceId = `-100${rawId}`;
                else if (entity.className === 'Chat' || entity._ === 'chat') formattedSourceId = `-${rawId}`;
                else formattedSourceId = rawId;
            }
        }
    } catch { /* intentionally ignoring */ }

    const mediaInfo = extractMediaInfo(detailedMessage?.media);
    const messageDate = detailedMessage?.date;
    const replyToId = detailedMessage?.replyTo?.replyToMsgId || null;
    const isOutgoing = detailedMessage?.out !== undefined ? detailedMessage.out : true;
    const finalText = detailedMessage?.message ?? '';
    const fromId =
        detailedMessage?.fromId?.userId?.toString() ||
        detailedMessage?.fromId?.chatId?.toString() ||
        detailedMessage?.fromId?.channelId?.toString() ||
        detailedMessage?.fromId?.toString() ||
        null;

    return [{
        json: {
            success: true,
            message: 'Message Deleted successfully',
            id: messageId,
            sourceName,
            sourceId: formattedSourceId,
            text: finalText,
            date: messageDate,
            humanDate: messageDate ? formatDateWithTime(new Date(messageDate * 1000)) : null,
            fromId: fromId,
            chatId: formattedSourceId,
            isReply: !!replyToId,
            isOutgoing,
            direction: isOutgoing ? 'sent' : 'received',
            hasMedia: mediaInfo.hasMedia,
            mediaType: mediaInfo.hasMedia ? mediaInfo.mediaType : 'other',
            deletedId: messageId,
            revoked: revoke,
            'Delete of Everyone': revoke
        },
        pairedItem: { item: i },
    }];
}

// --- UPDATED DELETE HISTORY FUNCTION ---
async function deleteHistory(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const chatId = this.getNodeParameter('chatId', i) as string;
    const maxId = this.getNodeParameter('maxId', i) as number || 0;
    const revoke = this.getNodeParameter('revoke', i) as boolean;

    try {
        if (!client.connected) {
            await client.connect();
        }

        const peer = await client.getInputEntity(chatId);

        // 1. GET TOTAL COUNT BEFORE DELETION
        let preDeleteCount = 0;
        try {
            // 'limit: 0' fetches metadata (including total count) without fetching message bodies
            const countResult = await client.getMessages(peer, { limit: 0 });
            preDeleteCount = (countResult as any).total || 0;
        } catch {
            // If fetching count fails, we gracefully degrade to 0
        }

        let offset = 0;
        let response;
        let loopCount = 0;

        // 2. PERFORM DELETION
        do {
            response = await client.invoke(
                new Api.messages.DeleteHistory({
                    peer: peer,
                    maxId: maxId,
                    revoke: revoke,
                    justClear: false,
                })
            );

            offset = (response as any).offset;
            loopCount++;

            if (loopCount > 100) break;
            if (offset > 0) await new Promise(resolve => setTimeout(resolve, 100));

        } while (offset > 0);

        return [{
            json: {
                success: true,
                deletedCount: preDeleteCount,
                maxId: maxId,
                revoked: revoke,
                iterations: loopCount
            },
            pairedItem: { item: i },
        }];

    } catch (error) {
        if (this.continueOnFail()) {
            return [{
                json: { success: false, error: (error as Error).message },
                pairedItem: { item: i },
            }];
        } else {
            throw error;
        }
    }
}

async function pinMessage(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const chatId = this.getNodeParameter('chatId', i);
    const messageId = Number(this.getNodeParameter('messageId', i));
    const notify = this.getNodeParameter('notify', i) as boolean;

    // Pin the message
    await safeExecute(() =>
        client.pinMessage(chatId, messageId, { notify })
    );

    // Fetch detailed message info after pinning
    let detailedMessage: any = null;
    try {
        const messages = await client.getMessages(chatId, { ids: [messageId] });
        if (messages && messages.length > 0) {
            detailedMessage = messages[0];
        }
    } catch (error) {
        logger.warn('Failed to fetch detailed message info after pin: ' + (error as Error).message);
    }

    // Resolve entity info for source
    let sourceName = 'Unknown';
    let formattedSourceId = typeof chatId === 'string' ? chatId : '';
    try {
        const entity = await client.getEntity(chatId);
        if (entity) {
            if ('title' in entity && entity.title) {
                sourceName = entity.title;
            } else if ('firstName' in entity || 'lastName' in entity) {
                sourceName = [entity.firstName, entity.lastName].filter(Boolean).join(' ');
            } else if ('username' in entity && entity.username) {
                sourceName = entity.username;
            }

            const rawId = entity.id ? entity.id.toString() : '';
            if (rawId) {
                if (entity.className === 'Channel' || entity._ === 'channel') formattedSourceId = `-100${rawId}`;
                else if (entity.className === 'Chat' || entity._ === 'chat') formattedSourceId = `-${rawId}`;
                else formattedSourceId = rawId;
            }
        }
    } catch { /* intentionally ignoring */ }

    const mediaInfo = extractMediaInfo(detailedMessage?.media);
    const messageDate = detailedMessage?.date;
    const replyToId = detailedMessage?.replyTo?.replyToMsgId || null;
    const isOutgoing = detailedMessage?.out !== undefined ? detailedMessage.out : true;
    const finalText = detailedMessage?.message ?? '';
    const fromId =
        detailedMessage?.fromId?.userId?.toString() ||
        detailedMessage?.fromId?.chatId?.toString() ||
        detailedMessage?.fromId?.channelId?.toString() ||
        detailedMessage?.fromId?.toString() ||
        null;

    return [{
        json: {
            success: true,
            message: 'Message Pinned successfully',
            id: messageId,
            sourceName,
            sourceId: formattedSourceId,
            text: finalText,
            date: messageDate,
            humanDate: messageDate ? formatDateWithTime(new Date(messageDate * 1000)) : null,
            fromId,
            chatId: formattedSourceId,
            isReply: !!replyToId,
            isOutgoing,
            direction: isOutgoing ? 'sent' : 'received',
            hasMedia: mediaInfo.hasMedia,
            mediaType: mediaInfo.hasMedia ? mediaInfo.mediaType : 'other',
            notified: notify,
            pinnedId: messageId
        },
        pairedItem: { item: i },
    }];
}

async function sendText(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const sendToSelf = this.getNodeParameter('sendToSelf', i, false) as boolean;
    const chatId = sendToSelf ? 'me' : (this.getNodeParameter('chatId', i) as string);
    const text = this.getNodeParameter('text', i) as string;
    const replyTo = this.getNodeParameter('replyTo', i) as number;
    const webPreview = this.getNodeParameter('webPreview', i, true) as boolean;
    const attachMedia = this.getNodeParameter('attachMedia', i, false) as boolean;
    const mediaUrl = this.getNodeParameter('mediaUrl', i, '') as string;

    let fileToSend: CustomFile | undefined;
    let hasMedia = false;
    let mediaType: string = 'other';

    if (attachMedia) {
        const binaryProperty = this.getNodeParameter('mediaBinaryProperty', i, 'data') as string;
        const items = this.getInputData();
        const item = items[i];

        const selectedType = this.getNodeParameter('mediaType', i, 'document') as string;

        const binaryData = item?.binary?.[binaryProperty];

        if (binaryData) {
            const buffer = await this.helpers.getBinaryDataBuffer(i, binaryProperty);
            const fileName = binaryData.fileName || `upload_${Date.now()}`;
            fileToSend = new CustomFile(fileName, buffer.length, '', buffer);
            hasMedia = true;
            mediaType = selectedType || inferMediaTypeFromMime(binaryData.mimeType);
        } else if (mediaUrl && mediaUrl.trim() !== '') {
            // Download the URL and send as uploaded file to avoid WEBPAGE_MEDIA_EMPTY
            const { buffer, mimeType, fileName } = await downloadUrlToBuffer(mediaUrl);
            const safeName = fileName || `upload_${Date.now()}`;
            fileToSend = new CustomFile(safeName, buffer.length, '', buffer);
            hasMedia = true;
            mediaType = selectedType || inferMediaTypeFromMime(mimeType) || inferMediaTypeFromMimeFromUrl(mediaUrl);
        } else {
            throw new Error(`Binary property '${binaryProperty}' is missing or empty on item ${i} and no Media URL provided`);
        }
    }

    const result = await withRateLimit(async () =>
        safeExecute(() =>
            client.sendMessage(chatId, {
                message: text,
                replyTo: replyTo > 0 ? replyTo : undefined,
                noWebpage: !webPreview,
                file: fileToSend,
            })
        )
    );

    const msg = Array.isArray(result) ? result[0] : result;
    const mediaInfo = extractMediaInfo((msg as any)?.media);
    const resolvedMediaType = hasMedia ? mediaType : mediaInfo.mediaType || 'other';
    const chatIdStr = chatId?.toString?.() ?? '';
    const textStr = text ?? '';
    return await formatSendResult.call(this, client, msg, chatIdStr, textStr, hasMedia || mediaInfo.hasMedia, resolvedMediaType, replyTo, i);
}

async function formatSendResult(this: IExecuteFunctions, client: any, msg: any, chatId: string, text: string, hasMedia: boolean, mediaType: string, replyTo: number, i: number): Promise<INodeExecutionData[]> {

    let senderId: string | null = null;
    if ((msg as any)?.fromId) {
        senderId = (msg as any).fromId.userId?.toString() ||
            (msg as any).fromId.chatId?.toString() ||
            (msg as any).fromId.channelId?.toString() ||
            (msg as any).fromId.user_id?.toString() ||
            (msg as any).fromId.chat_id?.toString() ||
            (msg as any).fromId.channel_id?.toString();
    }

    if (!senderId) {
        try {
            const me = await client.getMe();
            senderId = (me as any)?.id?.toString() || null;
        } catch {
            senderId = null;
        }
    }

    let sourceName = 'Unknown';
    let formattedSourceId = typeof chatId === 'string' ? chatId : '';
    try {
        const entity = await client.getEntity(chatId);
        if (entity) {
            if ('title' in entity && entity.title) {
                sourceName = entity.title;
            } else if ('firstName' in entity || 'lastName' in entity) {
                sourceName = [entity.firstName, entity.lastName].filter(Boolean).join(' ');
            } else if ('username' in entity && entity.username) {
                sourceName = entity.username;
            }

            const rawId = entity.id ? entity.id.toString() : '';
            if (rawId) {
                if (entity.className === 'Channel' || entity._ === 'channel') formattedSourceId = `-100${rawId}`;
                else if (entity.className === 'Chat' || entity._ === 'chat') formattedSourceId = `-${rawId}`;
                else formattedSourceId = rawId;
            }
        }
    } catch { /* intentionally ignoring */ }

    const mediaInfo = extractMediaInfo((msg as any)?.media);
    const finalHasMedia = hasMedia || mediaInfo.hasMedia;
    const finalMediaType = hasMedia ? mediaType : mediaInfo.mediaType;
    const messageDate = (msg as any)?.date;
    const finalText = (msg as any)?.message ?? text;
    const isOutgoing = (msg as any)?.out !== undefined ? (msg as any).out : true;
    const replyToId = (msg as any)?.replyTo?.replyToMsgId || null;

    return [{
        json: {
            success: true,
            message: 'Message Send Successfully',
            id: (msg as any).id,
            sourceName,
            sourceId: formattedSourceId,
            text: finalText,
            date: messageDate,
            humanDate: messageDate ? formatDateWithTime(new Date(messageDate * 1000)) : null,
            fromId: senderId,
            chatId: formattedSourceId,
            isReply: replyTo > 0 || !!replyToId,
            isOutgoing,
            direction: isOutgoing ? 'sent' : 'received',
            hasMedia: finalHasMedia,
            mediaType: finalHasMedia ? finalMediaType : 'other',
            replyToId,
        },
        pairedItem: { item: i },
    }];
}

function inferMediaTypeFromMime(mime?: string): string {
    if (!mime) return 'document';
    if (mime.startsWith('image/')) return 'photo';
    if (mime.startsWith('video/')) return 'video';
    return 'document';
}

function inferMediaTypeFromMimeFromUrl(url: string): string {
    const lower = url.toLowerCase();
    if (lower.match(/\.jpg|\.jpeg|\.png|\.gif|\.webp|\.heic|\.heif/)) return 'photo';
    if (lower.match(/\.mp4|\.mov|\.mkv|\.webm/)) return 'video';
    return 'document';
}

async function downloadUrlToBuffer(url: string): Promise<{ buffer: Buffer; mimeType?: string; fileName?: string }> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download media from URL: ${res.status} ${res.statusText}`);
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const mimeType = res.headers.get('content-type') || undefined;
    const disposition = res.headers.get('content-disposition');
    let fileName: string | undefined;
    if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^";]+)"?/i);
        if (match && match[1]) fileName = match[1];
    } else {
        try {
            const u = new URL(url);
            fileName = u.pathname.split('/').filter(Boolean).pop();
        } catch { /* intentionally ignoring */ }
    }
    return { buffer, mimeType, fileName };
}

function extractMediaInfo(media: any): { hasMedia: boolean; mediaType: string } {
    if (!media) return { hasMedia: false, mediaType: 'other' };

    if (media.photo || media.className === 'MessageMediaPhoto' || media._ === 'messageMediaPhoto') {
        return { hasMedia: true, mediaType: 'photo' };
    }

    const document = media.document || media?.className === 'MessageMediaDocument' || media?._ === 'messageMediaDocument';
    if (document) {
        const mimeType = media.document?.mimeType || '';
        if (mimeType.startsWith('video/')) return { hasMedia: true, mediaType: 'video' };
        if (mimeType.startsWith('image/')) return { hasMedia: true, mediaType: 'photo' };
        return { hasMedia: true, mediaType: 'document' };
    }

    if (media.video) return { hasMedia: true, mediaType: 'video' };

    if (media.className === 'MessageMediaWebPage' || media._ === 'messageMediaWebPage') {
        return { hasMedia: false, mediaType: 'other' };
    }

    return { hasMedia: true, mediaType: 'other' };
}

function formatDateWithTime(date: Date): string {
    const istFormatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });
    const parts = istFormatter.formatToParts(date);
    const part = (type: string) => parts.find(p => p.type === type)?.value || '';
    const day = part('day');
    const month = part('month');
    const year = part('year');
    const hour = part('hour');
    const minute = part('minute');
    const second = part('second');
    const dayPeriod = part('dayPeriod');
    const formattedDate = `${day}-${month}-${year}`;
    const timePart = `${hour}:${minute}:${second} ${dayPeriod}`;
    return `${formattedDate} (${timePart}) - IST`;
}

async function forwardMessage(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const sourceChatId = this.getNodeParameter('sourceChatId', i);
    const saveToSavedMessages = this.getNodeParameter('saveToSavedMessages', i, false) as boolean;
    const targetChatId = saveToSavedMessages ? 'me' : this.getNodeParameter('targetChatId', i);
    const messageId = Number(this.getNodeParameter('messageId', i));

    const fromPeer = await client.getEntity(sourceChatId);
    const toPeer = saveToSavedMessages ? 'me' : await client.getEntity(targetChatId);

    const result = await client.forwardMessages(toPeer, {
        fromPeer: fromPeer,
        messages: [messageId],
    });

    const msg = Array.isArray(result) ? result[0] : result;

    let senderId: string | null = null;
    if ((msg as any).fromId) {
        senderId = (msg as any).fromId.userId?.toString() ||
            (msg as any).fromId.chatId?.toString() ||
            (msg as any).fromId.channelId?.toString() ||
            (msg as any).fromId.user_id?.toString() ||
            (msg as any).fromId.chat_id?.toString() ||
            (msg as any).fromId.channel_id?.toString();
    }

    let sourceName = 'Unknown';
    let formattedTargetId = typeof targetChatId === 'string' ? targetChatId : '';
    try {
        const entity = await client.getEntity(targetChatId);
        if (entity) {
            if ('title' in entity && entity.title) {
                sourceName = entity.title;
            } else if ('firstName' in entity || 'lastName' in entity) {
                sourceName = [entity.firstName, entity.lastName].filter(Boolean).join(' ');
            } else if ('username' in entity && entity.username) {
                sourceName = entity.username;
            }

            const rawId = entity.id ? entity.id.toString() : '';
            if (rawId) {
                if (entity.className === 'Channel' || entity._ === 'channel') formattedTargetId = `-100${rawId}`;
                else if (entity.className === 'Chat' || entity._ === 'chat') formattedTargetId = `-${rawId}`;
                else formattedTargetId = rawId;
            }
        }
    } catch { /* intentionally ignoring */ }

    const mediaInfo = extractMediaInfo((msg as any)?.media);
    const messageDate = (msg as any)?.date;
    const isOutgoing = (msg as any)?.out !== undefined ? (msg as any).out : true;
    const replyToId = (msg as any)?.replyTo?.replyToMsgId || null;

    return [{
        json: {
            success: true,
            message: 'Message forwarded successfully',
            id: (msg as any).id,
            sourceName,
            sourceId: formattedTargetId,
            text: (msg as any).message || '',
            date: messageDate,
            humanDate: messageDate ? formatDateWithTime(new Date(messageDate * 1000)) : null,
            fromId: senderId,
            chatId: formattedTargetId,
            isReply: !!replyToId,
            isOutgoing,
            direction: isOutgoing ? 'sent' : 'received',
            hasMedia: mediaInfo.hasMedia,
            mediaType: mediaInfo.hasMedia ? mediaInfo.mediaType : 'other',
            replyToId,
        },
        pairedItem: { item: i },
    }];
}

async function getHistory(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const historyFromSelf = this.getNodeParameter('historyFromSelf', i, false) as boolean;
    const chatIdInput = historyFromSelf ? 'me' : (this.getNodeParameter('chatId', i) as string);
    const mode = this.getNodeParameter('mode', i, 'limit') as string;
    const onlyMedia = this.getNodeParameter('onlyMedia', i, false) as boolean;
    const mediaTypes = this.getNodeParameter('mediaType', i, []) as string[];

    let sourceName = 'Unknown';
    let formattedSourceId = chatIdInput;

    try {
        const entity = await client.getEntity(chatIdInput);
        if (entity) {
            if ('title' in entity && entity.title) {
                sourceName = entity.title;
            } else if ('firstName' in entity || 'lastName' in entity) {
                sourceName = [entity.firstName, entity.lastName].filter(Boolean).join(' ');
            } else if ('username' in entity && entity.username) {
                sourceName = entity.username;
            }

            const rawId = entity.id ? entity.id.toString() : '';
            if (rawId) {
                if (entity.className === 'Channel' || entity._ === 'channel') formattedSourceId = `-100${rawId}`;
                else if (entity.className === 'Chat' || entity._ === 'chat') formattedSourceId = `-${rawId}`;
                else formattedSourceId = rawId;
            }
        }
    } catch { /* intentionally ignoring */ }

    let messages: any[] = [];

    if (mode === 'limit') {
        const limit = this.getNodeParameter('limit', i, 10) as number;
        const result = await safeExecute(() => client.getMessages(chatIdInput, { limit }));
        messages = Array.isArray(result) ? result : [];
    } else {
        const maxMessages = this.getNodeParameter('maxMessages', i, 500) as number;
        const iterOptions: Record<string, any> = {};
        if (maxMessages > 0) iterOptions.limit = maxMessages;

        if (mode === 'hours') {
            const hours = this.getNodeParameter('hours', i, 24) as number;
            const cutoffTime = Math.floor(Date.now() / 1000) - (hours * 3600);
            for await (const msg of client.iterMessages(chatIdInput, iterOptions)) {
                if (msg.date < cutoffTime) break;
                messages.push(msg);
            }
        } else if (mode === 'range') {
            const fromDateStr = this.getNodeParameter('fromDate', i, '') as string;
            const toDateStr = this.getNodeParameter('toDate', i, '') as string;
            const fromTime = fromDateStr ? Math.floor(new Date(fromDateStr).getTime() / 1000) : 0;
            const toTime = toDateStr ? Math.floor(new Date(toDateStr).getTime() / 1000) : Math.floor(Date.now() / 1000);

            for await (const msg of client.iterMessages(chatIdInput, iterOptions)) {
                if (msg.date > toTime) continue;
                if (msg.date < fromTime) break;
                messages.push(msg);
            }
        }
    }

    const items = [];
    for (const m of messages as any[]) {
        if (!m || m._ === 'MessageEmpty') continue;

        const isPhoto = !!m.media?.photo;
        const isDocument = !!m.media?.document;
        const isVideo = !!m.media?.video || (isDocument && m.media.document?.mimeType?.includes('video'));
        const hasMedia = isPhoto || isDocument || isVideo || !!m.media;

        if (onlyMedia && !hasMedia) continue;

        if (onlyMedia && mediaTypes.length > 0) {
            let match = false;
            if (mediaTypes.includes('photo') && isPhoto) match = true;
            if (mediaTypes.includes('video') && isVideo) match = true;
            if (mediaTypes.includes('document') && isDocument && !isVideo) match = true;
            if (!match) continue;
        }

        items.push({
            json: {
                id: m.id,
                sourceName: sourceName,
                sourceId: formattedSourceId,
                text: m.message || '',
                date: m.date,
                humanDate: formatDateWithTime(new Date(m.date * 1000)),
                fromId: m.fromId?.userId?.toString() || m.fromId?.toString() || null,
                chatId: m.peerId?.userId?.toString() || m.peerId?.chatId?.toString() || m.peerId?.channelId?.toString() || m.peerId?.toString() || null,
                isReply: !!m.replyTo,
                isOutgoing: m.out,
                direction: m.out ? 'sent' : 'received',
                hasMedia,
                mediaType: isPhoto ? 'photo' : isVideo ? 'video' : isDocument ? 'document' : 'other',
            },
            pairedItem: { item: i },
        });
    }

    return items;
}

async function unpinMessage(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const chatId = this.getNodeParameter('chatId', i) as string;
    const messageId = Number(this.getNodeParameter('messageId', i));

    await safeExecute(() =>
        client.invoke(new Api.messages.UpdatePinnedMessage({
            peer: chatId,
            id: messageId,
            unpin: true,
        }))
    );

    // Fetch detailed message info
    let detailedMessage: any = null;
    try {
        const messages = await client.getMessages(chatId, { ids: [messageId] });
        if (messages && messages.length > 0) {
            detailedMessage = messages[0];
        }
    } catch (error) {
        logger.warn('Failed to fetch detailed message info after unpin: ' + (error as Error).message);
    }

    // Resolve entity info for source
    let sourceName = 'Unknown';
    let formattedSourceId = typeof chatId === 'string' ? chatId : '';
    try {
        const entity = await client.getEntity(chatId);
        if (entity) {
            if ('title' in entity && entity.title) {
                sourceName = entity.title;
            } else if ('firstName' in entity || 'lastName' in entity) {
                sourceName = [entity.firstName, entity.lastName].filter(Boolean).join(' ');
            } else if ('username' in entity && entity.username) {
                sourceName = entity.username;
            }

            const rawId = entity.id ? entity.id.toString() : '';
            if (rawId) {
                if (entity.className === 'Channel' || entity._ === 'channel') formattedSourceId = `-100${rawId}`;
                else if (entity.className === 'Chat' || entity._ === 'chat') formattedSourceId = `-${rawId}`;
                else formattedSourceId = rawId;
            }
        }
    } catch { /* intentionally ignoring */ }

    const mediaInfo = extractMediaInfo(detailedMessage?.media);
    const messageDate = detailedMessage?.date;
    const replyToId = detailedMessage?.replyTo?.replyToMsgId || null;
    const isOutgoing = detailedMessage?.out !== undefined ? detailedMessage.out : true;
    const finalText = detailedMessage?.message ?? '';
    const fromId =
        detailedMessage?.fromId?.userId?.toString() ||
        detailedMessage?.fromId?.chatId?.toString() ||
        detailedMessage?.fromId?.channelId?.toString() ||
        detailedMessage?.fromId?.toString() ||
        null;

    return [{
        json: {
            success: true,
            message: 'Message Unpinned successfully',
            id: messageId,
            sourceName,
            sourceId: formattedSourceId,
            text: finalText,
            date: messageDate,
            humanDate: messageDate ? formatDateWithTime(new Date(messageDate * 1000)) : null,
            fromId,
            chatId: formattedSourceId,
            isReply: !!replyToId,
            isOutgoing,
            direction: isOutgoing ? 'sent' : 'received',
            hasMedia: mediaInfo.hasMedia,
            mediaType: mediaInfo.hasMedia ? mediaInfo.mediaType : 'other',
            unpinnedId: messageId
        },
        pairedItem: { item: i },
    }];
}

async function sendPoll(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const chatId = this.getNodeParameter('chatId', i);
    const question = this.getNodeParameter('pollQuestion', i) as string;
    const options = this.getNodeParameter('pollOptions', i) as string[];
    const isQuiz = this.getNodeParameter('isQuiz', i) as boolean;
    const isAnonymous = this.getNodeParameter('anonymous', i, true) as boolean;

    let correctAnswers: Buffer[] | undefined = undefined;
    if (isQuiz) {
        const correctIndex = this.getNodeParameter('correctAnswerIndex', i) as number;
        correctAnswers = [Buffer.from(correctIndex.toString())];
    }

    const peer = await client.getEntity(chatId);
    const isBroadcastChannel = peer.className === 'Channel' && peer.broadcast;
    const publicVoters = isBroadcastChannel ? false : !isAnonymous;
    const pollId = BigInt(Math.floor(Math.random() * 1000000000));

    await safeExecute(() =>
        client.invoke(new Api.messages.SendMedia({
            peer: peer,
            media: new Api.InputMediaPoll({
                poll: new Api.Poll({
                    id: pollId as any,
                    question: new Api.TextWithEntities({
                        text: question,
                        entities: [],
                    }),
                    answers: options.map((opt, index) => new Api.PollAnswer({
                        text: new Api.TextWithEntities({ text: opt, entities: [] }),
                        option: Buffer.from(index.toString())
                    })),
                    closed: false,
                    publicVoters: publicVoters,
                    multipleChoice: false,
                    quiz: isQuiz,
                }),
                correctAnswers: correctAnswers,
            }),
            message: '',
            randomId: BigInt(Math.floor(Math.random() * 1000000000)) as any,
        }))
    );

    const pollType = isAnonymous ? 'Anonymous Voting' : 'Public Voting';
    const formattedDate = null; // Telegram does not return a reliable poll timestamp in this call

    return [{
        json: {
            success: true,
            message: 'Create Poll successfully',
            pollId: pollId.toString(),
            title: question,
            options: options.join(', '),
            poll_type: pollType,
            create_time: formattedDate,
            isQuiz: isQuiz,
        },
        pairedItem: { item: i },
    }];
}

async function copyMessage(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const sourceChatId = this.getNodeParameter('sourceChatId', i);
    const saveToSavedMessages = this.getNodeParameter('saveToSavedMessages', i, false) as boolean;
    const targetChatId = saveToSavedMessages ? 'me' : this.getNodeParameter('targetChatId', i);
    const messageId = Number(this.getNodeParameter('messageId', i));
    const caption = this.getNodeParameter('caption', i, '') as string;
    const disableLinkPreview = this.getNodeParameter('disableLinkPreview', i, false) as boolean;

    const fromPeer = await resolvePeer(client, sourceChatId);
    const toPeer = saveToSavedMessages ? 'me' : await resolvePeer(client, targetChatId);

    const messages = await safeExecute(() => client.getMessages(fromPeer, { ids: [messageId] })) as any[];

    const originalMessage = messages[0];
    if (!originalMessage) throw new Error('Original message not found');

    let messageContent = originalMessage.message || '';
    if (caption && caption.trim()) messageContent = caption;

    // --- FIX START ---
    // Check if media exists and if it is a WebPage (Link Preview).
    // WebPage objects cannot be sent as "files".
    let mediaToSend = originalMessage.media;

    if (mediaToSend && (mediaToSend.className === 'MessageMediaWebPage' || mediaToSend._ === 'messageMediaWebPage')) {
        mediaToSend = undefined;
    }
    // --- FIX END ---

    const result = await withRateLimit(async () =>
        safeExecute(() =>
            client.sendMessage(toPeer, {
                message: messageContent,
                file: mediaToSend, // Use the filtered variable here
                linkPreview: !disableLinkPreview,
                formattingEntities: originalMessage.entities || [],
            })
        )
    );

    let senderId: string | null = null;
    if ((result as any).fromId) {
        senderId = (result as any).fromId.userId?.toString() ||
            (result as any).fromId.chatId?.toString() ||
            (result as any).fromId.channelId?.toString() ||
            (result as any).fromId.user_id?.toString() ||
            (result as any).fromId.chat_id?.toString() ||
            (result as any).fromId.channel_id?.toString();
    }

    if (!senderId && originalMessage.fromId) {
        senderId = originalMessage.fromId.userId?.toString() ||
            originalMessage.fromId.chatId?.toString() ||
            originalMessage.fromId.channelId?.toString() ||
            originalMessage.fromId.user_id?.toString() ||
            originalMessage.fromId.chat_id?.toString() ||
            originalMessage.fromId.channel_id?.toString();
    }

    if (!senderId && originalMessage.post_author) senderId = originalMessage.post_author;
    if (!senderId && originalMessage.peerId) {
        senderId = originalMessage.peerId.userId?.toString() ||
            originalMessage.peerId.chatId?.toString() ||
            originalMessage.peerId.channelId?.toString();
    }

    return [{
        json: {
            success: true,
            message: 'Message copied successfully',
            copiedId: (result as any).id,
            originalId: originalMessage.id,
            text: (result as any).message,
            chatId: (result as any).chatId?.toString(),
            fromId: senderId,
            date: (result as any).date,
            hasMedia: !!mediaToSend, // Update status to reflect what was actually sent
            caption: caption || messageContent,
        },
        pairedItem: { item: i },
    }];
}

/**
 * Robust peer resolver to avoid "Could not find the input entity" errors when the client
 * has not cached a user/channel yet. We try getEntity first, then scan dialogs the client
 * can see, and finally rethrow the original error for clearer debugging.
 */
async function resolvePeer(client: any, rawId: any): Promise<any> {
    const asString = typeof rawId === 'string' ? rawId.trim() : String(rawId);
    if (!asString || asString.toLowerCase() === 'me') return 'me';

    try {
        return await client.getEntity(asString);
    } catch (initialError) {
        // Fallback: walk through dialogs to find a matching peer by id/username
        for await (const dialog of client.iterDialogs({ limit: 5000 })) {
            const entity = dialog.entity || dialog;
            const idMatch = entity.id?.toString() === asString;
            const usernameMatch = entity.username && (`@${entity.username}`.toLowerCase() === asString.toLowerCase() || entity.username.toLowerCase() === asString.toLowerCase());
            if (idMatch || usernameMatch) return entity;
        }
        throw initialError;
    }
}

async function copyRestrictedContent(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const sourceChatId = this.getNodeParameter('sourceChatId', i) as string;
    const messageId = this.getNodeParameter('messageId', i) as string;
    const saveToSavedMessages = this.getNodeParameter('saveToSavedMessages', i, false) as boolean;
    const includeCaption = this.getNodeParameter('includeCaption', i, true) as boolean;
    const downloadTimeout = this.getNodeParameter('downloadTimeout', i, 60) as number;

    // Only get targetChatId if not saving to saved messages
    const targetChatId = saveToSavedMessages ? '' : (this.getNodeParameter('targetChatId', i) as string);

    try {
        logger.info(`Attempting to copy restricted message ${messageId} from chat ${sourceChatId}`);

        // 1. Get the message
        const messages: any[] = await (client.getMessages(sourceChatId, { ids: [parseInt(messageId)] }) as any[]);

        if (!messages || messages.length === 0) {
            throw new Error(`Message ${messageId} not found in chat ${sourceChatId}`);
        }

        const message = messages[0];

        // 2. Check if message has content to copy
        if (!message.media && !message.text && !message.message) {
            throw new Error('Message has no content to copy');
        }

        // 3. Determine target chat
        const finalTargetChatId = saveToSavedMessages ? 'me' : targetChatId;

        // 4. Handle different media types
        let result;
        const isPhoto = !!message.media?.photo;
        const isDocument = !!message.media?.document;
        const isVideo = !!message.media?.video || (isDocument && message.media.document?.mimeType?.includes('video'));

        if (message.media?.photo) {
            result = await handlePhoto(client, message, finalTargetChatId, { includeCaption, downloadTimeout });
        } else if (message.media?.video) {
            result = await handleVideo(client, message, finalTargetChatId, { includeCaption, downloadTimeout });
        } else if (message.media?.document) {
            result = await handleDocument(client, message, finalTargetChatId, { includeCaption, downloadTimeout });
        } else if (message.sticker) {
            result = await handleSticker(client, message, finalTargetChatId, { downloadTimeout });
        } else if (message.voice) {
            result = await handleVoice(client, message, finalTargetChatId, { includeCaption, downloadTimeout });
        } else if (message.audio) {
            result = await handleAudio(client, message, finalTargetChatId, { includeCaption, downloadTimeout });
        } else if (message.media?.geo) {
            result = await handleLocation(client, message, finalTargetChatId, { includeCaption });
        } else if (message.media?.contact) {
            result = await handleContact(client, message, finalTargetChatId);
        } else if (message.media?.poll) {
            result = await handlePoll(client, message, finalTargetChatId, { includeCaption });
        } else if (message.media?.dice) {
            result = await handleDice(client, message, finalTargetChatId);
        } else if (message.text || message.message) {
            result = await handleText(client, message, finalTargetChatId, { includeCaption });
        } else {
            throw new Error(`Unsupported media type: ${JSON.stringify(message)}`);
        }

        return [{
            json: {
                success: true,
                message: 'Restricted content copied successfully',
                messageId: (result as any).id,
                chatId: finalTargetChatId,
                timestamp: (result as any).date,
                originalMessageId: messageId,
                sourceChatId: sourceChatId,
                mediaType: isPhoto ? 'photo' : isVideo ? 'video' : isDocument ? 'document' : 'other'
            },
            pairedItem: { item: i },
        }];

    } catch (error) {
        logger.error('Failed to copy restricted content:', error);

        // Check if it's a restriction error
        if ((error as Error).message.includes('FORBIDDEN') ||
            (error as Error).message.includes('RESTRICTED') ||
            (error as Error).message.includes('SAVING_CONTENT_RESTRICTED')) {
            throw new Error(`Content is restricted and cannot be copied. Error: ${(error as Error).message}`);
        }

        throw error;
    }
}

// Helper function to download media with timeout
async function downloadMediaWithTimeout(client: any, message: any, timeoutSeconds: number = 60): Promise<any> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Download timeout after ${timeoutSeconds} seconds`));
        }, timeoutSeconds * 1000);

        client.downloadMedia(message, { stream: true })
            .then((stream: any) => {
                clearTimeout(timeout);
                resolve(stream);
            })
            .catch((error: any) => {
                clearTimeout(timeout);
                reject(error);
            });
    });
}

// Helper function to download media to buffer
async function downloadMediaBuffer(client: any, message: any): Promise<Buffer> {
    try {
        // Download media - may return Buffer directly or a stream
        const result = await client.downloadMedia(message, { stream: true });

        // If result is already a Buffer, return it directly
        if (Buffer.isBuffer(result)) {
            return result;
        }

        // If result is a stream-like object with on method
        if (result && typeof result.on === 'function') {
            return new Promise((resolve, reject) => {
                const chunks: Buffer[] = [];
                result.on('data', (chunk: Buffer) => chunks.push(chunk));
                result.on('end', () => resolve(Buffer.concat(chunks)));
                result.on('error', reject);
            });
        }

        // If result is a ReadableStream (browser/web stream)
        if (result && typeof result.getReader === 'function') {
            const reader = result.getReader();
            const chunks: Uint8Array[] = [];
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
            }
            return Buffer.concat(chunks.map(c => Buffer.from(c)));
        }

        // Fallback: try to convert result to buffer
        return Buffer.from(result);
    } catch (error) {
        throw new Error(`Failed to download media: ${error}`);
    }
}

// Helper function to extract filename from message attributes
function getFilename(message: any): string | undefined {
    const attributes = message.media?.document?.attributes;
    if (!attributes) return undefined;
    const filenameAttr = attributes.find((a: any) => a.className === 'DocumentAttributeFilename');
    return filenameAttr ? filenameAttr.fileName : undefined;
}

// Photo handler
async function handlePhoto(client: any, message: any, targetChatId: string, options: any) {
    const caption = options.includeCaption ? (message.text || message.message || message.caption || '') : '';

    // For photos, we need to create InputMediaPhoto from the message media
    // This allows forwarding the photo without downloading/re-uploading
    const photoMedia = message.media?.photo;

    if (!photoMedia) {
        throw new Error('No photo found in message');
    }

    // Try direct forwarding first (faster)
    try {
        const inputPhoto = new Api.InputPhoto({
            id: photoMedia.id,
            accessHash: photoMedia.accessHash,
            fileReference: photoMedia.fileReference,
        });

        const inputMediaPhoto = new Api.InputMediaPhoto({
            id: inputPhoto,
        });

        return await client.invoke(new Api.messages.SendMedia({
            peer: targetChatId,
            media: inputMediaPhoto,
            message: caption,
            randomId: BigInt(Math.floor(Math.random() * 1000000000)) as any,
        }));
    } catch (forwardError: any) {
        // If forwarding is restricted, fall back to download-and-upload
        const isRestrictedError = forwardError.message?.includes('FORBIDDEN') ||
            forwardError.message?.includes('RESTRICTED') ||
            forwardError.message?.includes('CHAT_FORWARDS_RESTRICTED') ||
            forwardError.message?.includes('400');

        if (isRestrictedError) {
            logger.info(`Direct photo forwarding restricted, falling back to download-and-upload`);

            // Download the photo to buffer
            const photoBuffer = await downloadMediaBuffer(client, message);

            // Create CustomFile to ensure filename is preserved
            const file = new CustomFile("photo.jpg", photoBuffer.length, '', photoBuffer);

            // Send as a new file upload
            return await client.sendMessage(targetChatId, {
                file: file,
                message: caption,
            });
        }

        // If it's not a restriction error, re-throw it
        throw forwardError;
    }
}

// Video handler
async function handleVideo(client: any, message: any, targetChatId: string, options: any) {
    const caption = options.includeCaption ? (message.text || message.message || message.caption || '') : '';

    // Download video to buffer
    const videoBuffer = await downloadMediaBuffer(client, message);

    const filename = getFilename(message) || `video_${Date.now()}.mp4`;
    const file = new CustomFile(filename, videoBuffer.length, '', videoBuffer);

    return await client.sendMessage(targetChatId, {
        file: file,
        message: caption,
        formattingEntities: message.entities || [],
        attributes: message.media?.document?.attributes,
    });
}

// Document handler
async function handleDocument(client: any, message: any, targetChatId: string, options: any) {
    const caption = options.includeCaption ? (message.text || message.message || message.caption || '') : '';

    // Download document to buffer
    const docBuffer = await downloadMediaBuffer(client, message);

    const filename = getFilename(message) || `document_${Date.now()}`;
    const file = new CustomFile(filename, docBuffer.length, '', docBuffer);

    return await client.sendMessage(targetChatId, {
        file: file,
        message: caption,
        formattingEntities: message.entities || [],
        attributes: message.media?.document?.attributes,
    });
}

// Sticker handler
async function handleSticker(client: any, message: any, targetChatId: string, options: any) {
    // Download sticker
    const stickerStream = await downloadMediaWithTimeout(client, message, options.downloadTimeout);

    return await client.sendMessage(targetChatId, {
        file: stickerStream
    });
}

// Voice message handler
async function handleVoice(client: any, message: any, targetChatId: string, options: any) {
    const caption = options.includeCaption ? (message.text || message.message || message.caption || '') : '';

    const voiceBuffer = await downloadMediaBuffer(client, message);

    const filename = getFilename(message) || `voice_${Date.now()}.ogg`;
    const file = new CustomFile(filename, voiceBuffer.length, '', voiceBuffer);

    return await client.sendMessage(targetChatId, {
        file: file,
        message: caption,
        formattingEntities: message.entities || [],
        attributes: message.media?.document?.attributes,
    });
}

// Audio handler
async function handleAudio(client: any, message: any, targetChatId: string, options: any) {
    const caption = options.includeCaption ? (message.text || message.message || message.caption || '') : '';

    const audioBuffer = await downloadMediaBuffer(client, message);

    const filename = getFilename(message) || `audio_${Date.now()}.mp3`;
    const file = new CustomFile(filename, audioBuffer.length, '', audioBuffer);

    return await client.sendMessage(targetChatId, {
        file: file,
        message: caption,
        formattingEntities: message.entities || [],
        attributes: message.media?.document?.attributes,
    });
}

// Location handler
async function handleLocation(client: any, message: any, targetChatId: string, options: any) {
    const caption = options.includeCaption ? (message.text || message.message || message.caption || '') : '';

    return await client.invoke(new Api.messages.SendMedia({
        peer: targetChatId,
        media: new Api.InputMediaGeoPoint({
            geoPoint: new Api.InputGeoPoint({
                lat: message.media?.geo?.lat,
                long: message.media?.geo?.long,
            })
        }),
        message: caption,
        randomId: BigInt(Math.floor(Math.random() * 1000000000)) as any,
    }));
}

// Contact handler
async function handleContact(client: any, message: any, targetChatId: string) {
    return await client.invoke(new Api.messages.SendMedia({
        peer: targetChatId,
        media: new Api.InputMediaContact({
            phoneNumber: message.media?.contact?.phoneNumber,
            firstName: message.media?.contact?.firstName,
            lastName: message.media?.contact?.lastName || '',
            vcard: message.media?.contact?.vcard || '',
        }),
        message: '',
        randomId: BigInt(Math.floor(Math.random() * 1000000000)) as any,
    }));
}

// Poll handler
async function handlePoll(client: any, message: any, targetChatId: string, options: any) {
    const caption = options.includeCaption ? (message.text || message.message || message.caption || '') : '';

    // Reuse the logic from the sendPoll operation which uses Api.InputMediaPoll
    return await client.invoke(new Api.messages.SendMedia({
        peer: targetChatId,
        media: new Api.InputMediaPoll({
            poll: new Api.Poll({
                id: BigInt(Math.floor(Math.random() * 1000000000)) as any,
                question: new Api.TextWithEntities({
                    text: message.poll?.question || '',
                    entities: [],
                }),
                answers: message.poll?.answers?.map((a: any, index: number) => new Api.PollAnswer({
                    text: new Api.TextWithEntities({ text: a.text, entities: [] }),
                    option: Buffer.from(index.toString())
                })) || [],
                closed: false,
                publicVoters: message.poll?.publicVoters,
                multipleChoice: message.poll?.multipleChoice,
                quiz: message.poll?.quiz,
            }),
        }),
        message: caption,
        randomId: BigInt(Math.floor(Math.random() * 1000000000)) as any,
    }));
}

// Dice handler
async function handleDice(client: any, message: any, targetChatId: string) {
    return await client.invoke(new Api.messages.SendMedia({
        peer: targetChatId,
        media: new Api.InputMediaDice({
            emoticon: message.dice?.emoji || '🎲'
        }),
        message: '',
        randomId: BigInt(Math.floor(Math.random() * 1000000000)) as any,
    }));
}

// Text handler (no media)
async function handleText(client: any, message: any, targetChatId: string, options: any) {
    const text = options.includeCaption ? (message.text || message.message || '') : '';

    return await client.sendMessage(targetChatId, {
        message: text,
        formattingEntities: message.entities || []
    });
}
