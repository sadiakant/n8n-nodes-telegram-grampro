import { ICredentialType, INodeProperties } from 'n8n-workflow';

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
      description: 'Your Telegram API ID from https://my.telegram.org',
    },

    {
      displayName: 'API Hash',
      name: 'apiHash',
      type: 'string',
      default: '',
      required: true,
      description: 'Your Telegram API Hash from https://my.telegram.org',
    },

    {
      displayName: 'Session String',
      name: 'session',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      required: true,
      description: 'Your encrypted Telegram session string',
    },

    {
      displayName: 'Mobile Number',
      name: 'phoneNumber',
      type: 'string',
      default: '',
      required: true,
      description: 'Your Telegram mobile number with country code (e.g., +1234567890)',
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

  ];
}
