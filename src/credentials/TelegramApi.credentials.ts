import {
	ICredentialType,
	INodeProperties,
	ICredentialTestRequest,
	INodeCredentialTestResult,
	ICredentialsDecrypted,
	ICredentialDataDecryptedObject,
	IHttpRequestOptions,
} from 'n8n-workflow';
import { getClient } from '../core/clientManager';
import { mapTelegramError } from '../core/telegramErrorMapper';

export class TelegramApi implements ICredentialType {
	name = 'telegramApi';
	displayName = 'Telegram GramPro API';
	icon: ICredentialType['icon'] = 'file:telegram-grampro.svg';

	properties: INodeProperties[] = [
		{
			displayName: 'API ID',
			name: 'apiId',
			type: 'number',
			default: '',
			required: true,
			description: 'Your Telegram API ID from https://my.telegram.org (must be 6-9 digits)',
		},

		{
			displayName: 'API Hash',
			name: 'apiHash',
			type: 'string',
			default: '',
			required: true,
			description: 'Your Telegram API Hash from https://my.telegram.org (must be 32 characters)',
			placeholder: 'e.g., abc123def456ghi789jkl012mno345pq',
		},

		{
			displayName: 'Mobile Number',
			name: 'phoneNumber',
			type: 'string',
			default: '',
			required: true,
			description: 'Your Telegram mobile number with country code (e.g., +1234567890)',
			placeholder: '+1234567890',
		},

		{
			displayName: '2FA Code (Optional)',
			name: 'twoFactorCode',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: false,
			description: 'Your Telegram 2FA code if enabled',
		},
		{
			displayName: 'Session String',
			name: 'session',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: false,
			description:
				'The session string obtained from the "Complete Login" operation. Paste the full string here.',
		},
	];

	test: ICredentialTestRequest = {
		request: {
			method: 'GET',
			url: 'https://telegram.org',
			ignoreHttpStatusErrors: true,
		},
	};

	authenticate = async (
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> => {
		const apiIdRaw = credentials.apiId;
		const apiId =
			typeof apiIdRaw === 'string' ? Number(apiIdRaw) : (apiIdRaw as number | undefined);
		const apiHash = credentials.apiHash as string | undefined;
		const session = credentials.session as string | undefined;

		if (!apiId || !apiHash) {
			throw new Error('API ID and API Hash are required');
		}

		if (!session || !session.trim()) {
			throw new Error('Session String is required. Run Auth > Complete Login first.');
		}

		try {
			const client = await getClient(apiId, apiHash, session);
			if (!client) {
				throw new Error('Failed to initialize Telegram client');
			}
			const me = await client.getMe();

			if (!me) {
				throw new Error('Could not verify account identity with getMe');
			}
		} catch (error) {
			const mapped = mapTelegramError(error);
			throw new Error(`getMe verification failed: ${mapped.userMessage}`);
		}

		return requestOptions;
	};
}

/**
 * Programmatic test connection using MTProto getMe
 * Exported for use in node credentialTest methods
 */
export async function testTelegramApi(
	this: unknown,
	credential: ICredentialsDecrypted<ICredentialDataDecryptedObject> | Record<string, unknown>,
): Promise<INodeCredentialTestResult> {
	try {
		const credentials = ('data' in credential ? credential.data : credential) as
			| Record<string, unknown>
			| undefined;

		const apiIdRaw = credentials?.apiId;
		const apiId =
			typeof apiIdRaw === 'string' ? Number(apiIdRaw) : (apiIdRaw as number | undefined);
		const apiHash = credentials?.apiHash as string | undefined;
		const session = credentials?.session as string | undefined;

		if (!apiId || !apiHash) {
			return {
				status: 'Error',
				message: 'API ID and API Hash are required',
			};
		}

		const client = await getClient(apiId, apiHash, session ?? '');
		if (!client) {
			return {
				status: 'Error',
				message: 'Failed to initialize Telegram client',
			};
		}

		const me = await client.getMe();
		if (!me) {
			return {
				status: 'Error',
				message: 'getMe Operation Error: Could not verify account identity',
			};
		}

		const fullName =
			`${me.firstName ?? ''}${me.lastName ? ` ${me.lastName}` : ''}`.trim() || 'Unknown';
		const username = me.username ? `@${me.username}` : 'no-username';
		const userId = me.id ? me.id.toString() : 'unknown-id';

		return {
			status: 'OK',
			message: `Connection tested successfully. Username: ${username}, UserID: ${userId}, Name: ${fullName}`,
		};
	} catch (error) {
		const mapped = mapTelegramError(error);
		return {
			status: 'Error',
			message: `getMe Operation Error: ${mapped.userMessage}`,
		};
	}
}
