import { IExecuteFunctions } from 'n8n-workflow';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { logger } from '../../core/logger';
import { safeExecute } from '../../core/floodWaitHandler';
import { LogLevel } from 'telegram/extensions/Logger';

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
    } catch (e) {
        // We ignore errors here because we are destroying anyway
    }
}

export async function authenticationRouter(this: IExecuteFunctions, operation: string) {
    if (operation === 'requestCode') return requestCode.call(this);
    if (operation === 'signIn') return signIn.call(this);
    throw new Error(`Auth operation ${operation} not supported.`);
}

async function requestCode(this: IExecuteFunctions) {
    // Parse Int explicitly
    const rawApiId = this.getNodeParameter('apiId', 0);
    const apiId = parseInt(rawApiId as string, 10);
    
    const apiHash = this.getNodeParameter('apiHash', 0) as string;
    const phoneNumber = this.getNodeParameter('phoneNumber', 0) as string;

    const client = new TelegramClient(new StringSession(''), apiId, apiHash, { 
        connectionRetries: 1,
        useWSS: false,
        autoReconnect: false 
    });

    // Valid response placeholder
    let responseData;

    try {
        await client.connect();
        
        const result = await safeExecute(() => client.invoke(new Api.auth.SendCode({
            phoneNumber, 
            apiId, 
            apiHash,
            settings: new Api.CodeSettings({ allowAppHash: true })
        })));

        // Prepare data but DO NOT return yet
        responseData = [[{
            json: {
                success: true,
                phoneCodeHash: result.phoneCodeHash,
                preAuthSession: client.session.save(),
                apiId, 
                apiHash, 
                phoneNumber,
                note: "IMPORTANT: Check your phone for the verification code."
            }
        }]];

    } catch (error) {
        logger.error(`RequestCode failed: ${error}`);
        throw error;
    } finally {
        // Ensure cleanup happens BEFORE returning data to n8n
        await forceCleanup(client, phoneNumber);
    }
    
    return responseData;
}

async function signIn(this: IExecuteFunctions) {
    const rawApiId = this.getNodeParameter('apiId', 0);
    const apiId = parseInt(rawApiId as string, 10);

    const apiHash = this.getNodeParameter('apiHash', 0) as string;
    const phoneNumber = this.getNodeParameter('phoneNumber', 0) as string;
    const phoneCode = this.getNodeParameter('phoneCode', 0) as string;
    const phoneCodeHash = this.getNodeParameter('phoneCodeHash', 0) as string;
    const preAuthSession = this.getNodeParameter('preAuthSession', 0) as string;
    const password2fa = this.getNodeParameter('password2fa', 0, '') as string;

    const client = new TelegramClient(new StringSession(preAuthSession), apiId, apiHash, { 
        connectionRetries: 1,
        useWSS: false,
        autoReconnect: false
    });

    let responseData;

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

        responseData = [[{
            json: {
                success: true,
                sessionString: client.session.save(),
                apiId,
                apiHash,
                phoneNumber,
                password2fa,
                message: "Authentication successful. You can use this output to fill up new credentials to use all Telegram nodes.",
                note: "IMPORTANT: Copy this whole output and save it to a text file in your local PC for backup and use in GramPro Credentials."
            }
        }]];

    } catch (error) {
        logger.error(`SignIn failed: ${error}`);
        throw error;
    } finally {
        await forceCleanup(client, phoneNumber);
    }

    return responseData;
}