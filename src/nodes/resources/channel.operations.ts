import { IExecuteFunctions } from 'n8n-workflow';
import { getClient } from '../../core/clientManager';
import { safeExecute } from '../../core/floodWaitHandler';
import { withRateLimit } from '../../core/rateLimiter';
import { Api } from 'telegram';

export async function channelRouter(this: IExecuteFunctions, operation: string) {

	const creds: any = await this.getCredentials('telegramApi');

	const client = await getClient(
		creds.apiId,
		creds.apiHash,
		creds.session,
	);

	switch (operation) {

		case 'getParticipants':
			return getChannelParticipants.call(this, client);

		case 'getMembers':
			return getChannelMembers.call(this, client);

		case 'addMember':
			return addChannelMember.call(this, client);

		case 'removeMember':
			return removeChannelMember.call(this, client);

		case 'banUser':
			return banUser.call(this, client);

		case 'unbanUser':
			return unbanUser.call(this, client);

		case 'promoteUser':
			return promoteUser.call(this, client);

		default:
			throw new Error(`Channel operation not supported: ${operation}`);
	}
}

// ----------------

async function getChannelParticipants(this: IExecuteFunctions, client: any) {
	const channelId = this.getNodeParameter('channelId', 0);
	const limit = this.getNodeParameter('limit', 0, 50);
	const filterAdmins = this.getNodeParameter('filterAdmins', 0, false);
	const filterBots = this.getNodeParameter('filterBots', 0, false);

	const users = await withRateLimit(async () =>
		safeExecute(() =>
			client.getParticipants(channelId, { limit })
		)
	);

	let filteredUsers = users;

	// Apply admin filter
	if (filterAdmins) {
		filteredUsers = filteredUsers.filter((u: any) => u.admin_rights ? true : false);
	}

	// Apply bot filter
	if (filterBots) {
		filteredUsers = filteredUsers.filter((u: any) => u.bot || false);
	}

	const items = filteredUsers.map((u: any) => ({
		json: {
			id: u.id?.toString(),
			username: u.username || null,
			firstName: u.firstName || '',
			lastName: u.lastName || '',
			bot: u.bot || false,
			isAdmin: u.admin_rights ? true : false,
			isCreator: u.admin_rights?.isCreator || false,
		},
	}));

	return [items];
}

async function getChannelMembers(this: IExecuteFunctions, client: any) {
	const channelId = this.getNodeParameter('channelId', 0);
	const limit = this.getNodeParameter('limit', 0, 50);
	const onlyOnline = this.getNodeParameter('onlyOnline', 0, false);

	// Get the channel entity
	const channel = await client.getEntity(channelId);

	// For online members filtering, we need to get all members and filter
	const users = await withRateLimit(async () =>
		safeExecute(() =>
			client.getParticipants(channel, { limit })
		)
	);

	let filteredUsers = users;

	if (onlyOnline) {
		// Filter for online members (this is a basic implementation)
		// In practice, you might need to check last seen status
		filteredUsers = users.filter((u: any) => {
			// Basic online check - you might want to enhance this
			return u.status?._ === 'UserStatusOnline';
		});
	}

	const items = filteredUsers.map((u: any) => ({
		json: {
			id: u.id?.toString(),
			username: u.username || null,
			firstName: u.firstName || '',
			lastName: u.lastName || '',
			bot: u.bot || false,
			isAdmin: u.admin_rights ? true : false,
			isCreator: u.admin_rights?.isCreator || false,
			status: u.status?._ || 'Unknown',
			phone: u.phone || null,
		},
	}));

	return [items];
}

async function addChannelMember(this: IExecuteFunctions, client: any) {
	const channelId = this.getNodeParameter('channelId', 0);
	const userIdToAdd = this.getNodeParameter('userIdToAdd', 0);

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

		return [[{
			json: {
				success: true,
				message: `Successfully added user ${userIdToAdd} to channel ${channelId}`,
				userId: user.id?.toString(),
				channelId: channel.id?.toString(),
			},
		}]];
	} catch (error) {
		return [[{
			json: {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				message: `Failed to add user ${userIdToAdd} to channel ${channelId}`,
			},
		}]];
	}
}

async function removeChannelMember(this: IExecuteFunctions, client: any) {
	const channelId = this.getNodeParameter('channelId', 0);
	const userIdToRemove = this.getNodeParameter('userIdToRemove', 0);

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

		return [[{
			json: {
				success: true,
				message: `Successfully removed user ${userIdToRemove} from channel ${channelId}`,
				userId: user.id?.toString(),
				channelId: channel.id?.toString(),
			},
		}]];
	} catch (error) {
		return [[{
			json: {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				message: `Failed to remove user ${userIdToRemove} from channel ${channelId}`,
			},
		}]];
	}
}

async function banUser(this: IExecuteFunctions, client: any) {
	const channelId = this.getNodeParameter('channelId', 0);
	const userIdToBan = this.getNodeParameter('userIdToBan', 0);
	const banDuration = this.getNodeParameter('banDuration', 0, 1);
	const banReason = this.getNodeParameter('banReason', 0, '');

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

		return [[{
			json: {
				success: true,
				message: `Successfully banned user ${userIdToBan} from channel ${channelId} for ${banDuration === 0 ? 'permanent' : banDuration + ' days'}`,
				userId: user.id?.toString(),
				channelId: channel.id?.toString(),
				banDuration: banDuration,
				banReason: banReason || 'No reason provided',
			},
		}]];
	} catch (error) {
		return [[{
			json: {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				message: `Failed to ban user ${userIdToBan} from channel ${channelId}`,
			},
		}]];
	}
}

async function unbanUser(this: IExecuteFunctions, client: any) {
	const channelId = this.getNodeParameter('channelId', 0);
	const userIdToUnban = this.getNodeParameter('userIdToUnban', 0);

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

		return [[{
			json: {
				success: true,
				message: `Successfully unbanned user ${userIdToUnban} from channel ${channelId}`,
				userId: user.id?.toString(),
				channelId: channel.id?.toString(),
			},
		}]];
	} catch (error) {
		return [[{
			json: {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				message: `Failed to unban user ${userIdToUnban} from channel ${channelId}`,
			},
		}]];
	}
}

async function promoteUser(this: IExecuteFunctions, client: any) {
	const channelId = this.getNodeParameter('channelId', 0);
	const userIdToPromote = this.getNodeParameter('userIdToPromote', 0);
	const adminTitle = String(this.getNodeParameter('adminTitle', 0, 'Admin'));
	
	// Admin permissions
	const canChangeInfo = Boolean(this.getNodeParameter('canChangeInfo', 0, false));
	const canPostMessages = Boolean(this.getNodeParameter('canPostMessages', 0, false));
	const canEditMessages = Boolean(this.getNodeParameter('canEditMessages', 0, false));
	const canDeleteMessages = Boolean(this.getNodeParameter('canDeleteMessages', 0, true));
	const canInviteUsers = Boolean(this.getNodeParameter('canInviteUsers', 0, true));
	const canRestrictMembers = Boolean(this.getNodeParameter('canRestrictMembers', 0, true));
	const canPinMessages = Boolean(this.getNodeParameter('canPinMessages', 0, true));
	const canPromoteMembers = Boolean(this.getNodeParameter('canPromoteMembers', 0, false));
	const canManageChat = Boolean(this.getNodeParameter('canManageChat', 0, true));
	const canManageVoiceChats = Boolean(this.getNodeParameter('canManageVoiceChats', 0, true));
	const canPostStories = Boolean(this.getNodeParameter('canPostStories', 0, false));
	const canEditStories = Boolean(this.getNodeParameter('canEditStories', 0, false));
	const canDeleteStories = Boolean(this.getNodeParameter('canDeleteStories', 0, false));

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

		return [[{
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
		}]];
	} catch (error) {
		// Enhanced error handling for permission issues
		const errorMessage = error instanceof Error ? error.message : String(error);
		
		if (errorMessage.includes('RIGHT_FORBIDDEN') || errorMessage.includes('CHAT_ADMIN_REQUIRED')) {
			return [[{
				json: {
					success: false,
					error: "RIGHT_FORBIDDEN: You don't have permission to promote users to admin",
					message: `You need admin rights with 'addAdmins' permission or be the channel creator to promote users in channel ${channelId}. Original Error: ${errorMessage}`,
				},
			}]];
		}
		
		return [[{
			json: {
				success: false,
				error: errorMessage,
				message: `Failed to promote user ${userIdToPromote} to admin in channel ${channelId}`,
			},
		}]];
	}
}