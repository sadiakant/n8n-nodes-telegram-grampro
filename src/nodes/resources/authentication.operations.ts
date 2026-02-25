import {
  IExecuteFunctions,
  INodeExecutionData,
  IDataObject,
} from "n8n-workflow";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { logger } from "../../core/logger";
import { safeExecute } from "../../core/floodWaitHandler";
import { mapTelegramError } from "../../core/telegramErrorMapper";
import { LogLevel } from "telegram/extensions/Logger";

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
  if (operation === "requestCode") return requestCode.call(this, i);
  if (operation === "signIn") return signIn.call(this, i);
  throw new Error(`Auth operation ${operation} not supported.`);
}

async function requestCode(
  this: IExecuteFunctions,
  i: number,
): Promise<INodeExecutionData[]> {
  // Parse Int explicitly
  const rawApiId = this.getNodeParameter("apiId", i);
  const apiId = parseInt(rawApiId as string, 10);

  const apiHash = this.getNodeParameter("apiHash", i) as string;
  const phoneNumber = this.getNodeParameter("phoneNumber", i) as string;
  const password2fa = (this.getNodeParameter("password2fa", i, "") as string).trim();

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 1,
    useWSS: false,
    autoReconnect: false,
  });

  let phoneCodeHash: string | undefined;
  let isCodeViaApp: boolean | undefined;

  try {
    await client.connect();

    const result = (await safeExecute(() =>
      client.sendCode({ apiId, apiHash }, phoneNumber),
    )) as { phoneCodeHash: string; isCodeViaApp?: boolean };

    phoneCodeHash = result.phoneCodeHash;
    isCodeViaApp = result.isCodeViaApp;

    if (!phoneCodeHash) {
      throw new Error(
        "Failed to obtain phoneCodeHash from Telegram. Cannot continue authentication.",
      );
    }
  } catch (error) {
    logger.error(`RequestCode failed: ${error}`);
    throw error;
  } finally {
    // Ensure cleanup happens BEFORE returning data to n8n
    await forceCleanup(client, phoneNumber);
  }

  if (!phoneCodeHash) {
    throw new Error(
      "Failed to obtain phoneCodeHash from Telegram. Cannot continue authentication.",
    );
  }

  return [
    {
      json: {
        success: true,
        phoneCodeHash,
        isCodeViaApp,
        preAuthSession: client.session.save(),
        apiId,
        apiHash,
        phoneNumber,
        password2fa,
        note: "IMPORTANT: Check your phone for the verification code.",
      } as IDataObject,
      pairedItem: { item: i },
    },
  ];
}

async function signIn(
  this: IExecuteFunctions,
  i: number,
): Promise<INodeExecutionData[]> {
  const rawApiId = this.getNodeParameter("apiId", i);
  const apiId = parseInt(rawApiId as string, 10);

  const apiHash = this.getNodeParameter("apiHash", i) as string;
  const phoneNumber = this.getNodeParameter("phoneNumber", i) as string;
  const phoneCode = this.getNodeParameter("phoneCode", i) as string;
  const phoneCodeHash = this.getNodeParameter("phoneCodeHash", i) as string;
  const preAuthSession = this.getNodeParameter("preAuthSession", i) as string;
  const password2fa = (this.getNodeParameter("password2fa", i, "") as string).trim();

  const client = new TelegramClient(
    new StringSession(preAuthSession),
    apiId,
    apiHash,
    {
      connectionRetries: 1,
      useWSS: false,
      autoReconnect: false,
    },
  );

  try {
    await client.connect();
    try {
      await safeExecute(() =>
        client.invoke(
          new Api.auth.SignIn({ phoneNumber, phoneCodeHash, phoneCode }),
        ),
      );
    } catch (err: any) {
      const mappedError = mapTelegramError(err);
      const is2faError = mappedError.code === "SESSION_PASSWORD_NEEDED";

      if (!is2faError) throw err;

      // Fallback to 2FA password-based login using built-in helper
      if (!password2fa) {
        throw new Error(
          "Two-step verification is enabled on this account. Please provide the 2FA password.",
        );
      }

      await safeExecute(() =>
        client.signInWithPassword(
          { apiId, apiHash },
          { password: async () => password2fa, onError: async () => false },
        ),
      );
    }
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
        sessionString: client.session.save(),
        apiId,
        apiHash,
        phoneNumber,
        password2fa,
        message:
          "Authentication successful. You can use this output to fill up new credentials to use all Telegram nodes.",
        note: "IMPORTANT: Copy this whole output and save it to a text file in your local PC for backup and use in GramPro Credentials.",
      } as IDataObject,
      pairedItem: { item: i },
    },
  ];
}
