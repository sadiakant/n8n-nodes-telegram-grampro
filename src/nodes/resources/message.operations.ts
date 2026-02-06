import { IExecuteFunctions } from 'n8n-workflow';
import { getClient } from '../../core/clientManager';
import { safeExecute } from '../../core/floodWaitHandler';
import { withRateLimit } from '../../core/rateLimiter';
import { Api } from 'telegram';
import bigInt from 'big-integer';
import { 
  TelegramMessage, 
  SendMessageOptions, 
  EditMessageOptions, 
  DeleteMessageOptions, 
  PinMessageOptions,
  CreatePollOptions,
  EditMessageMediaOptions
} from '../../types/telegram';

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
    
    // IMPORTANT: Ensure this parameter exists in the UI properties
    const noWebpage = this.getNodeParameter('noWebpage', 0) as boolean;

    // Use safeExecute once and pass all parameters
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

    // --- LOGIC: If Caption is Empty, Preserve Original ---
    if (!captionInput || captionInput.trim() === '') {
        try {
            // We use getMessages. If this returns empty, it means the Message ID 
            // does not exist in the Chat ID provided in the n8n node.
            const messages = await client.getMessages(chatId, { ids: [messageId] });
            
            if (messages && messages.length > 0 && messages[0]) {
                const msg = messages[0];
                finalCaption = msg.message || "";
                finalEntities = msg.entities || [];
                debugInfo = "Successfully preserved original text";
            } else {
                // This is the error you are seeing
                debugInfo = `Error: Message ${messageId} not found in chat ${chatId}. Check your 'Chat ID' field!`;
            }
        } catch (error) {
            debugInfo = `Fetch error: ${error.message}`;
        }
    }

    // --- EXECUTION ---
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
    const revoke = this.getNodeParameter('revoke', 0) as boolean; // Get toggle value

    await safeExecute(() => 
        client.deleteMessages(chatId, [messageId], { revoke })
    );

    return [[{ json: { success: true, deletedId: messageId, revoked: revoke } }]];
}

async function pinMessage(this: IExecuteFunctions, client: any) {
    const chatId = this.getNodeParameter('chatId', 0);
    const messageId = Number(this.getNodeParameter('messageId', 0));
    const notify = this.getNodeParameter('notify', 0) as boolean; // Get toggle value

    await safeExecute(() => 
        client.pinMessage(chatId, messageId, { notify })
    );

    return [[{ json: { success: true, pinnedId: messageId, notified: notify } }]];
}

async function sendText(this: IExecuteFunctions, client: any) {
    const chatId = this.getNodeParameter('chatId', 0);
    const text = this.getNodeParameter('text', 0);
    
    // 1. Get the parameter (defaults to 0 if not provided)
    const replyTo = this.getNodeParameter('replyTo', 0) as number;

    const result = await withRateLimit(async () =>
        safeExecute(() =>
            client.sendMessage(chatId, { 
                message: text,
                // 2. Only add replyTo if a valid ID is provided
                replyTo: replyTo > 0 ? replyTo : undefined,
            })
        )
    );

    // Extract sender ID with comprehensive fallback for different message types
    let senderId: string | null = null;
    
    if (result.fromId) {
        // Try different possible properties for sender ID
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

    // Ensure IDs are resolved to entities
    const fromPeer = await client.getEntity(fromChat);
    const toPeer = await client.getEntity(toChat);

    // FIXED: Changed 'id' to 'messages'
    const result = await client.forwardMessages(toPeer, {
        fromPeer: fromPeer,
        messages: [messageId], 
    });

    // Handle array or single object response
    const msg = Array.isArray(result) ? result[0] : result;

    // Extract sender ID with comprehensive fallback for different message types
    let senderId: string | null = null;
    
    if (msg.fromId) {
        // Try different possible properties for sender ID
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

	const chatId = this.getNodeParameter('chatId', 0);
	const mode = this.getNodeParameter('mode', 0, 'limit') as string;
	const onlyMedia = this.getNodeParameter('onlyMedia', 0, false) as boolean;
	const mediaTypes = this.getNodeParameter('mediaType', 0, []) as string[];

	let messages: any[] = [];

	if (mode === 'limit') {
		const limit = this.getNodeParameter('limit', 0, 10) as number;
		messages = await safeExecute(() =>
			client.getMessages(chatId, { limit }),
		);
	} else {
		const maxMessages = this.getNodeParameter('maxMessages', 0, 500) as number;
		const iterOptions: Record<string, any> = {};
		if (maxMessages > 0) {
			iterOptions.limit = maxMessages;
		}

		if (mode === 'hours') {
			const hours = this.getNodeParameter('hours', 0, 24) as number;
			const cutoffTime = Math.floor(Date.now() / 1000) - (hours * 3600);

			for await (const msg of client.iterMessages(chatId, iterOptions)) {
				if (msg.date < cutoffTime) {
					break;
				}
				messages.push(msg);
			}
		} else if (mode === 'range') {
			const fromDateStr = this.getNodeParameter('fromDate', 0, '') as string;
			const toDateStr = this.getNodeParameter('toDate', 0, '') as string;

			const fromTime = fromDateStr ? Math.floor(new Date(fromDateStr).getTime() / 1000) : 0;
			const toTime = toDateStr ? Math.floor(new Date(toDateStr).getTime() / 1000) : Math.floor(Date.now() / 1000);

			for await (const msg of client.iterMessages(chatId, iterOptions)) {
				if (msg.date > toTime) {
					continue;
				}
				if (msg.date < fromTime) {
					break;
				}
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

		if (onlyMedia && !hasMedia) {
			continue;
		}

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
				text: m.message || '',
				date: m.date,
				humanDate: new Date(m.date * 1000).toISOString(),
				fromId: m.fromId?.userId?.toString() || m.fromId?.toString() || null,
				chatId: m.peerId?.userId?.toString() ||
					m.peerId?.chatId?.toString() ||
					m.peerId?.channelId?.toString() ||
					m.peerId?.toString() || null,
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

    // 1. Get the correct answer index if it's a quiz
    let correctAnswers: Buffer[] | undefined = undefined;
    if (isQuiz) {
        const correctIndex = this.getNodeParameter('correctAnswerIndex', 0) as number;
        // The index must correspond to the 'option' buffer we create below
        correctAnswers = [Buffer.from(correctIndex.toString())];
    }

    const peer = await client.getEntity(chatId);
    const isBroadcastChannel = peer.className === 'Channel' && peer.broadcast;
    const publicVoters = isBroadcastChannel ? false : !isAnonymous;
    const pollId = bigInt(Math.floor(Math.random() * 1000000000));

    const result = await safeExecute(() => 
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
                // 2. CRITICAL: Pass the correct answers here (outside the Poll object)
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

    // Ensure IDs are resolved to entities
    const fromPeer = await client.getEntity(fromChat);
    const toPeer = await client.getEntity(toChat);

    // Get the original message to copy its content
    const messages = await safeExecute(() =>
        client.getMessages(fromPeer, { ids: [messageId] })
    );

    const originalMessage = messages[0];
    if (!originalMessage) {
        throw new Error('Original message not found');
    }

    // Prepare the message content for copying
    let messageContent = originalMessage.message || '';
    
    // If caption is provided, use it instead of original message
    if (caption && caption.trim()) {
        messageContent = caption;
    }

    // Copy the message with media if present
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

    // Extract sender ID with comprehensive fallback for different message types
    let senderId: string | null = null;
    
    if (result.fromId) {
        // Try different possible properties for sender ID
        senderId = result.fromId.userId?.toString() || 
                   result.fromId.chatId?.toString() || 
                   result.fromId.channelId?.toString() ||
                   result.fromId.user_id?.toString() ||
                   result.fromId.chat_id?.toString() ||
                   result.fromId.channel_id?.toString();
    }
    
    // If still null, try to get sender from the original message
    if (!senderId && originalMessage.fromId) {
        senderId = originalMessage.fromId.userId?.toString() || 
                   originalMessage.fromId.chatId?.toString() || 
                   originalMessage.fromId.channelId?.toString() ||
                   originalMessage.fromId.user_id?.toString() ||
                   originalMessage.fromId.chat_id?.toString() ||
                   originalMessage.fromId.channel_id?.toString();
    }
    
    // For bot messages, try to get the bot's user ID from the message itself
    if (!senderId && originalMessage.post_author) {
        // Some bot messages have post_author field
        senderId = originalMessage.post_author;
    }
    
    // Final fallback: try to get from peer_id
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
