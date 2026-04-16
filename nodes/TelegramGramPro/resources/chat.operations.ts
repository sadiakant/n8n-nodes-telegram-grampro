import { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import { getClient } from '../core/clientManager';
import { safeExecute } from '../core/floodWaitHandler';
import { Api } from 'telegram';
import bigInt from 'big-integer';
import type { Dialog } from 'telegram/tl/custom/dialog';

import { cache, CacheKeys } from '../core/cache';
import type { TelegramClientInstance, TelegramCredentials } from '../core/types';

type SupportedDialogFilter = Api.DialogFilter | Api.DialogFilterChatlist;

function getEntityTitle(entity: unknown): string {
	if (entity instanceof Api.Chat || entity instanceof Api.Channel) {
		return entity.title ?? '';
	}

	if (entity instanceof Api.User) {
		return [entity.firstName, entity.lastName].filter(Boolean).join(' ') || entity.username || '';
	}

	return '';
}

function getEntityUsername(entity: unknown): string | null {
	if (entity instanceof Api.User || entity instanceof Api.Channel) {
		return entity.username ?? null;
	}

	return null;
}

function getEntityId(entity: unknown): string {
	if (
		entity instanceof Api.User ||
		entity instanceof Api.UserEmpty ||
		entity instanceof Api.Chat ||
		entity instanceof Api.ChatEmpty ||
		entity instanceof Api.ChatForbidden ||
		entity instanceof Api.Channel ||
		entity instanceof Api.ChannelForbidden
	) {
		return entity.id.toString();
	}

	return '';
}

function getEntityAudience(entity: unknown): number | null {
	if (entity instanceof Api.Chat) {
		return entity.participantsCount ?? null;
	}

	if (entity instanceof Api.Channel) {
		return entity.participantsCount ?? null;
	}

	return null;
}

function getEntityCreateDate(entity: unknown): string | null {
	if (
		(entity instanceof Api.Chat || entity instanceof Api.Channel) &&
		typeof entity.date === 'number'
	) {
		return formatDate(new Date(entity.date * 1000));
	}

	return null;
}

function getDialogAccountType(entity: unknown): string {
	if (entity instanceof Api.User) {
		return entity.bot ? 'bot' : 'user';
	}

	if (entity instanceof Api.Channel) {
		if (entity.broadcast) {
			return 'channel';
		}

		if (entity.megagroup) {
			return 'group';
		}
	}

	if (entity instanceof Api.Chat) {
		return 'group';
	}

	return 'user';
}

function isSupportedDialogFilter(filter: Api.TypeDialogFilter): filter is SupportedDialogFilter {
	return filter instanceof Api.DialogFilter || filter instanceof Api.DialogFilterChatlist;
}

function getDialogFilterTitle(filter: SupportedDialogFilter): string {
	if (filter.title instanceof Api.TextWithEntities) {
		return filter.title.text;
	}

	return `Folder ${filter.id}`;
}

function matchPeer(peer: Api.TypeInputPeer, chatId: string): boolean {
	const candidate = peer as unknown as {
		userId?: { toString: () => string } | string | number | bigint;
		chatId?: { toString: () => string } | string | number | bigint;
		channelId?: { toString: () => string } | string | number | bigint;
	};
	const peerId = candidate.userId ?? candidate.chatId ?? candidate.channelId;
	return peerId?.toString() === chatId;
}

function getCreatedChat(result: Api.TypeUpdates): Api.Chat | Api.Channel {
	const chats =
		result instanceof Api.Updates || result instanceof Api.UpdatesCombined ? result.chats : [];
	const chat = chats.find(
		(candidate): candidate is Api.Chat | Api.Channel =>
			candidate instanceof Api.Chat || candidate instanceof Api.Channel,
	);

	if (!chat) {
		throw new Error('Telegram did not return the created chat or channel.');
	}

	return chat;
}

function getInviteLink(invite: Api.TypeExportedChatInvite): string | null {
	return invite instanceof Api.ChatInviteExported ? invite.link : null;
}

export async function chatRouter(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const creds = (await this.getCredentials('telegramGramProApi')) as TelegramCredentials;

	const client = await getClient(creds.apiId, creds.apiHash, creds.session);

	switch (operation) {
		case 'getDialogs':
			return getDialogs.call(this, client, i);
		case 'getChat':
			return getChat.call(this, client, i);
		case 'joinChat':
			return joinChat.call(this, client, i);
		case 'leaveChat':
			return leaveChat.call(this, client, i);
		case 'createChat':
			return createChat.call(this, client, i);
		case 'createChannel':
			return createChannel.call(this, client, i);

		default:
			throw new Error(`Chat operation not supported: ${operation}`);
	}
}

// ----------------------

async function getChat(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const chatId = this.getNodeParameter('chatId', i) as string;

	const cacheKey = CacheKeys.getChat(chatId);
	const cachedChat = cache.get(cacheKey);
	if (cachedChat) {
		return [
			{
				json: cachedChat as IDataObject,
				pairedItem: { item: i },
			},
		];
	}

	const chat = await client.getEntity(chatId);

	const json: IDataObject = {
		id: getEntityId(chat),
		title: getEntityTitle(chat),
		username: getEntityUsername(chat),
	};

	cache.set(cacheKey, json);

	return [
		{
			json,
			pairedItem: { item: i },
		},
	];
}

// ----------------------
async function getDialogs(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const rawLimit = this.getNodeParameter('limit', i, null) as number | null;
	const targetLimit =
		typeof rawLimit === 'number' && !isNaN(rawLimit) && rawLimit > 0 ? rawLimit : Infinity;
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
	let filters: SupportedDialogFilter[] = [];
	if (groupByFolders) {
		try {
			const res = await client.invoke(new Api.messages.GetDialogFilters());
			filters =
				res instanceof Api.messages.DialogFilters
					? res.filters.filter(isSupportedDialogFilter)
					: [];
		} catch {
			filters = [];
		}
	}

	const items: INodeExecutionData[] = [];
	const allChats: IDataObject[] = [];
	let count = 0;

	const dialogs = (await client.getDialogs({
		limit: targetLimit === Infinity ? undefined : targetLimit,
	})) as Dialog[];

	for (const dialog of dialogs) {
		if (targetLimit !== Infinity && count >= targetLimit) break;

		const entity = dialog.entity;
		const id = entity ? getEntityId(entity) : (dialog.id?.toString() ?? '');
		const title = entity ? getEntityTitle(entity) : (dialog.title ?? dialog.name ?? '');
		const username = entity ? getEntityUsername(entity) : null;
		const accountType = entity ? getDialogAccountType(entity) : 'user';
		const visibility = username ? 'Public' : 'Private';
		const audience = entity ? getEntityAudience(entity) : null;
		const createDate = entity ? getEntityCreateDate(entity) : null;
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
		for (const filter of filters) {
			const folderName = getDialogFilterTitle(filter);
			const includePeers = filter.includePeers;
			const excludePeers = filter instanceof Api.DialogFilter ? filter.excludePeers : [];

			// Normalize folder name to a safe key for n8n expressions (alphanumeric only)
			const safeKey =
				folderName
					.replace(/[^a-z0-9]/gi, '_')
					.replace(/_+/g, '_')
					.replace(/^_+|_+$/g, '') || `folder_${filter.id}`;

			const folderChats: IDataObject[] = [];

			// A folder includes peers explicitly or by type flags
			for (const chat of allChats) {
				let included = false;
				const chatIdStr = chat.id as string;

				// 1. Check explicit inclusions
				if (includePeers.length > 0) {
					for (const peer of includePeers) {
						if (matchPeer(peer, chatIdStr)) {
							included = true;
							break;
						}
					}
				}

				// 2. Check type flags if not explicitly included
				if (!included && filter instanceof Api.DialogFilter) {
					const accType = chat.account_type as string;
					if (filter.contacts && accType === 'user') included = true;
					if (filter.nonContacts && accType === 'user') included = true;
					if (filter.groups && accType === 'group') included = true;
					if (filter.broadcasts && accType === 'channel') included = true;
					if (filter.bots && accType === 'bot') included = true;
				}

				// 3. Check explicit exclusions
				if (included && excludePeers.length > 0) {
					for (const peer of excludePeers) {
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
		const otherChats = allChats.filter((chat) => !assignedChatIds.has(chat.id as string));
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
			return allChats.map((chat) => ({ json: chat, pairedItem: { item: i } }));
		}

		return groupedResults;
	}

	if (useCache) {
		cache.set(
			cacheKey,
			items.map(({ json }) => json as IDataObject),
		);
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

	const parts = istString.split(',').map((s) => s.trim());
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
	return `${datePart} (${time} ${ampm})`;
}

function normalizeIdForGroup(rawId: string): string {
	// Remove leading -100 or - signs used in supergroup IDs when calling AddChatUser
	let idStr = rawId.trim();
	if (idStr.startsWith('-100')) idStr = idStr.substring(4);
	else if (idStr.startsWith('-')) idStr = idStr.substring(1);
	return idStr;
}

async function joinChat(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const chatId = this.getNodeParameter('chatId', i) as string;

	const result: unknown = await safeExecute(async () => {
		if (chatId.includes('t.me/+') || chatId.includes('joinchat/')) {
			// Extract the hash from the link
			const hash = chatId.split('/').pop()?.replace('+', '');
			return await client.invoke(new Api.messages.ImportChatInvite({ hash }));
		}

		// Try basic group join via AddChatUser (for legacy/basic groups)
		try {
			const numericId = normalizeIdForGroup(chatId);
			return await client.invoke(
				new Api.messages.AddChatUser({
					chatId: bigInt(numericId),
					userId: 'me',
					fwdLimit: 0,
				}),
			);
		} catch {
			// Fallback to channel/supergroup join
			return await client.invoke(new Api.channels.JoinChannel({ channel: chatId }));
		}
	});

	return [
		{
			json: { success: true, result: result as unknown } as IDataObject,
			pairedItem: { item: i },
		},
	];
}

async function leaveChat(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const chatId = this.getNodeParameter('chatId', i) as string;

	const result: unknown = await safeExecute(async () => {
		try {
			return await client.invoke(new Api.channels.LeaveChannel({ channel: chatId }));
		} catch {
			// Try basic group leave
			const numericId = normalizeIdForGroup(chatId);
			return await client.invoke(
				new Api.messages.DeleteChatUser({
					chatId: bigInt(numericId),
					userId: 'me',
				}),
			);
		}
	});

	return [
		{
			json: { success: true, result: result as unknown } as IDataObject,
			pairedItem: { item: i },
		},
	];
}
async function createChat(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const title = this.getNodeParameter('chatTitle', i) as string;
	const about = this.getNodeParameter('chatAbout', i) as string;

	// This creates a Supergroup (Megagroup)
	const result = (await safeExecute(() =>
		client.invoke(
			new Api.channels.CreateChannel({
				title: title,
				about: about,
				megagroup: true, // This makes it a Group/Supergroup
				broadcast: false,
			}),
		),
	)) as Api.TypeUpdates;

	const chat = getCreatedChat(result);

	// Try to generate invite link
	let inviteLink: string | null = null;
	try {
		const peer = await client.getEntity(chat.id);
		const invite = await client.invoke(new Api.messages.ExportChatInvite({ peer }));
		inviteLink = getInviteLink(invite);
	} catch {
		/* ignore invite link errors */
	}

	const createdAt = chat.date ? new Date(chat.date * 1000) : null;
	const formattedDate = createdAt ? formatDateWithTime(createdAt) : null;
	const isPublic = chat instanceof Api.Channel ? !!chat.username : false;

	return [
		{
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
		},
	];
}

async function createChannel(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const title = this.getNodeParameter('chatTitle', i) as string;
	const about = this.getNodeParameter('chatAbout', i) as string;

	// This creates a Broadcast Channel
	const result = (await safeExecute(() =>
		client.invoke(
			new Api.channels.CreateChannel({
				title: title,
				about: about,
				megagroup: false,
				broadcast: true, // This makes it a Channel
			}),
		),
	)) as Api.TypeUpdates;

	const chat = getCreatedChat(result);

	// Try to generate invite link
	let inviteLink: string | null = null;
	try {
		const peer = await client.getEntity(chat.id);
		const invite = await client.invoke(new Api.messages.ExportChatInvite({ peer }));
		inviteLink = getInviteLink(invite);
	} catch {
		/* ignore invite link errors */
	}

	const createdAt = chat.date ? new Date(chat.date * 1000) : null;
	const formattedDate = createdAt ? formatDateWithTime(createdAt) : null;
	const isPublic = chat instanceof Api.Channel ? !!chat.username : false;

	return [
		{
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
		},
	];
}

// Helpers
function pad(num: number): string {
	return num < 10 ? `0${num}` : `${num}`;
}

function formatDateWithTime(date: Date): string {
	const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
	const months = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec',
	];
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
	return `${datePart} (${timePart})`;
}
