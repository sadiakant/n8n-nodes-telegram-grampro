import { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import { getClient } from '../../core/clientManager';
import { safeExecute } from '../../core/floodWaitHandler';
import { Api } from 'telegram';
import { cache, CacheKeys } from '../../core/cache';

export async function userRouter(this: IExecuteFunctions, operation: string, i: number): Promise<INodeExecutionData[]> {
    const creds: any = await this.getCredentials('telegramApi');

    const client = await getClient(
        creds.apiId,
        creds.apiHash,
        creds.session,
    );

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

export async function getMe(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    return getMeScoped.call(this, client, i, 'global');
}

export async function getMeScoped(
    this: IExecuteFunctions,
    client: any,
    i: number,
    cacheScope: string,
): Promise<INodeExecutionData[]> {
    const cacheKey = `me:${cacheScope}`;
    const cachedMe = cache.get(cacheKey);
    if (cachedMe) {
        return [{
            json: cachedMe as IDataObject,
            pairedItem: { item: i },
        }];
    }

    const me = await client.getMe();

    const json: IDataObject = {
        id: me.id,
        username: me.username,
        firstName: me.firstName,
        lastName: me.lastName,
        bio: me.about || '',
        commonChatsCount: me.commonChatsCount || 0,
        isBot: me.bot || false,
        isContact: me.contact || false,
        isVerified: me.verified || false,
        isScam: me.scam || false,
        isFake: me.fake || false,
        isPremium: me.premium || false,
    };

    cache.set(cacheKey, json);

    return [{
        json,
        pairedItem: { item: i },
    }];
}

// ----------------------


export async function getFullUser(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    return getFullUserScoped.call(this, client, i, 'global');
}

export async function getFullUserScoped(
    this: IExecuteFunctions,
    client: any,
    i: number,
    cacheScope: string,
): Promise<INodeExecutionData[]> {
    const userId = this.getNodeParameter('userId', i) as string;

    const cacheKey = `${CacheKeys.getUser(userId)}:${cacheScope}`;
    const cachedUser = cache.get(cacheKey);
    if (cachedUser) {
        return [{
            json: cachedUser as IDataObject,
            pairedItem: { item: i },
        }];
    }

    const result = await safeExecute(() =>
        client.invoke(new Api.users.GetFullUser({
            id: userId,
        }))
    ) as any;

    const full = result.fullUser;
    const basic = result.users[0];

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
        canPinMessages: full.canPinMessages,
        videoNotes: full.videoNotes,
        isPremium: basic.premium,
        emojiStatus: full.emojiStatus,
    };

    cache.set(cacheKey, json);

    return [{
        json,
        pairedItem: { item: i },
    }];
}

function buildCacheScope(creds: Record<string, unknown>): string {
    const apiId = creds.apiId ? String(creds.apiId) : 'no-api-id';
    const session = typeof creds.session === 'string' ? creds.session : '';
    const tail = session.length >= 8 ? session.slice(-8) : session || 'no-session';
    return `${apiId}:${tail}`;
}

export async function updateProfile(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const firstName = this.getNodeParameter('firstName', i, '') as string;
    const lastName = this.getNodeParameter('lastName', i, '') as string;
    const about = this.getNodeParameter('about', i, '') as string;

    try {
        const result = await safeExecute(() =>
            client.invoke(new Api.account.UpdateProfile({
                firstName: firstName || undefined,
                lastName: lastName || undefined,
                about: about || undefined,
            }))
        );

        return [{
            json: {
                success: true,
                message: 'Profile updated successfully',
                firstName: (result as any).firstName,
                lastName: (result as any).lastName,
                about: (result as any).about,
            } as IDataObject,
            pairedItem: { item: i },
        }];
    } catch (error) {
        return [{
            json: {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                message: 'Failed to update profile',
            } as IDataObject,
            pairedItem: { item: i },
        }];
    }
}

export async function updateUsername(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const newUsername = this.getNodeParameter('newUsername', i, '') as string;

    try {
        const result = await safeExecute(() =>
            client.invoke(new Api.account.UpdateUsername({
                username: newUsername,
            }))
        );

        return [{
            json: {
                success: true,
                message: `Username updated to ${newUsername}`,
                username: (result as any).username,
                id: (result as any).id?.toString(),
            } as IDataObject,
            pairedItem: { item: i },
        }];
    } catch (error) {
        return [{
            json: {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                message: 'Failed to update username',
            } as IDataObject,
            pairedItem: { item: i },
        }];
    }
}

export async function getProfilePhoto(this: IExecuteFunctions, client: any, i: number): Promise<INodeExecutionData[]> {
    const myProfilePhotoOnly = this.getNodeParameter('myProfilePhotoOnly', i, false) as boolean;
    
    let userId: string;
    if (myProfilePhotoOnly) {
        const me = await client.getMe();
        userId = me.id.toString();
    } else {
        userId = this.getNodeParameter('userId', i) as string;
    }
    
    const photoSize = this.getNodeParameter('photoSize', i, 'medium') as string;

    try {
        const user = await client.getEntity(userId);

        if (!user.photo) {
        return [{
            json: {
                success: false,
                message: 'User has no profile photo',
                userId: user.id?.toString(),
            } as IDataObject,
            pairedItem: { item: i },
        }];
        }

        let photoData;
        switch (photoSize) {
            case 'small':
                photoData = await client.downloadProfilePhoto(user, { thumb: 's' });
                break;
            case 'medium':
                photoData = await client.downloadProfilePhoto(user, { thumb: 'm' });
                break;
            case 'large':
                photoData = await client.downloadProfilePhoto(user, { thumb: 'x' });
                break;
            case 'full':
                photoData = await client.downloadProfilePhoto(user);
                break;
            default:
                photoData = await client.downloadProfilePhoto(user, { thumb: 'm' });
        }

        return [{
            json: {
                success: true,
                message: `Profile photo downloaded (${photoSize} size)`,
                userId: user.id?.toString(),
                username: user.username,
                firstName: user.firstName,
                photoSize: photoSize,
                photoData: photoData ? 'Binary data available' : 'No photo data',
            } as IDataObject,
            binary: photoData ? {
                photo: {
                    data: photoData.toString('base64'),
                    mimeType: 'image/jpeg',
                    fileName: `profile_photo_${user.id}_${photoSize}.jpg`,
                },
            } : undefined,
            pairedItem: { item: i },
        }];
    } catch (error) {
        return [{
            json: {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                message: 'Failed to get profile photo',
            } as IDataObject,
            pairedItem: { item: i },
        }];
    }
}
