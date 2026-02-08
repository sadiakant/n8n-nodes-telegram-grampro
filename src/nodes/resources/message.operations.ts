import { IExecuteFunctions } from 'n8n-workflow';
import { getClient } from '../../core/clientManager';
import { safeExecute } from '../../core/floodWaitHandler';
import { withRateLimit } from '../../core/rateLimiter';
import { Api } from 'telegram';
import bigInt from 'big-integer';

export async function messageRouter(this: IExecuteFunctions, operation: string) {

	const creds: any = await this.getCredentials('telegramApi');

	const client = await getClient(
		creds.apiId,
		creds.apiHash,
		creds.session,
	);

	switch (operation) {
		case 'sendText':return sendText.call(this, client);
		case 'forwardMessage': return forwardMessage.call(this, client);
		case 'getHistory': return getHistory.call(this, client);
		case 'editMessage': return editMessage.call(this, client);     
        case 'deleteMessage': return deleteMessage.call(this, client); 
        case 'deleteHistory': return deleteHistory.call(this, client);
        case 'pinMessage': return pinMessage.call(this, client);    
		case 'unpinMessage': return unpinMessage.call(this, client);
		case 'sendPoll': return sendPoll.call(this, client);
		case 'copyMessage': return copyMessage.call(this, client);
		case 'editMessageMedia': return editMessageMedia.call(this, client);
		default:
			throw new Error(`Message operation not supported: ${operation}`);
	}
}

// --- FUNCTIONS ---

async function editMessage(this: IExecuteFunctions, client: any) {
    const chatId = this.getNodeParameter('chatId', 0);
    const messageId = Number(this.getNodeParameter('messageId', 0));
    const text = this.getNodeParameter('text', 0);
    const noWebpage = this.getNodeParameter('noWebpage', 0) as boolean;

    const result = await safeExecute(() => 
        client.editMessage(chatId, { 
            message: messageId, 
            text, 
            noWebpage 
        })
    );

    return [[{ 
        json: { 
            success: true, 
            id: result.id, 
            text: result.message,
            noWebpage: noWebpage 
        } 
    }]];
}

async function editMessageMedia(this: IExecuteFunctions, client: any) {
    const chatId = this.getNodeParameter('chatId', 0) as string;
    const messageId = Number(this.getNodeParameter('messageId', 0));
    const media = this.getNodeParameter('media', 0);
    const captionInput = this.getNodeParameter('caption', 0, '') as string;
    const captionEntitiesInput = this.getNodeParameter('captionEntities', 0, []) as any[];
    const parseMode = this.getNodeParameter('parseMode', 0, 'default') as string;

    let finalCaption = captionInput;
    let finalEntities = captionEntitiesInput;
    let debugInfo = "Using new caption";

    if (!captionInput || captionInput.trim() === '') {
        try {
            const messages = await client.getMessages(chatId, { ids: [messageId] });
            if (messages && messages.length > 0 && messages[0]) {
                const msg = messages[0];
                finalCaption = msg.message || "";
                finalEntities = msg.entities || [];
                debugInfo = "Successfully preserved original text";
            } else {
                debugInfo = `Error: Message ${messageId} not found in chat ${chatId}. Check your 'Chat ID' field!`;
            }
        } catch (error) {
            debugInfo = `Fetch error: ${error.message}`;
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

    return [[{ 
        json: { 
            success: true, 
            id: result.id, 
            text: result.message, 
            debug_logic: debugInfo,
            target_chat: chatId
        } 
    }]];
}

async function deleteMessage(this: IExecuteFunctions, client: any) {
    const chatId = this.getNodeParameter('chatId', 0);
    const messageId = Number(this.getNodeParameter('messageId', 0));
    const revoke = this.getNodeParameter('revoke', 0) as boolean;

    await safeExecute(() => 
        client.deleteMessages(chatId, [messageId], { revoke })
    );

    return [[{ json: { success: true, deletedId: messageId, revoked: revoke } }]];
}

// --- UPDATED DELETE HISTORY FUNCTION ---
async function deleteHistory(this: IExecuteFunctions, client: any) {
    const chatId = this.getNodeParameter('chatId', 0) as string;
    const maxId = this.getNodeParameter('maxId', 0) as number || 0;
    const revoke = this.getNodeParameter('revoke', 0) as boolean;

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
            preDeleteCount = countResult.total || 0;
        } catch (e) {
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
            
            offset = response.offset;
            loopCount++;

            if (loopCount > 100) break; 
            if (offset > 0) await new Promise(resolve => setTimeout(resolve, 100));

        } while (offset > 0);

        return [[{ 
            json: { 
                success: true, 
                // Return the count we fetched before deletion
                deletedCount: preDeleteCount, 
                maxId: maxId, 
                revoked: revoke,
                iterations: loopCount
            } 
        }]];
        
    } catch (error) {
        if (this.continueOnFail()) {
            return [[{ json: { success: false, error: error.message } }]];
        } else {
            throw error;
        }
    }
}

async function pinMessage(this: IExecuteFunctions, client: any) {
    const chatId = this.getNodeParameter('chatId', 0);
    const messageId = Number(this.getNodeParameter('messageId', 0));
    const notify = this.getNodeParameter('notify', 0) as boolean;

    await safeExecute(() => 
        client.pinMessage(chatId, messageId, { notify })
    );

    return [[{ json: { success: true, pinnedId: messageId, notified: notify } }]];
}

async function sendText(this: IExecuteFunctions, client: any) {
    const chatId = this.getNodeParameter('chatId', 0);
    const text = this.getNodeParameter('text', 0);
    const replyTo = this.getNodeParameter('replyTo', 0) as number;

    const result = await withRateLimit(async () =>
        safeExecute(() =>
            client.sendMessage(chatId, { 
                message: text,
                replyTo: replyTo > 0 ? replyTo : undefined,
            })
        )
    );

    let senderId: string | null = null;
    if (result.fromId) {
        senderId = result.fromId.userId?.toString() || 
                   result.fromId.chatId?.toString() || 
                   result.fromId.channelId?.toString() ||
                   result.fromId.user_id?.toString() ||
                   result.fromId.chat_id?.toString() ||
                   result.fromId.channel_id?.toString();
    }

    return [[{
        json: {
            id: result.id,
            text: result.message,
            replyToId: result.replyTo?.replyToMsgId || null,
            chatId: result.chatId?.toString(),
            fromId: senderId,
			date: result.date,
        },
    }]];
}

async function forwardMessage(this: IExecuteFunctions, client: any) {
    const fromChat = this.getNodeParameter('fromChatId', 0);
    const toChat = this.getNodeParameter('toChatId', 0);
    const messageId = Number(this.getNodeParameter('messageId', 0));

    const fromPeer = await client.getEntity(fromChat);
    const toPeer = await client.getEntity(toChat);

    const result = await client.forwardMessages(toPeer, {
        fromPeer: fromPeer,
        messages: [messageId], 
    });

    const msg = Array.isArray(result) ? result[0] : result;

    let senderId: string | null = null;
    if (msg.fromId) {
        senderId = msg.fromId.userId?.toString() || 
                   msg.fromId.chatId?.toString() || 
                   msg.fromId.channelId?.toString() ||
                   msg.fromId.user_id?.toString() ||
                   msg.fromId.chat_id?.toString() ||
                   msg.fromId.channel_id?.toString();
    }

    return [[{
        json: {
            success: true,
            message: 'Message forwarded successfully',
            forwardedId: msg.id,
            text: msg.message,
            chatId: msg.chatId?.toString(),
            fromId: senderId,
            date: msg.date,
        },
    }]];
}

async function getHistory(this: IExecuteFunctions, client: any) {
	const chatIdInput = this.getNodeParameter('chatId', 0) as string;
	const mode = this.getNodeParameter('mode', 0, 'limit') as string;
	const onlyMedia = this.getNodeParameter('onlyMedia', 0, false) as boolean;
	const mediaTypes = this.getNodeParameter('mediaType', 0, []) as string[];

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
    } catch (error) {}

	let messages: any[] = [];

	if (mode === 'limit') {
		const limit = this.getNodeParameter('limit', 0, 10) as number;
		messages = await safeExecute(() => client.getMessages(chatIdInput, { limit }));
	} else {
		const maxMessages = this.getNodeParameter('maxMessages', 0, 500) as number;
		const iterOptions: Record<string, any> = {};
		if (maxMessages > 0) iterOptions.limit = maxMessages;

		if (mode === 'hours') {
			const hours = this.getNodeParameter('hours', 0, 24) as number;
			const cutoffTime = Math.floor(Date.now() / 1000) - (hours * 3600);
			for await (const msg of client.iterMessages(chatIdInput, iterOptions)) {
				if (msg.date < cutoffTime) break;
				messages.push(msg);
			}
		} else if (mode === 'range') {
			const fromDateStr = this.getNodeParameter('fromDate', 0, '') as string;
			const toDateStr = this.getNodeParameter('toDate', 0, '') as string;
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
	for (const m of messages) {
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
				humanDate: new Date(m.date * 1000).toISOString(),
				fromId: m.fromId?.userId?.toString() || m.fromId?.toString() || null,
				chatId: m.peerId?.userId?.toString() || m.peerId?.chatId?.toString() || m.peerId?.channelId?.toString() || m.peerId?.toString() || null,
				isReply: !!m.replyTo,
				isOutgoing: m.out,
				direction: m.out ? 'sent' : 'received',
				hasMedia,
				mediaType: isPhoto ? 'photo' : isVideo ? 'video' : isDocument ? 'document' : 'other',
			},
		});
	}

	return [items];
}

async function unpinMessage(this: IExecuteFunctions, client: any) {
    const chatId = this.getNodeParameter('chatId', 0) as string;
    const messageId = Number(this.getNodeParameter('messageId', 0));

    await safeExecute(() => 
        client.invoke(new Api.messages.UpdatePinnedMessage({
            peer: chatId,
            id: messageId,
            unpin: true,
        }))
    );

    return [[{ json: { success: true, unpinnedId: messageId } }]];
}

async function sendPoll(this: IExecuteFunctions, client: any) {
    const chatId = this.getNodeParameter('chatId', 0);
    const question = this.getNodeParameter('pollQuestion', 0) as string;
    const options = this.getNodeParameter('pollOptions', 0) as string[];
    const isQuiz = this.getNodeParameter('isQuiz', 0) as boolean;
    const isAnonymous = this.getNodeParameter('anonymous', 0, true) as boolean;

    let correctAnswers: Buffer[] | undefined = undefined;
    if (isQuiz) {
        const correctIndex = this.getNodeParameter('correctAnswerIndex', 0) as number;
        correctAnswers = [Buffer.from(correctIndex.toString())];
    }

    const peer = await client.getEntity(chatId);
    const isBroadcastChannel = peer.className === 'Channel' && peer.broadcast;
    const publicVoters = isBroadcastChannel ? false : !isAnonymous;
    const pollId = bigInt(Math.floor(Math.random() * 1000000000));

    await safeExecute(() => 
        client.invoke(new Api.messages.SendMedia({
            peer: peer,
            media: new Api.InputMediaPoll({
                poll: new Api.Poll({
                    id: pollId,
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
            randomId: bigInt(Math.floor(Math.random() * 1000000000)), 
        }))
    );

    return [[{ json: { success: true, pollId: pollId.toString() } }]];
}

async function copyMessage(this: IExecuteFunctions, client: any) {
    const fromChat = this.getNodeParameter('fromChatId', 0);
    const toChat = this.getNodeParameter('toChatId', 0);
    const messageId = Number(this.getNodeParameter('messageId', 0));
    const caption = this.getNodeParameter('caption', 0, '') as string;
    const disableLinkPreview = this.getNodeParameter('disableLinkPreview', 0, false) as boolean;

    const fromPeer = await client.getEntity(fromChat);
    const toPeer = await client.getEntity(toChat);

    const messages = await safeExecute(() => client.getMessages(fromPeer, { ids: [messageId] }));

    const originalMessage = messages[0];
    if (!originalMessage) throw new Error('Original message not found');

    let messageContent = originalMessage.message || '';
    if (caption && caption.trim()) messageContent = caption;

    const result = await withRateLimit(async () =>
        safeExecute(() =>
            client.sendMessage(toPeer, {
                message: messageContent,
                file: originalMessage.media,
                linkPreview: !disableLinkPreview,
                formattingEntities: originalMessage.entities || [],
            })
        )
    );

    let senderId: string | null = null;
    if (result.fromId) {
        senderId = result.fromId.userId?.toString() || 
                   result.fromId.chatId?.toString() || 
                   result.fromId.channelId?.toString() ||
                   result.fromId.user_id?.toString() ||
                   result.fromId.chat_id?.toString() ||
                   result.fromId.channel_id?.toString();
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

    return [[{
        json: {
            success: true,
            message: 'Message copied successfully',
            copiedId: result.id,
            originalId: originalMessage.id,
            text: result.message,
            chatId: result.chatId?.toString(),
            fromId: senderId,
            date: result.date,
            hasMedia: !!originalMessage.media,
            caption: caption || messageContent,
        },
    }]];
}