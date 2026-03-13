import { IExecuteFunctions, INodeExecutionData, IDataObject, GenericValue } from 'n8n-workflow';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as QRCode from 'qrcode';
import { logger } from '../../core/logger';
import { safeExecute } from '../../core/floodWaitHandler';
import { mapTelegramError } from '../../core/telegramErrorMapper';
import { LogLevel } from 'telegram/extensions/Logger';

type SentCodeDetails = {
	phoneCodeHash: string;
	isCodeViaApp: boolean;
	deliveryType?: string;
	deliveryTypeRaw?: IDataObject;
	nextType?: string;
	nextTypeRaw?: IDataObject;
	timeout?: number;
};

const SENT_CODE_TYPE_MAP: Record<string, string> = {
	'auth.SentCodeTypeApp': 'app',
	'auth.SentCodeTypeSms': 'sms',
	'auth.SentCodeTypeCall': 'call',
	'auth.SentCodeTypeFlashCall': 'flash_call',
	'auth.SentCodeTypeMissedCall': 'missed_call',
	'auth.SentCodeTypeEmailCode': 'email_code',
	'auth.SentCodeTypeSetUpEmailRequired': 'setup_email_required',
	'auth.SentCodeTypeFragmentSms': 'fragment_sms',
	'auth.SentCodeTypeFirebaseSms': 'firebase_sms',
	'auth.SentCodeTypeSmsWord': 'sms_word',
	'auth.SentCodeTypeSmsPhrase': 'sms_phrase',
};

const CODE_TYPE_MAP: Record<string, string> = {
	'auth.CodeTypeSms': 'sms',
	'auth.CodeTypeCall': 'call',
	'auth.CodeTypeFlashCall': 'flash_call',
	'auth.CodeTypeMissedCall': 'missed_call',
	'auth.CodeTypeFragmentSms': 'fragment_sms',
};

const SENT_CODE_TYPE_FIELDS: Record<string, string[]> = {
	'auth.SentCodeTypeApp': ['length'],
	'auth.SentCodeTypeSms': ['length'],
	'auth.SentCodeTypeCall': ['length'],
	'auth.SentCodeTypeFlashCall': ['pattern'],
	'auth.SentCodeTypeMissedCall': ['prefix', 'length'],
	'auth.SentCodeTypeEmailCode': [
		'emailPattern',
		'length',
		'appleSigninAllowed',
		'googleSigninAllowed',
		'resetAvailablePeriod',
		'resetPendingDate',
	],
	'auth.SentCodeTypeSetUpEmailRequired': ['appleSigninAllowed', 'googleSigninAllowed'],
	'auth.SentCodeTypeFragmentSms': ['url', 'length'],
	'auth.SentCodeTypeFirebaseSms': [
		'length',
		'pushTimeout',
		'receipt',
		'playIntegrityProjectId',
		'nonce',
		'playIntegrityNonce',
	],
	'auth.SentCodeTypeSmsWord': ['beginning'],
	'auth.SentCodeTypeSmsPhrase': ['beginning'],
};

const CODE_TYPE_FIELDS: Record<string, string[]> = {
	'auth.CodeTypeSms': [],
	'auth.CodeTypeCall': [],
	'auth.CodeTypeFlashCall': [],
	'auth.CodeTypeMissedCall': [],
	'auth.CodeTypeFragmentSms': [],
};

function normalizeBinary(value: unknown): GenericValue {
	if (Buffer.isBuffer(value)) return value.toString('base64');
	if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
	return value as GenericValue;
}

function buildRawObject(obj: unknown, fields: string[]): IDataObject | undefined {
	if (!obj || typeof obj !== 'object') return undefined;
	const asAny = obj as Record<string, unknown>;
	const className = typeof asAny.className === 'string' ? asAny.className : 'unknown';
	const raw: IDataObject = { className };
	for (const field of fields) {
		if (asAny[field] !== undefined) {
			raw[field] = normalizeBinary(asAny[field]);
		}
	}
	return raw;
}

function normalizeSentCodeType(type?: Api.auth.TypeSentCodeType): {
	deliveryType?: string;
	deliveryTypeRaw?: IDataObject;
} {
	if (!type) return {};
	const className = (type as any).className as string | undefined;
	const deliveryType = className ? (SENT_CODE_TYPE_MAP[className] ?? className) : undefined;
	const fields = className ? (SENT_CODE_TYPE_FIELDS[className] ?? []) : [];
	return {
		deliveryType,
		deliveryTypeRaw: buildRawObject(type, fields),
	};
}

function normalizeCodeType(type?: Api.auth.TypeCodeType): {
	nextType?: string;
	nextTypeRaw?: IDataObject;
} {
	if (!type) return {};
	const className = (type as any).className as string | undefined;
	const nextType = className ? (CODE_TYPE_MAP[className] ?? className) : undefined;
	const fields = className ? (CODE_TYPE_FIELDS[className] ?? []) : [];
	return {
		nextType,
		nextTypeRaw: buildRawObject(type, fields),
	};
}

function toBase64Url(value: unknown): string | undefined {
	if (Buffer.isBuffer(value)) return value.toString('base64url');
	if (value instanceof Uint8Array) return Buffer.from(value).toString('base64url');
	return undefined;
}

async function buildQrBinary(loginUrl: string, fileNamePrefix: string) {
	const buffer = await QRCode.toBuffer(loginUrl, {
		type: 'png',
		margin: 1,
		width: 320,
	});
	const fileName = `${fileNamePrefix}_${Date.now()}.png`;
	return {
		buffer,
		fileName,
		mimeType: 'image/png',
	};
}

function saveSessionString(client: TelegramClient, context: string): string {
	const session = (client.session as unknown as { save?: () => unknown }).save?.();
	if (typeof session !== 'string' || !session.trim()) {
		throw new Error(`Failed to obtain session string during ${context}.`);
	}
	return session;
}

async function invokeWithTimeout<T>(
	context: string,
	fn: () => Promise<T>,
	timeoutMs = 30000,
): Promise<T> {
	let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutHandle = setTimeout(() => {
			reject(new Error(`Timeout while waiting for Telegram during ${context}.`));
		}, timeoutMs);
	});

	try {
		return await Promise.race([fn(), timeoutPromise]);
	} finally {
		if (timeoutHandle) clearTimeout(timeoutHandle);
	}
}

/**
 * HELPER: Forcefully destroys connection and kills background timers
 */
async function forceCleanup(client: TelegramClient, phone: string) {
	if (!client) return;
	try {
		// Silence logger during destruction to prevent noise
		client.setLogLevel(LogLevel.NONE);

		// Disconnect creates a promise that resolves when socket closes
		await client.disconnect();

		// Destroy is crucial: it kills internal keep-alive timers that keep the node process "active"
		await client.destroy();

		logger.info(`Cleanly disconnected auth client: ${phone}`);
	} catch {
		// We ignore errors here because we are destroying anyway
	}
}

export async function authenticationRouter(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	if (operation === 'requestCode') return requestCode.call(this, i);
	if (operation === 'resendCode') return resendCode.call(this, i);
	if (operation === 'requestQr') return requestQrLogin.call(this, i);
	if (operation === 'completeQr') return completeQrLogin.call(this, i);
	if (operation === 'signIn') return signIn.call(this, i);
	throw new Error(`Auth operation ${operation} not supported.`);
}

function extractSentCodeDetails(sentCode: Api.auth.SentCode): SentCodeDetails {
	const isCodeViaApp = sentCode.type instanceof Api.auth.SentCodeTypeApp;
	const { deliveryType, deliveryTypeRaw } = normalizeSentCodeType(sentCode.type);
	const { nextType, nextTypeRaw } = normalizeCodeType(sentCode.nextType);
	return {
		phoneCodeHash: sentCode.phoneCodeHash,
		isCodeViaApp,
		deliveryType,
		deliveryTypeRaw,
		nextType,
		nextTypeRaw,
		timeout: sentCode.timeout ?? undefined,
	};
}

async function requestCode(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
	// Parse Int explicitly
	const rawApiId = this.getNodeParameter('apiId', i);
	const apiId = parseInt(rawApiId as string, 10);

	const apiHash = this.getNodeParameter('apiHash', i) as string;
	const phoneNumber = this.getNodeParameter('phoneNumber', i) as string;
	const password2fa = (this.getNodeParameter('password2fa', i, '') as string).trim();

	const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
		connectionRetries: 1,
		useWSS: false,
		autoReconnect: false,
	});

	let phoneCodeHash: string | undefined;
	let isCodeViaApp: boolean | undefined;
	let deliveryType: string | undefined;
	let deliveryTypeRaw: IDataObject | undefined;
	let nextType: string | undefined;
	let nextTypeRaw: IDataObject | undefined;
	let timeout: number | undefined;
	let preAuthSession: string | undefined;
	let sessionString: string | undefined;

	try {
		await client.connect();

		const result = (await safeExecute(() =>
			client.invoke(
				new Api.auth.SendCode({
					phoneNumber,
					apiId,
					apiHash,
					settings: new Api.CodeSettings({}),
				}),
			),
		)) as Api.auth.TypeSentCode;

		if ((result as any).className === 'auth.SentCodePaymentRequired') {
			throw new Error(
				'Telegram requires a paid login delivery method for this phone number. Use the official app or upgrade Telegram to complete login.',
			);
		}

		if (result instanceof Api.auth.SentCodeSuccess) {
			sessionString = saveSessionString(client, 'requestCode');
		} else {
			const details = extractSentCodeDetails(result as Api.auth.SentCode);
			phoneCodeHash = details.phoneCodeHash;
			isCodeViaApp = details.isCodeViaApp;
			deliveryType = details.deliveryType;
			deliveryTypeRaw = details.deliveryTypeRaw;
			nextType = details.nextType;
			nextTypeRaw = details.nextTypeRaw;
			timeout = details.timeout;
			preAuthSession = saveSessionString(client, 'requestCode');
		}

		if (!sessionString && !phoneCodeHash) {
			throw new Error(
				'Failed to obtain phoneCodeHash from Telegram. Cannot continue authentication.',
			);
		}
	} catch (error) {
		logger.error(`RequestCode failed: ${error}`);
		throw error;
	} finally {
		// Ensure cleanup happens BEFORE returning data to n8n
		await forceCleanup(client, phoneNumber);
	}

	if (sessionString) {
		return [
			{
				json: {
					success: true,
					sessionString,
					apiId,
					apiHash,
					phoneNumber,
					password2fa,
					message: 'Telegram returned an authorized session without requiring a login code.',
					note: 'You can use this session string directly in GramPro credentials.',
				} as IDataObject,
				pairedItem: { item: i },
			},
		];
	}

	if (!phoneCodeHash) {
		throw new Error(
			'Failed to obtain phoneCodeHash from Telegram. Cannot continue authentication.',
		);
	}

	return [
		{
			json: {
				success: true,
				phoneCodeHash,
				isCodeViaApp,
				preAuthSession,
				deliveryType,
				deliveryTypeRaw,
				nextType,
				nextTypeRaw,
				timeout,
				apiId,
				apiHash,
				phoneNumber,
				password2fa,
				note: 'IMPORTANT: Check your phone for the verification code.',
			} as IDataObject,
			pairedItem: { item: i },
		},
	];
}

async function resendCode(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
	const rawApiId = this.getNodeParameter('apiId', i);
	const apiId = parseInt(rawApiId as string, 10);

	const apiHash = this.getNodeParameter('apiHash', i) as string;
	const phoneNumber = this.getNodeParameter('phoneNumber', i) as string;
	const phoneCodeHash = this.getNodeParameter('phoneCodeHash', i) as string;
	const preAuthSession = this.getNodeParameter('preAuthSession', i) as string;
	const password2fa = (this.getNodeParameter('password2fa', i, '') as string).trim();

	const client = new TelegramClient(new StringSession(preAuthSession), apiId, apiHash, {
		connectionRetries: 1,
		useWSS: false,
		autoReconnect: false,
	});

	let details: SentCodeDetails | undefined;
	let sessionString: string | undefined;

	try {
		await client.connect();

		const result = (await safeExecute(() =>
			client.invoke(new Api.auth.ResendCode({ phoneNumber, phoneCodeHash })),
		)) as Api.auth.TypeSentCode;

		if ((result as any).className === 'auth.SentCodePaymentRequired') {
			throw new Error(
				'Telegram requires a paid login delivery method for this phone number. Use the official app or upgrade Telegram to complete login.',
			);
		}

		if (result instanceof Api.auth.SentCodeSuccess) {
			sessionString = saveSessionString(client, 'resendCode');
		} else {
			details = extractSentCodeDetails(result as Api.auth.SentCode);
		}
	} catch (error) {
		logger.error(`ResendCode failed: ${error}`);
		throw error;
	} finally {
		await forceCleanup(client, phoneNumber);
	}

	if (sessionString) {
		return [
			{
				json: {
					success: true,
					sessionString,
					apiId,
					apiHash,
					phoneNumber,
					password2fa,
					message: 'Telegram returned an authorized session without requiring a login code.',
					note: 'You can use this session string directly in GramPro credentials.',
				} as IDataObject,
				pairedItem: { item: i },
			},
		];
	}

	if (!details?.phoneCodeHash) {
		throw new Error('Failed to resend login code. No phoneCodeHash returned by Telegram.');
	}

	return [
		{
			json: {
				success: true,
				phoneCodeHash: details.phoneCodeHash,
				isCodeViaApp: details.isCodeViaApp,
				preAuthSession,
				deliveryType: details.deliveryType,
				deliveryTypeRaw: details.deliveryTypeRaw,
				nextType: details.nextType,
				nextTypeRaw: details.nextTypeRaw,
				timeout: details.timeout,
				apiId,
				apiHash,
				phoneNumber,
				password2fa,
				note: 'IMPORTANT: Check your phone for the verification code.',
			} as IDataObject,
			pairedItem: { item: i },
		},
	];
}

async function requestQrLogin(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
	const rawApiId = this.getNodeParameter('apiId', i);
	const apiId = parseInt(rawApiId as string, 10);

	const apiHash = this.getNodeParameter('apiHash', i) as string;

	let client = new TelegramClient(new StringSession(''), apiId, apiHash, {
		connectionRetries: 1,
		useWSS: false,
		autoReconnect: false,
	});

	let preAuthSession: string | undefined;
	let loginToken: string | undefined;
	let loginUrl: string | undefined;
	let expires: number | undefined;
	let qrBinary:
		| {
				data: string;
				fileName: string;
				mimeType: string;
		  }
		| undefined;

	try {
		await client.connect();

		let result = (await invokeWithTimeout('requestQr', () =>
			safeExecute(() =>
				client.invoke(
					new Api.auth.ExportLoginToken({
						apiId,
						apiHash,
						exceptIds: [],
					}),
				),
			),
		)) as Api.auth.TypeLoginToken;

		if (result instanceof Api.auth.LoginTokenMigrateTo) {
			const migrateDcId = result.dcId;
			const dcInfo = await client.getDC(migrateDcId, false, false);

			await forceCleanup(client, 'qr-login-request-disconnect');

			const migratedClient = new TelegramClient(new StringSession(''), apiId, apiHash, {
				connectionRetries: 5,
				useWSS: false,
				autoReconnect: true,
			});
			migratedClient.session.setDC(migrateDcId, dcInfo.ipAddress, dcInfo.port);
			await migratedClient.connect();

			client = migratedClient;

			result = (await invokeWithTimeout('requestQr', () =>
				safeExecute(() =>
					client.invoke(
						new Api.auth.ExportLoginToken({
							apiId,
							apiHash,
							exceptIds: [],
						}),
					),
				),
			)) as Api.auth.TypeLoginToken;
		}

		if (result instanceof Api.auth.LoginTokenSuccess) {
			const sessionString = saveSessionString(client, 'requestQr');
			return [
				{
					json: {
						success: true,
						sessionString,
						apiId,
						apiHash,
						message: 'QR login already completed. Session string is ready to use.',
					} as IDataObject,
					pairedItem: { item: i },
				},
			];
		}

		if (!(result instanceof Api.auth.LoginToken)) {
			throw new Error(`Unexpected QR token response: ${(result as any).className ?? 'unknown'}`);
		}

		const token = toBase64Url(result.token);
		if (!token) throw new Error('Failed to generate QR login token.');

		preAuthSession = saveSessionString(client, 'requestQr');
		loginToken = token;
		loginUrl = `tg://login?token=${token}`;
		expires = result.expires;
		const qrFile = await buildQrBinary(loginUrl, 'telegram-qr');
		qrBinary = {
			data: qrFile.buffer.toString('base64'),
			fileName: qrFile.fileName,
			mimeType: qrFile.mimeType,
		};
	} catch (error) {
		logger.error(`RequestQrLogin failed: ${error}`);
		throw error;
	} finally {
		await forceCleanup(client, 'qr-login');
	}

	return [
		{
			json: {
				success: true,
				loginToken,
				loginUrl,
				expires,
				preAuthSession,
				apiId,
				apiHash,
				note: 'Scan the QR in Telegram. Then run Complete QR Login with the preAuthSession.',
			} as IDataObject,
			binary: qrBinary ? { qr: qrBinary } : undefined,
			pairedItem: { item: i },
		},
	];
}

async function completeQrLogin(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
	const rawApiId = this.getNodeParameter('apiId', i);
	const apiId = parseInt(rawApiId as string, 10);

	const apiHash = this.getNodeParameter('apiHash', i) as string;
	const preAuthSession = this.getNodeParameter('preAuthSession', i) as string;
	const password2fa = (this.getNodeParameter('password2fa', i, '') as string).trim();

	let client = new TelegramClient(new StringSession(preAuthSession), apiId, apiHash, {
		connectionRetries: 1,
		useWSS: false,
		autoReconnect: false,
	});

	try {
		await client.connect();

		let result = (await invokeWithTimeout('completeQr', () =>
			safeExecute(() =>
				client.invoke(
					new Api.auth.ExportLoginToken({
						apiId,
						apiHash,
						exceptIds: [],
					}),
				),
			),
		)) as Api.auth.TypeLoginToken;

		if (result instanceof Api.auth.LoginTokenSuccess) {
			const sessionString = saveSessionString(client, 'completeQr');
			return [
				{
					json: {
						success: true,
						sessionString,
						apiId,
						apiHash,
						message: 'QR login successful. Use this session string in GramPro credentials.',
					} as IDataObject,
					pairedItem: { item: i },
				},
			];
		}

		if (result instanceof Api.auth.LoginTokenMigrateTo) {
			const migrateToken = result.token;
			const migrateDcId = result.dcId;

			// Fetch the target DC ip and port using the current (still connected) client
			const dcInfo = await client.getDC(migrateDcId, false, false);

			// Bypass client._switchDC to prevent hangs related to node/gramjs environments
			await forceCleanup(client, 'qr-login-disconnect');

			// Create a brand new client initialized to the new DC
			const migratedClient = new TelegramClient(new StringSession(''), apiId, apiHash, {
				connectionRetries: 5,
				useWSS: false,
				autoReconnect: true,
			});

			// Fix the DC ID BEFORE connecting
			migratedClient.session.setDC(migrateDcId, dcInfo.ipAddress, dcInfo.port);

			await migratedClient.connect();

			// Overwrite local `client` so if 2FA password is needed (which will be thrown by ImportLoginToken), it uses the migratedClient.
			client = migratedClient;

			result = (await invokeWithTimeout('completeQr', () =>
				safeExecute(() => client.invoke(new Api.auth.ImportLoginToken({ token: migrateToken }))),
			)) as Api.auth.TypeLoginToken;
		}

		if (result instanceof Api.auth.LoginTokenSuccess) {
			const sessionString = saveSessionString(client, 'completeQr');
			return [
				{
					json: {
						success: true,
						sessionString,
						apiId,
						apiHash,
						message: 'QR login successful. Use this session string in GramPro credentials.',
					} as IDataObject,
					pairedItem: { item: i },
				},
			];
		}

		if (!(result instanceof Api.auth.LoginToken)) {
			throw new Error(`Unexpected QR token response: ${(result as any).className ?? 'unknown'}`);
		}

		const token = toBase64Url(result.token);
		if (!token) throw new Error('Failed to generate QR login token.');

		const qrFile = await buildQrBinary(`tg://login?token=${token}`, 'telegram-qr');

		return [
			{
				json: {
					success: true,
					status: 'pending',
					loginToken: token,
					loginUrl: `tg://login?token=${token}`,
					expires: result.expires,
					preAuthSession,
					apiId,
					apiHash,
					note: 'QR not accepted yet. Token changes each request; scan the latest QR and retry.',
				} as IDataObject,
				binary: {
					qr: {
						data: qrFile.buffer.toString('base64'),
						fileName: qrFile.fileName,
						mimeType: qrFile.mimeType,
					},
				},
				pairedItem: { item: i },
			},
		];
	} catch (error) {
		const mappedError = mapTelegramError(error);
		if (mappedError.code === 'SESSION_PASSWORD_NEEDED') {
			if (!password2fa) {
				throw new Error(
					'Two-step verification is enabled. Provide your 2FA password in the Complete QR Login operation.',
					{ cause: error },
				);
			}

			await invokeWithTimeout('signInWithPassword_completeQr', () =>
				safeExecute(() =>
					client.signInWithPassword(
						{ apiId, apiHash },
						{
							password: async () => password2fa,
							onError: async (e) => {
								throw e;
							},
						},
					),
				),
			);

			const sessionString = saveSessionString(client, 'completeQr');
			return [
				{
					json: {
						success: true,
						sessionString,
						apiId,
						apiHash,
						message: 'QR login successful after 2FA verification.',
					} as IDataObject,
					pairedItem: { item: i },
				},
			];
		}

		logger.error(`CompleteQrLogin failed: ${error}`);
		throw error;
	} finally {
		await forceCleanup(client, 'qr-login');
	}
}

async function signIn(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
	const rawApiId = this.getNodeParameter('apiId', i);
	const apiId = parseInt(rawApiId as string, 10);

	const apiHash = this.getNodeParameter('apiHash', i) as string;
	const phoneNumber = this.getNodeParameter('phoneNumber', i) as string;
	const phoneCode = this.getNodeParameter('phoneCode', i) as string;
	const phoneCodeHash = this.getNodeParameter('phoneCodeHash', i) as string;
	const preAuthSession = this.getNodeParameter('preAuthSession', i) as string;
	const password2fa = (this.getNodeParameter('password2fa', i, '') as string).trim();

	const client = new TelegramClient(new StringSession(preAuthSession), apiId, apiHash, {
		connectionRetries: 1,
		useWSS: false,
		autoReconnect: false,
	});

	let sessionString: string | undefined;

	try {
		await client.connect();
		try {
			await safeExecute(() =>
				client.invoke(new Api.auth.SignIn({ phoneNumber, phoneCodeHash, phoneCode })),
			);
		} catch (err: any) {
			const mappedError = mapTelegramError(err);
			const is2faError = mappedError.code === 'SESSION_PASSWORD_NEEDED';

			if (!is2faError) throw err;

			// Fallback to 2FA password-based login using built-in helper
			if (!password2fa) {
				throw new Error(
					'Two-step verification is enabled on this account. Please provide the 2FA password.',
					{ cause: err },
				);
			}

			await invokeWithTimeout('signInWithPassword_signIn', () =>
				safeExecute(() =>
					client.signInWithPassword(
						{ apiId, apiHash },
						{
							password: async () => password2fa,
							onError: async (e) => {
								throw e;
							},
						},
					),
				),
			);
		}
		sessionString = saveSessionString(client, 'signIn');
	} catch (error) {
		logger.error(`SignIn failed: ${error}`);
		throw error;
	} finally {
		await forceCleanup(client, phoneNumber);
	}

	return [
		{
			json: {
				success: true,
				sessionString,
				apiId,
				apiHash,
				phoneNumber,
				password2fa,
				message:
					'Authentication successful. You can use this output to fill up new credentials to use all Telegram nodes.',
				note: 'IMPORTANT: Copy this whole output and save it to a text file in your local PC for backup and use in GramPro Credentials.',
			} as IDataObject,
			pairedItem: { item: i },
		},
	];
}
