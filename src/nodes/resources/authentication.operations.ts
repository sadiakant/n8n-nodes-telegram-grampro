import { IExecuteFunctions } from 'n8n-workflow';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { logger } from '../../core/logger';
import { safeExecute } from '../../core/floodWaitHandler';

/**
 * HELPER: Forcefully destroys connection to prevent background timeouts
 */
async function forceCleanup(client: TelegramClient, phone: string) {
    if (!client) return;
    try {
        await client.disconnect();
        await client.destroy();
        logger.info(`Cleanly disconnected auth client: ${phone}`);
    } catch (e) {
        logger.warn(`Cleanup warning: ${e}`);
    }
}

export async function authenticationRouter(this: IExecuteFunctions, operation: string) {
    if (operation === 'requestCode') return requestCode.call(this);
    if (operation === 'signIn') return signIn.call(this);
    throw new Error(`Auth operation ${operation} not supported.`);
}

async function requestCode(this: IExecuteFunctions) {
    // This ensures the value is a Number type at runtime
    const apiId = Number(this.getNodeParameter('apiId', 0));
    const apiHash = this.getNodeParameter('apiHash', 0) as string;
    const phoneNumber = this.getNodeParameter('phoneNumber', 0) as string;

    const client = new TelegramClient(new StringSession(''), apiId, apiHash, { 
        connectionRetries: 5,
        useWSS: false 
    });

    try {
        await client.connect();
        const result = await safeExecute(() => client.invoke(new Api.auth.SendCode({
            phoneNumber, apiId, apiHash,
            settings: new Api.CodeSettings({ allowAppHash: true })
        })));

        return [[{
            json: {
                success: true,
                phoneCodeHash: result.phoneCodeHash,
                preAuthSession: client.session.save(),
                apiId, apiHash, phoneNumber,
                note: "IMPORTANT: Check your phone for the verification code. You will need this code along with the phoneCodeHash and preAuthSession to complete the sign-in process."
            }
        }]];
    } finally {
        await forceCleanup(client, phoneNumber);
    }
}

async function signIn(this: IExecuteFunctions) {
    // This ensures the value is a Number type at runtime
    const apiId = Number(this.getNodeParameter('apiId', 0));
    const apiHash = this.getNodeParameter('apiHash', 0) as string;
    const phoneNumber = this.getNodeParameter('phoneNumber', 0) as string;
    const phoneCode = this.getNodeParameter('phoneCode', 0) as string;
    const phoneCodeHash = this.getNodeParameter('phoneCodeHash', 0) as string;
    const preAuthSession = this.getNodeParameter('preAuthSession', 0) as string;
    const password2fa = this.getNodeParameter('password2fa', 0, '') as string;

    const client = new TelegramClient(new StringSession(preAuthSession), apiId, apiHash, { 
        connectionRetries: 5,
        useWSS: false
    });

    try {
        await client.connect();
        let result;
        try {
            result = await safeExecute(() => client.invoke(new Api.auth.SignIn({ phoneNumber, phoneCodeHash, phoneCode })));
        } catch (err: any) {
            if (!err.message.includes('SESSION_PASSWORD_NEEDED')) throw err;
            
            const pwdObj = await safeExecute(() => client.invoke(new Api.account.GetPassword()));
            const crypto = require('crypto');
            const passwordHash = crypto.pbkdf2Sync(password2fa, pwdObj.currentSalt, 100000, 256, 'sha512');
            result = await safeExecute(() => client.invoke(new Api.auth.CheckPassword({ password: passwordHash })));
        }

        return [[{
            json: {
                success: true,
                sessionString: client.session.save(),
                apiId,
                apiHash,
                phoneNumber,
                password2fa,
                message: "Authentication successful. You can use this output to fill up new credentials to use all Telegram nodes.",
                note: "IMPORTANT: Copy this whole output and save it to a text file in your local PC for backup and future use."
            }
        }]];
    } finally {
        await forceCleanup(client, phoneNumber);
    }
}