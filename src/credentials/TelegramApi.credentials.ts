import { ICredentialType, INodeProperties } from 'n8n-workflow';
import { SessionEncryption } from '../core/sessionEncryption';

export class TelegramApi implements ICredentialType {
  name = 'telegramApi';
  displayName = 'Telegram GramPro API';

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
      description: 'The session string obtained from the "Complete Login" operation. Paste the full string here.',
    },
  ];

  /**
   * Encrypt session string before storing
   */
  async authenticate(credentials: any): Promise<any> {
    try {
      // Generate a secure encryption key based on API credentials
      const encryptionKey = this.generateEncryptionKey(credentials.apiId, credentials.apiHash);

      // Encrypt the session string if it's not already encrypted
      if (credentials.session && !SessionEncryption.isEncryptedSession(credentials.session)) {
        credentials.session = SessionEncryption.encryptSession(credentials.session, encryptionKey);
      }

      return credentials;
    } catch (error) {
      throw new Error(`Session encryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Decrypt session string for use
   */
  async decryptSession(encryptedSession: string, apiId: number, apiHash: string): Promise<string> {
    try {
      const encryptionKey = this.generateEncryptionKey(apiId, apiHash);
      return SessionEncryption.decryptSession(encryptedSession, encryptionKey);
    } catch (error) {
      throw new Error(`Session decryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate encryption key from API credentials
   */
  private generateEncryptionKey(apiId: number, apiHash: string): string {
    const crypto = require('crypto');
    const combined = `${apiId}:${apiHash}`;
    return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 32);
  }
}
