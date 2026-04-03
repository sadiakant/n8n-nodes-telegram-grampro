import { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import { getClient } from '../core/clientManager';
import { safeExecute } from '../core/floodWaitHandler';
import { Api } from 'telegram';
import { cache, CacheKeys } from '../core/cache';
import type { TelegramClientInstance, TelegramCredentials } from '../core/types';

function getBasicUser(users: Api.TypeUser[]): Api.User {
	const user = users.find((candidate): candidate is Api.User => candidate instanceof Api.User);
	if (!user) {
		throw new Error('Telegram did not return a usable user object.');
	}
	return user;
}

function getDetailedUser(fullUser: Api.TypeUserFull): Api.UserFull {
	if (!(fullUser instanceof Api.UserFull)) {
		throw new Error('Telegram did not return full user details.');
	}
	return fullUser;
}

function isTelegramUserEntity(entity: unknown): entity is Api.User {
	return entity instanceof Api.User;
}

function getProfilePhotoParams(photoSize: string): { isBig?: boolean } | undefined {
	if (photoSize === 'full') {
		return undefined;
	}

	return {
		isBig: photoSize !== 'small',
	};
}

function ensureBinaryBuffer(
	data: string | Buffer | undefined,
	context: string,
): Buffer | undefined {
	if (data === undefined) {
		return undefined;
	}

	if (Buffer.isBuffer(data)) {
		return data;
	}

	throw new Error(`Expected binary buffer from Telegram while ${context}, received a file path.`);
}

export async function userRouter(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const creds = (await this.getCredentials('telegramGramProApi')) as TelegramCredentials;

	const client = await getClient(creds.apiId, creds.apiHash, creds.session);

	const cacheScope = buildCacheScope(creds);

	switch (operation) {
		case 'getMe':
			return getMeScoped.call(this, client, i, cacheScope);

		case 'getFullUser':
			return getFullUserScoped.call(this, client, i, cacheScope);

		case 'updateProfile':
			return updateProfile.call(this, client, i);

		case 'updateUsername':
			return updateUsername.call(this, client, i);

		case 'getProfilePhoto':
			return getProfilePhoto.call(this, client, i);

		default:
			throw new Error(`User operation not supported: ${operation}`);
	}
}

// ----------------------

export async function getMe(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	return getMeScoped.call(this, client, i, 'global');
}

export async function getMeScoped(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
	cacheScope: string,
): Promise<INodeExecutionData[]> {
	const cacheKey = `me:${cacheScope}`;
	const cachedMe = cache.get(cacheKey);
	if (cachedMe) {
		return [
			{
				json: cachedMe as IDataObject,
				pairedItem: { item: i },
			},
		];
	}

	const me = await client.getMe();
	if (!me) {
		throw new Error('Telegram did not return the current user.');
	}

	const meFullResult = await safeExecute(() =>
		client.invoke(
			new Api.users.GetFullUser({
				id: 'me',
			}),
		),
	);
	const meFull = getDetailedUser((meFullResult as Api.users.UserFull).fullUser);

	const json: IDataObject = {
		id: me.id,
		username: me.username,
		firstName: me.firstName,
		lastName: me.lastName,
		bio: meFull.about || '',
		commonChatsCount: meFull.commonChatsCount || 0,
		isBot: me.bot || false,
		isContact: me.contact || false,
		isVerified: me.verified || false,
		isScam: me.scam || false,
		isFake: me.fake || false,
		isPremium: me.premium || false,
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

export async function getFullUser(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	return getFullUserScoped.call(this, client, i, 'global');
}

export async function getFullUserScoped(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
	cacheScope: string,
): Promise<INodeExecutionData[]> {
	const userId = this.getNodeParameter('userId', i) as string;

	const cacheKey = `${CacheKeys.getUser(userId)}:${cacheScope}`;
	const cachedUser = cache.get(cacheKey);
	if (cachedUser) {
		return [
			{
				json: cachedUser as IDataObject,
				pairedItem: { item: i },
			},
		];
	}

	const result = (await safeExecute(() =>
		client.invoke(
			new Api.users.GetFullUser({
				id: userId,
			}),
		),
	)) as Api.users.UserFull;

	const full = getDetailedUser(result.fullUser);
	const basic = getBasicUser(result.users);

	const json: IDataObject = {
		id: basic.id.toString(),
		firstName: basic.firstName,
		lastName: basic.lastName,
		username: basic.username,
		bio: full.about || '',
		commonChatsCount: full.commonChatsCount,
		isBot: basic.bot,
		isContact: basic.contact,
		isVerified: basic.verified,
		isScam: basic.scam,
		isFake: basic.fake,
		canPinMessages: full.canPinMessage,
		videoNotes: false,
		isPremium: basic.premium,
		emojiStatus: basic.emojiStatus,
	};

	cache.set(cacheKey, json);

	return [
		{
			json,
			pairedItem: { item: i },
		},
	];
}

function buildCacheScope(creds: TelegramCredentials): string {
	const apiId = creds.apiId ? String(creds.apiId) : 'no-api-id';
	const session = typeof creds.session === 'string' ? creds.session : '';
	const tail = session.length >= 8 ? session.slice(-8) : session || 'no-session';
	return `${apiId}:${tail}`;
}

export async function updateProfile(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const firstName = this.getNodeParameter('firstName', i, '') as string;
	const lastName = this.getNodeParameter('lastName', i, '') as string;
	const about = this.getNodeParameter('about', i, '') as string;

	try {
		const result = (await safeExecute(() =>
			client.invoke(
				new Api.account.UpdateProfile({
					firstName: firstName || undefined,
					lastName: lastName || undefined,
					about: about || undefined,
				}),
			),
		)) as Api.TypeUser;
		const updatedUser = result instanceof Api.User ? result : undefined;

		return [
			{
				json: {
					success: true,
					message: 'Profile updated successfully',
					firstName: updatedUser?.firstName,
					lastName: updatedUser?.lastName,
					about,
				} as IDataObject,
				pairedItem: { item: i },
			},
		];
	} catch (error) {
		return [
			{
				json: {
					success: false,
					error: error instanceof Error ? error.message : String(error),
					message: 'Failed to update profile',
				} as IDataObject,
				pairedItem: { item: i },
			},
		];
	}
}

export async function updateUsername(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const newUsername = this.getNodeParameter('newUsername', i, '') as string;

	try {
		const result = (await safeExecute(() =>
			client.invoke(
				new Api.account.UpdateUsername({
					username: newUsername,
				}),
			),
		)) as Api.TypeUser;
		const updatedUser = result instanceof Api.User ? result : undefined;

		return [
			{
				json: {
					success: true,
					message: `Username updated to ${newUsername}`,
					username: updatedUser?.username,
					id: updatedUser?.id?.toString(),
				} as IDataObject,
				pairedItem: { item: i },
			},
		];
	} catch (error) {
		return [
			{
				json: {
					success: false,
					error: error instanceof Error ? error.message : String(error),
					message: 'Failed to update username',
				} as IDataObject,
				pairedItem: { item: i },
			},
		];
	}
}

export async function getProfilePhoto(
	this: IExecuteFunctions,
	client: TelegramClientInstance,
	i: number,
): Promise<INodeExecutionData[]> {
	const myProfilePhotoOnly = this.getNodeParameter('myProfilePhotoOnly', i, false) as boolean;

	let userId: string;
	if (myProfilePhotoOnly) {
		const me = await client.getMe();
		if (!me) {
			throw new Error('Telegram did not return the current user.');
		}
		userId = me.id.toString();
	} else {
		userId = this.getNodeParameter('userId', i) as string;
	}

	const photoSize = this.getNodeParameter('photoSize', i, 'medium') as string;

	try {
		const entity = await client.getEntity(userId);
		if (!isTelegramUserEntity(entity)) {
			throw new Error(`Resolved entity for ${userId} is not a Telegram user.`);
		}
		const user = entity;

		if (!user.photo) {
			return [
				{
					json: {
						success: false,
						message: 'User has no profile photo',
						userId: user.id?.toString(),
					} as IDataObject,
					pairedItem: { item: i },
				},
			];
		}

		const photoData = ensureBinaryBuffer(
			await client.downloadProfilePhoto(user, getProfilePhotoParams(photoSize)),
			'downloading the profile photo',
		);

		return [
			{
				json: {
					success: true,
					message: `Profile photo downloaded (${photoSize} size)`,
					userId: user.id?.toString(),
					username: user.username,
					firstName: user.firstName,
					photoSize: photoSize,
					photoData: photoData ? 'Binary data available' : 'No photo data',
				} as IDataObject,
				binary: photoData
					? {
							photo: {
								data: photoData.toString('base64'),
								mimeType: 'image/jpeg',
								fileName: `profile_photo_${user.id}_${photoSize}.jpg`,
							},
						}
					: undefined,
				pairedItem: { item: i },
			},
		];
	} catch (error) {
		return [
			{
				json: {
					success: false,
					error: error instanceof Error ? error.message : String(error),
					message: 'Failed to get profile photo',
				} as IDataObject,
				pairedItem: { item: i },
			},
		];
	}
}
