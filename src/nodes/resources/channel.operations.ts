import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { getClient } from '../../core/clientManager';
import { safeExecute } from '../../core/floodWaitHandler';
import { withRateLimit } from '../../core/rateLimiter';
import { Api } from 'telegram';


export async function channelRouter(this: IExecuteFunctions, operation: string, i: number): Promise<INodeExecutionData[]> {

	const creds: any = await this.getCredentials('telegramApi');

	const client = await getClient(
		creds.apiId,
		creds.apiHash,
		creds.session,
	);

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

async function getChannelParticipants(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
	const channelId = this.getNodeParameter('channelId', i);
	const rawLimit = this.getNodeParameter('limit', i, null) as number | null;
	// When left empty in n8n, rawLimit may be null; treat null/undefined/NaN as "all"
	const limit = (typeof rawLimit === 'number' && !isNaN(rawLimit)) ? rawLimit : Infinity;
	const filterAdmins = this.getNodeParameter('filterAdmins', i, false);
	const filterBots = this.getNodeParameter('filterBots', i, false);
	const onlyOnline = this.getNodeParameter('onlyOnline', i, false);
	const excludeAdmins = this.getNodeParameter('excludeAdmins', i, false);
	const excludeBots = this.getNodeParameter('excludeBots', i, false);
	const excludeDeletedAndLongAgo = this.getNodeParameter('excludeDeletedAndLongAgo', i, false);

	const channel = await resolveChannelEntity(client, channelId);

	// Choose Telegram native filters to avoid post-filtering misses
	let apiFilter: any = new Api.ChannelParticipantsRecent();
	// Exclusion overrides inclusion: if exclude is true, do not use narrow inclusion filters
	if (!excludeAdmins && !excludeBots) {
		if (filterAdmins && filterBots) {
			apiFilter = new Api.ChannelParticipantsAdmins();
		} else if (filterAdmins) {
			apiFilter = new Api.ChannelParticipantsAdmins();
		} else if (filterBots) {
			apiFilter = new Api.ChannelParticipantsBots();
		}
	}

	// Telegram API caps to ~200 per call; loop until we reach requested limit or exhaust
	let offset = 0;
	let remaining = limit;
	const allParticipants: any[] = [];
	const usersById = new Map<string, any>();

	while (true) {
		const batchSize = remaining === Infinity ? 200 : Math.min(remaining, 200);

		const result: any = await withRateLimit(async () =>
			safeExecute(() =>
				client.invoke(new Api.channels.GetParticipants({
					channel,
					filter: apiFilter,
					offset,
					limit: batchSize,
					hash: BigInt(0) as any,
				}))
			)
		);

		(result.users || []).forEach((u: any) => usersById.set(u.id?.toString(), u));

		const participantsBatch: any[] = result.participants || [];
		allParticipants.push(...participantsBatch);

		// Update counters
		offset += participantsBatch.length;
		if (remaining !== Infinity) remaining -= participantsBatch.length;

		// Stop if less than requested returned or we've hit the user-requested limit
		if (participantsBatch.length < batchSize) break;
		if (remaining !== Infinity && remaining <= 0) break;
	}

	let participants: any[] = allParticipants;
	if (filterAdmins && filterBots) {
		participants = participants.filter((p: any) => {
			const u = usersById.get(p.userId?.toString());
			return u?.bot === true;
		});
	}

	if (onlyOnline) {
		const nowSec = Math.floor(Date.now() / 1000);
		participants = participants.filter((p: any) => {
			const u = usersById.get(p.userId?.toString());
			if (!u?.status) return false;

			const status = u.status;
			// Treat explicit online, recently, or statuses with future expires as online
			if (status._ === 'UserStatusOnline') return true;
			if (status._ === 'UserStatusRecently') return true;
			if (typeof status.expires === 'number' && status.expires > nowSec) return true;
			return false;
		});
	}

	if (excludeAdmins) {
		participants = participants.filter((p: any) => !(p.adminRights || p.isAdmin));
	}

	if (excludeBots) {
		participants = participants.filter((p: any) => {
			const u = usersById.get(p.userId?.toString());
			return u?.bot !== true;
		});
	}

	if (excludeDeletedAndLongAgo) {
		participants = participants.filter((p: any) => {
			const u = usersById.get(p.userId?.toString());
			if (!u) return false;
			if (u.deleted) return false;
			const status = u.status;
			if (!status) return true;
			if (status._ === 'UserStatusLongAgo') return false;
			return true;
		});
	}

	const items = participants.map((p: any) => {
		const user = usersById.get(p.userId?.toString()) || {};
		return {
			json: {
				id: user.id?.toString(),
				username: user.username || null,
				firstName: user.firstName || '',
				lastName: user.lastName || '',
				bot: user.bot || false,
				isAdmin: !!p.adminRights || !!p.isAdmin,
				isCreator: !!p.isCreator,
				status: user.status?._ || 'Unknown',
				phone: user.phone || null,
			},
			pairedItem: { item: i },
		};
	});

	return items;
}

async function addChannelMember(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
	const channelId = this.getNodeParameter('channelId', i);
	const userIdToAdd = this.getNodeParameter('userIdToAdd', i);

	// Get the channel and user entities
	const channel = await client.getEntity(channelId);
	const user = await client.getEntity(userIdToAdd);

	try {
		// Add user to channel/group
		await withRateLimit(async () =>
			safeExecute(() =>
				client.invoke(new Api.channels.InviteToChannel({
					channel: channel,
					users: [user]
				}))
			)
		);

		return [{
			json: {
				success: true,
				message: `Successfully added user ${userIdToAdd} to channel ${channelId}`,
				userId: user.id?.toString(),
				channelId: channel.id?.toString(),
			},
			pairedItem: { item: i },
		}];
	} catch (error) {
		return [{
			json: {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				message: `Failed to add user ${userIdToAdd} to channel ${channelId}`,
			},
			pairedItem: { item: i },
		}];
	}
}

// Robust channel resolver to handle numeric IDs without access hash and username links
async function resolveChannelEntity(client: any, rawId: any): Promise<any> {
	const attempts: any[] = [];
	const asString = typeof rawId === 'string' ? rawId.trim() : String(rawId);

	// 1) original input
	attempts.push(asString);

	// 2) if numeric without sign, try -100 prefix (supergroup/channel)
	if (/^\\d+$/.test(asString) && !asString.startsWith('-')) {
		attempts.push(`-100${asString}`);
	}

	// 3) if starts with -100 already, also try without minus for completeness
	if (asString.startsWith('-100')) {
		attempts.push(asString.replace('-100', ''));
	}

	let lastError: any = null;
	for (const candidate of attempts) {
		try {
			return await client.getEntity(candidate);
		} catch (err) {
			lastError = err;
		}
	}

	throw lastError || new Error('Failed to resolve channel entity');
}

async function removeChannelMember(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
	const channelId = this.getNodeParameter('channelId', i);
	const userIdToRemove = this.getNodeParameter('userIdToRemove', i);

	// Get the channel and user entities
	const channel = await client.getEntity(channelId);
	const user = await client.getEntity(userIdToRemove);

	try {
		// Remove user from channel/group (kick them)
		await withRateLimit(async () =>
			safeExecute(() =>
				client.invoke(new Api.channels.EditBanned({
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
					})
				}))
			)
		);

		return [{
			json: {
				success: true,
				message: `Successfully removed user ${userIdToRemove} from channel ${channelId}`,
				userId: user.id?.toString(),
				channelId: channel.id?.toString(),
			},
			pairedItem: { item: i },
		}];
	} catch (error) {
		return [{
			json: {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				message: `Failed to remove user ${userIdToRemove} from channel ${channelId}`,
			},
			pairedItem: { item: i },
		}];
	}
}

async function banUser(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
	const channelId = this.getNodeParameter('channelId', i);
	const userIdToBan = this.getNodeParameter('userIdToBan', i);
	const banDuration = this.getNodeParameter('banDuration', i, 1);
	const banReason = this.getNodeParameter('banReason', i, '');

	// Get the channel and user entities
	const channel = await client.getEntity(channelId);
	const user = await client.getEntity(userIdToBan);

	try {
		// Calculate ban until date
		const banDurationNum = typeof banDuration === 'number' ? banDuration : parseInt(banDuration as string, 10);
		const untilDate = banDurationNum === 0 ? 0 : Math.floor(Date.now() / 1000) + (banDurationNum * 24 * 60 * 60);

		// Ban user from channel/group
		await withRateLimit(async () =>
			safeExecute(() =>
				client.invoke(new Api.channels.EditBanned({
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
					})
				}))
			)
		);

		return [{
			json: {
				success: true,
				message: `Successfully banned user ${userIdToBan} from channel ${channelId} for ${banDuration === 0 ? 'permanent' : banDuration + ' days'}`,
				userId: user.id?.toString(),
				channelId: channel.id?.toString(),
				banDuration: banDuration,
				banReason: banReason || 'No reason provided',
			},
			pairedItem: { item: i },
		}];
	} catch (error) {
		return [{
			json: {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				message: `Failed to ban user ${userIdToBan} from channel ${channelId}`,
			},
			pairedItem: { item: i },
		}];
	}
}

async function unbanUser(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
	const channelId = this.getNodeParameter('channelId', i);
	const userIdToUnban = this.getNodeParameter('userIdToUnban', i);

	// Get the channel and user entities
	const channel = await client.getEntity(channelId);
	const user = await client.getEntity(userIdToUnban);

	try {
		// Unban user from channel/group (remove all restrictions)
		await withRateLimit(async () =>
			safeExecute(() =>
				client.invoke(new Api.channels.EditBanned({
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
					})
				}))
			)
		);

		return [{
			json: {
				success: true,
				message: `Successfully unbanned user ${userIdToUnban} from channel ${channelId}`,
				userId: user.id?.toString(),
				channelId: channel.id?.toString(),
			},
			pairedItem: { item: i },
		}];
	} catch (error) {
		return [{
			json: {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				message: `Failed to unban user ${userIdToUnban} from channel ${channelId}`,
			},
			pairedItem: { item: i },
		}];
	}
}

async function promoteUser(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
	const channelId = this.getNodeParameter('channelId', i);
	const userIdToPromote = this.getNodeParameter('userIdToPromote', i);
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
	const channel = await client.getEntity(channelId);
	const user = await client.getEntity(userIdToPromote);

	try {
		// REMOVED: The manual GetParticipant/hasPromotePermission check.
		// We rely on the API to tell us if we are forbidden.

		// Promote user to admin
		await withRateLimit(async () =>
			safeExecute(() =>
				client.invoke(new Api.channels.EditAdmin({
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
				}))
			)
		);

		return [{
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
		}];
	} catch (error) {
		// Enhanced error handling for permission issues
		const errorMessage = error instanceof Error ? error.message : String(error);

		if (errorMessage.includes('RIGHT_FORBIDDEN') || errorMessage.includes('CHAT_ADMIN_REQUIRED')) {
			return [{
				json: {
					success: false,
					error: "RIGHT_FORBIDDEN: You don't have permission to promote users to admin",
					message: `You need admin rights with 'addAdmins' permission or be the channel creator to promote users in channel ${channelId}. Original Error: ${errorMessage}`,
				},
				pairedItem: { item: i },
			}];
		}

		return [{
			json: {
				success: false,
				error: errorMessage,
				message: `Failed to promote user ${userIdToPromote} to admin in channel ${channelId}`,
			},
			pairedItem: { item: i },
		}];
	}
}
