import { IExecuteFunctions } from 'n8n-workflow';
import { getClient } from '../../core/clientManager';
import { safeExecute } from '../../core/floodWaitHandler';
import { Api } from 'telegram';

export async function userRouter(this: IExecuteFunctions, operation: string) {
    const creds: any = await this.getCredentials('telegramApi');

    const client = await getClient(
        creds.apiId,
        creds.apiHash,
        creds.session,
    );

    switch (operation) {
        case 'getMe':
            return getMe.call(this, client);

        case 'getFullUser':
            return getFullUser.call(this, client);

        case 'updateProfile':
            return updateProfile.call(this, client);

        case 'updateUsername':
            return updateUsername.call(this, client);

        case 'getProfilePhoto':
            return getProfilePhoto.call(this, client);

        default:
            throw new Error(`User operation not supported: ${operation}`);
    }
}

// ----------------------

export async function getMe(this: IExecuteFunctions, client: any) {
    const me = await client.getMe();

    return [[{
        json: {
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
        },
    }]];
}

// ----------------------


export async function getFullUser(this: IExecuteFunctions, client: any) {
    const userId = this.getNodeParameter('userId', 0) as string;

    const result = await safeExecute(() =>
        client.invoke(new Api.users.GetFullUser({
            id: userId,
        }))
    );

    const full = result.fullUser;
    const basic = result.users[0];

    return [[{
        json: {
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
        }
    }]];
}

export async function updateProfile(this: IExecuteFunctions, client: any) {
    const firstName = this.getNodeParameter('firstName', 0, '') as string;
    const lastName = this.getNodeParameter('lastName', 0, '') as string;
    const about = this.getNodeParameter('about', 0, '') as string;

    try {
        const result = await safeExecute(() =>
            client.invoke(new Api.account.UpdateProfile({
                firstName: firstName || undefined,
                lastName: lastName || undefined,
                about: about || undefined,
            }))
        );

        return [[{
            json: {
                success: true,
                message: 'Profile updated successfully',
                firstName: (result as any).firstName,
                lastName: (result as any).lastName,
                about: (result as any).about,
            },
        }]];
    } catch (error) {
        return [[{
            json: {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                message: 'Failed to update profile',
            },
        }]];
    }
}

export async function updateUsername(this: IExecuteFunctions, client: any) {
    const newUsername = this.getNodeParameter('newUsername', 0, '') as string;

    try {
        const result = await safeExecute(() =>
            client.invoke(new Api.account.UpdateUsername({
                username: newUsername,
            }))
        );

        return [[{
            json: {
                success: true,
                message: `Username updated to ${newUsername}`,
                username: (result as any).username,
                id: (result as any).id?.toString(),
            },
        }]];
    } catch (error) {
        return [[{
            json: {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                message: 'Failed to update username',
            },
        }]];
    }
}

export async function getProfilePhoto(this: IExecuteFunctions, client: any) {
    const userId = this.getNodeParameter('userId', 0) as string;
    const photoSize = this.getNodeParameter('photoSize', 0, 'medium') as string;

    try {
        const user = await client.getEntity(userId);

        if (!user.photo) {
            return [[{
                json: {
                    success: false,
                    message: 'User has no profile photo',
                    userId: user.id?.toString(),
                },
            }]];
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

        return [[{
            json: {
                success: true,
                message: `Profile photo downloaded (${photoSize} size)`,
                userId: user.id?.toString(),
                username: user.username,
                firstName: user.firstName,
                photoSize: photoSize,
                photoData: photoData ? 'Binary data available' : 'No photo data',
            },
            binary: photoData ? {
                photo: {
                    data: photoData.toString('base64'),
                    mimeType: 'image/jpeg',
                    fileName: `profile_photo_${user.id}_${photoSize}.jpg`,
                },
            } : undefined,
        }]];
    } catch (error) {
        return [[{
            json: {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                message: 'Failed to get profile photo',
            },
        }]];
    }
}