import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { getClient } from '../core/clientManager';
import { safeExecute } from '../core/floodWaitHandler';
import { withRateLimit } from '../core/rateLimiter';
import { Api } from 'teleproto';
import bigInt from 'big-integer';
import { LogLevel } from 'teleproto/extensions/Logger';
import type { TelegramClientInstance, TelegramCredentials } from '../core/types';

type ChannelEntity = Api.Chat | Api.Channel;

type NormalizedParticipant = {
	userId: string;
	isAdmin: boolean;
	isCreator: boolean;
	adminRights?: Api.TypeChatAdminRights;
};

function isChannelEntity(entity: unknown): entity is ChannelEntity {
	return entity instanceof Api.Chat || entity instanceof Api.Channel;
}

function indexUsersById(usersById: Map<string, Api.User>, users: Api.TypeUser[]): void {
	for (const user of users) {
		if (user instanceof Api.User) {
			usersById.set(user.id.toString(), user);
		}
	}
}

function getPeerUserId(peer: Api.TypePeer): string | undefined {
	if (peer instanceof Api.PeerUser) {
		return peer.userId.toString();
	}

	const candidate = peer as unknown as { userId?: { toString: () => string } };
	return candidate.userId?.toString();
}

function normalizeChatParticipant(
	participant: Api.TypeChatParticipant,
): NormalizedParticipant | null {
	if (participant instanceof Api.ChatParticipantCreator) {
		return {
			userId: participant.userId.toString(),
			isAdmin: true,
			isCreator: true,
		};
	}

	if (participant instanceof Api.ChatParticipantAdmin) {
		return {
			userId: participant.userId.toString(),
			isAdmin: true,
			isCreator: false,
		};
	}

	if (participant instanceof Api.ChatParticipant) {
		return {
			userId: participant.userId.toString(),
			isAdmin: false,
			isCreator: false,
		};
	}

	return null;
}

function normalizeChannelParticipant(
	participant: Api.TypeChannelParticipant,
): NormalizedParticipant | null {
	if (participant instanceof Api.ChannelParticipantCreator) {
		return {
			userId: participant.userId.toString(),
			isAdmin: true,
			isCreator: true,
			adminRights: participant.adminRights,
		};
	}

	if (participant instanceof Api.ChannelParticipantAdmin) {
		return {
			userId: participant.userId.toString(),
			isAdmin: true,
			isCreator: false,
			adminRights: participant.adminRights,
		};
	}

	if (
		participant instanceof Api.ChannelParticipant ||
		participant instanceof Api.ChannelParticipantSelf
	) {
		return {
			userId: participant.userId.toString(),
			isAdmin: false,
			isCreator: false,
		};
	}

	if (
		participant instanceof Api.ChannelParticipantBanned ||
		participant instanceof Api.ChannelParticipantLeft
	) {
		const userId = getPeerUserId(participant.peer);
		if (!userId) {
			return null;
		}

		return {
			userId,
			isAdmin: false,
			isCreator: false,
		};
	}

	return null;
}

function getEntityTypeName(entity: unknown): string {
	if (!entity || typeof entity !== 'object') {
		return 'unknown';
	}

	const maybeClassName = (entity as { className?: unknown }).className;
	return typeof maybeClassName === 'string' ? maybeClassName : 'unknown';
}

export async function channelRouter(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const creds = (await this.getCredentials('telegramGramProApi')) as TelegramCredentials;

	const client = await getClient(creds.apiId, creds.apiHash, creds.session);

	switch (operation) {
		case 'getMembers':
			return getChannelParticipants.call(this, client, i);

		case 'addMember':
			return addChannelMember.call(this, client, i);

		case 'removeMember':
			return removeChannelMember.call(this, client, i);

		case 'banUser':
			return banUser.call(this, client, i);

		case 'unbanUser':
			return unbanUser.call(this, client, i);

		case 'promoteUser':
			return promoteUser.call(this, client, i);

		default:
			throw new Error(`Channel operation not supported: ${operation}`);
	}
}

// ----------------

async function getChannelParticipants(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const channelId = this.getNodeParameter('channelId', i);
	const rawLimit = this.getNodeParameter('limit', i, null) as number | null;
	// When left empty in n8n, rawLimit may be null; treat null/undefined/NaN as "all"
	const limit = typeof rawLimit === 'number' && !isNaN(rawLimit) ? rawLimit : Infinity;
	const normalizedLimit = limit > 0 ? limit : Infinity;
	const filterAdmins = this.getNodeParameter('filterAdmins', i, false) as boolean;
	const filterBots = this.getNodeParameter('filterBots', i, false) as boolean;
	const onlyOnline = this.getNodeParameter('onlyOnline', i, false) as boolean;
	const excludeAdmins = this.getNodeParameter('excludeAdmins', i, false) as boolean;
	const excludeBots = this.getNodeParameter('excludeBots', i, false) as boolean;
	const excludeDeletedAndLongAgo = this.getNodeParameter(
		'excludeDeletedAndLongAgo',
		i,
		false,
	) as boolean;
	const hasIncludeToggles = filterAdmins || filterBots || onlyOnline;
	const hasExcludeToggles = excludeAdmins || excludeBots || excludeDeletedAndLongAgo;
	const hasAnyToggle = hasIncludeToggles || hasExcludeToggles;

	const channel = await resolveChannelEntity(client, channelId);

	let allParticipants: NormalizedParticipant[] = [];
	const usersById = new Map<string, Api.User>();
	const fetchAllBeforeFiltering = hasAnyToggle || normalizedLimit === Infinity;

	if (channel instanceof Api.Chat) {
		// Basic Group
		const result = (await withRateLimit(async () =>
			safeExecute(() =>
				client.invoke(
					new Api.messages.GetFullChat({
						chatId: channel.id,
					}),
				),
			),
		)) as Api.messages.ChatFull;

		indexUsersById(usersById, result.users);

		const chatParticipants =
			result.fullChat instanceof Api.ChatFull &&
			result.fullChat.participants instanceof Api.ChatParticipants
				? result.fullChat.participants.participants
				: [];

		// Map normal chat participant structure to look somewhat like channel participants
		allParticipants = chatParticipants
			.map((participant) => normalizeChatParticipant(participant))
			.filter((participant): participant is NormalizedParticipant => participant !== null);
	} else {
		// Channels and Supergroups (className === 'Channel')
		// Always fetch broad participant pages when any toggle is active, then apply node filters in-memory.
		// This guarantees toggle combinations are evaluated from the full fetched member set.
		const apiFilter: Api.TypeChannelParticipantsFilter = fetchAllBeforeFiltering
			? new Api.ChannelParticipantsSearch({ q: '' })
			: new Api.ChannelParticipantsRecent();

		// Telegram API caps to ~200 per call; loop until we reach requested limit or exhaust
		let offset = 0;
		let remaining = fetchAllBeforeFiltering ? Infinity : normalizedLimit;

		while (true) {
			const batchSize = remaining === Infinity ? 200 : Math.min(remaining, 200);

			const result = (await withRateLimit(async () =>
				safeExecute(() =>
					client.invoke(
						new Api.channels.GetParticipants({
							channel,
							filter: apiFilter,
							offset,
							limit: batchSize,
							hash: bigInt.zero,
						}),
					),
				),
			)) as Api.channels.TypeChannelParticipants;

			if (!(result instanceof Api.channels.ChannelParticipants)) {
				break;
			}

			indexUsersById(usersById, result.users);

			const participantsBatch = result.participants
				.map((participant) => normalizeChannelParticipant(participant))
				.filter((participant): participant is NormalizedParticipant => participant !== null);
			allParticipants.push(...participantsBatch);

			// Update counters
			offset += participantsBatch.length;
			if (remaining !== Infinity) remaining -= participantsBatch.length;

			// Stop if less than requested returned or we've hit the user-requested limit
			if (participantsBatch.length < batchSize) break;
			if (remaining !== Infinity && remaining <= 0) break;
		}
	}

	let participants: NormalizedParticipant[] = allParticipants;
	const matchedByUserId = new Map<string, string[]>();

	if (hasIncludeToggles) {
		const nowSec = Math.floor(Date.now() / 1000);
		participants = participants.filter((participant) => {
			const user = usersById.get(participant.userId);
			const reasons: string[] = [];
			if (filterAdmins && isParticipantAdmin(participant)) reasons.push('admin');
			if (filterBots && user?.bot === true) reasons.push('bot');
			if (onlyOnline && isOnlineOrRecentlyActive(user?.status, nowSec))
				reasons.push('onlineOrRecent');

			// Include toggles are additive (OR): unknown enabled include condition can keep the member.
			const userId = participant.userId;
			if (reasons.length > 0 && userId) {
				matchedByUserId.set(userId, reasons);
			}
			return reasons.length > 0;
		});
	} else {
		for (const participant of participants) {
			const userId = participant.userId;
			if (userId) matchedByUserId.set(userId, ['allMembers']);
		}
	}

	if (excludeAdmins) {
		participants = participants.filter((participant) => !isParticipantAdmin(participant));
	}

	if (excludeBots) {
		participants = participants.filter((participant) => {
			const user = usersById.get(participant.userId);
			return user?.bot !== true;
		});
	}

	if (excludeDeletedAndLongAgo) {
		participants = participants.filter((participant) => {
			const user = usersById.get(participant.userId);
			if (!user) return false;
			return !isDeletedOrLongAgo(user);
		});
	}

	// Apply user limit after all toggles to keep toggle outputs accurate.
	if (normalizedLimit !== Infinity) {
		participants = participants.slice(0, normalizedLimit);
	}

	const items = participants.map((participant) => {
		const user = usersById.get(participant.userId);
		const userId = participant.userId;
		return {
			json: {
				id: user?.id?.toString(),
				username: user?.username || null,
				firstName: user?.firstName || '',
				lastName: user?.lastName || '',
				bot: user?.bot || false,
				isAdmin: isParticipantAdmin(participant),
				isCreator: isParticipantCreator(participant),
				status: getStatusType(user?.status) || 'Unknown',
				phone: user?.phone || null,
				matchedBy: userId ? matchedByUserId.get(userId) || [] : [],
			},
			pairedItem: { item: i },
		};
	});

	return items;
}

function getStatusType(status: Api.TypeUserStatus | undefined): string | undefined {
	if (!status) return undefined;
	return getEntityTypeName(status);
}

function isOnlineOrRecentlyActive(status: Api.TypeUserStatus | undefined, nowSec: number): boolean {
	const statusType = getStatusType(status);
	if (!statusType) return false;

	if (statusType === 'UserStatusOnline' || statusType === 'Online') return true;
	if (statusType === 'UserStatusRecently' || statusType === 'Recently') return true;

	const expiresRaw = status instanceof Api.UserStatusOnline ? status.expires : undefined;
	const expires =
		typeof expiresRaw === 'bigint'
			? Number(expiresRaw)
			: typeof expiresRaw === 'number'
				? expiresRaw
				: undefined;

	return typeof expires === 'number' && expires > nowSec;
}

function isParticipantCreator(participant: NormalizedParticipant): boolean {
	return participant.isCreator;
}

function isParticipantAdmin(participant: NormalizedParticipant): boolean {
	return (
		participant.isAdmin || participant.adminRights != null || isParticipantCreator(participant)
	);
}

function isDeletedOrLongAgo(user: Api.User): boolean {
	if (user.deleted === true) return true;
	const statusType = getStatusType(user.status);
	return statusType === 'UserStatusLongAgo' || statusType === 'LongAgo';
}

async function addChannelMember(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const channelId = this.getNodeParameter('channelId', i) as string;
	const userIdToAdd = this.getNodeParameter('userIdToAdd', i) as string;

	// Get the channel and user entities
	const channel = await resolveChannelEntity(client, channelId);
	const user = await client.getEntity(userIdToAdd);

	try {
		// Add user to channel/group
		await withRateLimit(async () =>
			safeExecute(() =>
				client.invoke(
					new Api.channels.InviteToChannel({
						channel: channel,
						users: [user],
					}),
				),
			),
		);

		return [
			{
				json: {
					success: true,
					message: `Successfully added user ${userIdToAdd} to channel ${channelId}`,
					userId: user.id?.toString(),
					channelId: channel.id?.toString(),
				},
				pairedItem: { item: i },
			},
		];
	} catch (error) {
		return [
			{
				json: {
					success: false,
					error: error instanceof Error ? error.message : String(error),
					message: `Failed to add user ${userIdToAdd} to channel ${channelId}`,
				},
				pairedItem: { item: i },
			},
		];
	}
}

// Robust channel resolver to handle numeric IDs without access hash and username links
async function resolveChannelEntity(
	client: TelegramClientInstance,
	rawId: unknown,
): Promise<ChannelEntity> {
	const attempts: string[] = [];
	const asString = typeof rawId === 'string' ? rawId.trim() : String(rawId);

	// Instead of throwing positive digits at GramJS (which forces User resolution),
	// intelligently format the prefixes to minimize guess-errors logged in the terminal.
	if (/^\d+$/.test(asString) && !asString.startsWith('-')) {
		// Pure positive numbers. Telegram groups/channels are negative.
		// Try Supergroup/Channel first (-100), then Basic Group (-).
		attempts.push(`-100${asString}`);
		attempts.push(`-${asString}`);
	} else if (asString.startsWith('-100')) {
		// Starts with -100. It's properly formatted for Supergroup/Channel.
		// If it fails, maybe it's actually a standard group? Try replacing -100 with just -.
		attempts.push(asString);
		attempts.push(asString.replace('-100', '-'));
	} else if (asString.startsWith('-')) {
		// Starts with - (but not -100). Properly formatted for Basic Group.
		// If it fails, maybe it's a Supergroup and they missed the 100?
		attempts.push(asString);
		attempts.push(asString.replace('-', '-100'));
	} else {
		// Likely a screen name (@username)
		attempts.push(asString);
	}

	let lastError: unknown = null;

	try {
		// Temporarily silence RPC errors during trial-and-error resolution
		client.setLogLevel(LogLevel.NONE);

		for (const candidate of attempts) {
			try {
				const entity = await client.getEntity(candidate);
				if (isChannelEntity(entity)) {
					return entity;
				}
				lastError = new Error(
					`Resolved entity for ${candidate} is a ${getEntityTypeName(entity)}, but expected a Channel or Chat`,
				);
			} catch (err) {
				lastError = err;
			}
		}
	} finally {
		client.setLogLevel(LogLevel.ERROR);
	}

	throw lastError || new Error('Failed to resolve channel entity');
}

async function removeChannelMember(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const channelId = this.getNodeParameter('channelId', i) as string;
	const userIdToRemove = this.getNodeParameter('userIdToRemove', i) as string;

	// Get the channel and user entities
	const channel = await resolveChannelEntity(client, channelId);
	const user = await client.getEntity(userIdToRemove);

	try {
		// Remove user from channel/group (kick them)
		await withRateLimit(async () =>
			safeExecute(() =>
				client.invoke(
					new Api.channels.EditBanned({
						channel: channel,
						participant: user,
						bannedRights: new Api.ChatBannedRights({
							viewMessages: true,
							sendMessages: true,
							sendMedia: true,
							sendStickers: true,
							sendGifs: true,
							sendGames: true,
							sendInline: true,
							embedLinks: true,
							sendPolls: true,
							changeInfo: true,
							inviteUsers: true,
							pinMessages: true,
							untilDate: 0,
						}),
					}),
				),
			),
		);

		return [
			{
				json: {
					success: true,
					message: `Successfully removed user ${userIdToRemove} from channel ${channelId}`,
					userId: user.id?.toString(),
					channelId: channel.id?.toString(),
				},
				pairedItem: { item: i },
			},
		];
	} catch (error) {
		return [
			{
				json: {
					success: false,
					error: error instanceof Error ? error.message : String(error),
					message: `Failed to remove user ${userIdToRemove} from channel ${channelId}`,
				},
				pairedItem: { item: i },
			},
		];
	}
}

async function banUser(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const channelId = this.getNodeParameter('channelId', i) as string;
	const userIdToBan = this.getNodeParameter('userIdToBan', i) as string;
	const banDuration = this.getNodeParameter('banDuration', i, 1);
	const banReason = this.getNodeParameter('banReason', i, '');

	// Get the channel and user entities
	const channel = await resolveChannelEntity(client, channelId);
	const user = await client.getEntity(userIdToBan);

	try {
		// Calculate ban until date
		const banDurationNum =
			typeof banDuration === 'number' ? banDuration : parseInt(banDuration as string, 10);
		const untilDate =
			banDurationNum === 0 ? 0 : Math.floor(Date.now() / 1000) + banDurationNum * 24 * 60 * 60;

		// Ban user from channel/group
		await withRateLimit(async () =>
			safeExecute(() =>
				client.invoke(
					new Api.channels.EditBanned({
						channel: channel,
						participant: user,
						bannedRights: new Api.ChatBannedRights({
							viewMessages: true,
							sendMessages: true,
							sendMedia: true,
							sendStickers: true,
							sendGifs: true,
							sendGames: true,
							sendInline: true,
							embedLinks: true,
							sendPolls: true,
							changeInfo: true,
							inviteUsers: true,
							pinMessages: true,
							untilDate: untilDate,
						}),
					}),
				),
			),
		);

		return [
			{
				json: {
					success: true,
					message: `Successfully banned user ${userIdToBan} from channel ${channelId} for ${banDuration === 0 ? 'permanent' : banDuration + ' days'}`,
					userId: user.id?.toString(),
					channelId: channel.id?.toString(),
					banDuration: banDuration,
					banReason: banReason || 'No reason provided',
				},
				pairedItem: { item: i },
			},
		];
	} catch (error) {
		return [
			{
				json: {
					success: false,
					error: error instanceof Error ? error.message : String(error),
					message: `Failed to ban user ${userIdToBan} from channel ${channelId}`,
				},
				pairedItem: { item: i },
			},
		];
	}
}

async function unbanUser(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const channelId = this.getNodeParameter('channelId', i) as string;
	const userIdToUnban = this.getNodeParameter('userIdToUnban', i) as string;

	// Get the channel and user entities
	const channel = await resolveChannelEntity(client, channelId);
	const user = await client.getEntity(userIdToUnban);

	try {
		// Unban user from channel/group (remove all restrictions)
		await withRateLimit(async () =>
			safeExecute(() =>
				client.invoke(
					new Api.channels.EditBanned({
						channel: channel,
						participant: user,
						bannedRights: new Api.ChatBannedRights({
							viewMessages: false,
							sendMessages: false,
							sendMedia: false,
							sendStickers: false,
							sendGifs: false,
							sendGames: false,
							sendInline: false,
							embedLinks: false,
							sendPolls: false,
							changeInfo: false,
							inviteUsers: false,
							pinMessages: false,
							untilDate: 0,
						}),
					}),
				),
			),
		);

		return [
			{
				json: {
					success: true,
					message: `Successfully unbanned user ${userIdToUnban} from channel ${channelId}`,
					userId: user.id?.toString(),
					channelId: channel.id?.toString(),
				},
				pairedItem: { item: i },
			},
		];
	} catch (error) {
		return [
			{
				json: {
					success: false,
					error: error instanceof Error ? error.message : String(error),
					message: `Failed to unban user ${userIdToUnban} from channel ${channelId}`,
				},
				pairedItem: { item: i },
			},
		];
	}
}

async function promoteUser(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const channelId = this.getNodeParameter('channelId', i) as string;
	const userIdToPromote = this.getNodeParameter('userIdToPromote', i) as string;
	const adminTitle = String(this.getNodeParameter('adminTitle', i, 'Admin'));

	// Admin permissions
	const canChangeInfo = Boolean(this.getNodeParameter('canChangeInfo', i, false));
	const canPostMessages = Boolean(this.getNodeParameter('canPostMessages', i, false));
	const canEditMessages = Boolean(this.getNodeParameter('canEditMessages', i, false));
	const canDeleteMessages = Boolean(this.getNodeParameter('canDeleteMessages', i, true));
	const canInviteUsers = Boolean(this.getNodeParameter('canInviteUsers', i, true));
	const canRestrictMembers = Boolean(this.getNodeParameter('canRestrictMembers', i, true));
	const canPinMessages = Boolean(this.getNodeParameter('canPinMessages', i, true));
	const canPromoteMembers = Boolean(this.getNodeParameter('canPromoteMembers', i, false));
	const canManageChat = Boolean(this.getNodeParameter('canManageChat', i, true));
	const canManageVoiceChats = Boolean(this.getNodeParameter('canManageVoiceChats', i, true));
	const canPostStories = Boolean(this.getNodeParameter('canPostStories', i, false));
	const canEditStories = Boolean(this.getNodeParameter('canEditStories', i, false));
	const canDeleteStories = Boolean(this.getNodeParameter('canDeleteStories', i, false));

	// Get the channel and user entities
	const channel = await resolveChannelEntity(client, channelId);
	const user = await client.getEntity(userIdToPromote);

	try {
		// REMOVED: The manual GetParticipant/hasPromotePermission check.
		// We rely on the API to tell us if we are forbidden.

		// Promote user to admin
		await withRateLimit(async () =>
			safeExecute(() =>
				client.invoke(
					new Api.channels.EditAdmin({
						channel: channel,
						userId: user,
						adminRights: new Api.ChatAdminRights({
							changeInfo: canChangeInfo,
							postMessages: canPostMessages,
							editMessages: canEditMessages,
							deleteMessages: canDeleteMessages,
							banUsers: canRestrictMembers,
							inviteUsers: canInviteUsers,
							pinMessages: canPinMessages,
							addAdmins: canPromoteMembers,
							anonymous: false, // Don't allow anonymous posting by default
							manageCall: canManageVoiceChats,
							other: canManageChat,
							postStories: canPostStories,
							editStories: canEditStories,
							deleteStories: canDeleteStories,
						}),
						rank: adminTitle,
					}),
				),
			),
		);

		return [
			{
				json: {
					success: true,
					message: `Successfully promoted user ${userIdToPromote} to admin in channel ${channelId}`,
					userId: user.id?.toString(),
					channelId: channel.id?.toString(),
					adminTitle: adminTitle,
					permissions: {
						canChangeInfo,
						canPostMessages,
						canEditMessages,
						canDeleteMessages,
						canInviteUsers,
						canRestrictMembers,
						canPinMessages,
						canPromoteMembers,
						canManageChat,
						canManageVoiceChats,
						canPostStories,
						canEditStories,
						canDeleteStories,
					},
				},
				pairedItem: { item: i },
			},
		];
	} catch (error) {
		// Enhanced error handling for permission issues
		const errorMessage = error instanceof Error ? error.message : String(error);

		if (errorMessage.includes('RIGHT_FORBIDDEN') || errorMessage.includes('CHAT_ADMIN_REQUIRED')) {
			return [
				{
					json: {
						success: false,
						error: "RIGHT_FORBIDDEN: You don't have permission to promote users to admin",
						message: `You need admin rights with 'addAdmins' permission or be the channel creator to promote users in channel ${channelId}. Original Error: ${errorMessage}`,
					},
					pairedItem: { item: i },
				},
			];
		}

		return [
			{
				json: {
					success: false,
					error: errorMessage,
					message: `Failed to promote user ${userIdToPromote} to admin in channel ${channelId}`,
				},
				pairedItem: { item: i },
			},
		];
	}
}
