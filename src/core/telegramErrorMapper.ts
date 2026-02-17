export interface TelegramErrorDetails {
  rawMessage: string;
  code: string;
  userMessage: string;
  retryAfter?: number;
  retryAfterSeconds?: number;
  retryable: boolean;
}

function extractFloodWaitSeconds(message: string): number | undefined {
  const match = message.match(/FLOOD_WAIT[_\s]*(\d+)/i) ?? message.match(/\b(\d+)\b/);
  if (!match) return undefined;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

export function mapTelegramError(error: unknown): TelegramErrorDetails {
  const rawMessage = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const normalized = rawMessage.toUpperCase();

  if (normalized.includes('AUTH_KEY_UNREGISTERED')) {
    return {
      rawMessage,
      code: 'AUTH_KEY_UNREGISTERED',
      userMessage: 'Session is invalid or expired. Please generate a new session using Auth > Complete Login.',
      retryable: false,
    };
  }

  if (normalized.includes('AUTH_KEY_DUPLICATED')) {
    return {
      rawMessage,
      code: 'AUTH_KEY_DUPLICATED',
      userMessage: 'Session is already in use from another connection. Disconnect other client(s) or use a fresh session.',
      retryable: false,
    };
  }

  if (normalized.includes('SESSION_REVOKED')) {
    return {
      rawMessage,
      code: 'SESSION_REVOKED',
      userMessage: 'Telegram revoked this session. Re-authenticate and update your Session String.',
      retryable: false,
    };
  }

  if (normalized.includes('SESSION_EXPIRED')) {
    return {
      rawMessage,
      code: 'SESSION_EXPIRED',
      userMessage: 'Session has expired. Please log in again and save the new Session String.',
      retryable: false,
    };
  }

  if (normalized.includes('PHONE_CODE_INVALID')) {
    return {
      rawMessage,
      code: 'PHONE_CODE_INVALID',
      userMessage: 'Verification code is invalid. Request a new code and try again.',
      retryable: false,
    };
  }

  if (normalized.includes('PHONE_CODE_EXPIRED')) {
    return {
      rawMessage,
      code: 'PHONE_CODE_EXPIRED',
      userMessage: 'Verification code has expired. Request a new code and retry.',
      retryable: false,
    };
  }

  if (normalized.includes('SESSION_PASSWORD_NEEDED')) {
    return {
      rawMessage,
      code: 'SESSION_PASSWORD_NEEDED',
      userMessage: 'Two-step verification is enabled. Provide your 2FA password.',
      retryable: false,
    };
  }

  if (normalized.includes('USER_DEACTIVATED_BAN')) {
    return {
      rawMessage,
      code: 'USER_DEACTIVATED_BAN',
      userMessage: 'This Telegram account is banned or deactivated.',
      retryable: false,
    };
  }

  if (normalized.includes('CHAT_WRITE_FORBIDDEN')) {
    return {
      rawMessage,
      code: 'CHAT_WRITE_FORBIDDEN',
      userMessage: 'You do not have permission to write in this chat.',
      retryable: false,
    };
  }

  if (normalized.includes('USER_BANNED_IN_CHANNEL')) {
    return {
      rawMessage,
      code: 'USER_BANNED_IN_CHANNEL',
      userMessage: 'You are banned from this channel/group.',
      retryable: false,
    };
  }

  if (normalized.includes('USER_PRIVACY_RESTRICTED')) {
    return {
      rawMessage,
      code: 'USER_PRIVACY_RESTRICTED',
      userMessage: 'Action blocked by user privacy settings.',
      retryable: false,
    };
  }

  if (normalized.includes('INPUT_USER_DEACTIVATED')) {
    return {
      rawMessage,
      code: 'INPUT_USER_DEACTIVATED',
      userMessage: 'The target user account is deactivated.',
      retryable: false,
    };
  }

  if (normalized.includes('CHANNEL_PRIVATE')) {
    return {
      rawMessage,
      code: 'CHANNEL_PRIVATE',
      userMessage: 'This channel/group is private or inaccessible to the current account.',
      retryable: false,
    };
  }

  if (normalized.includes('USERNAME_NOT_OCCUPIED')) {
    return {
      rawMessage,
      code: 'USERNAME_NOT_OCCUPIED',
      userMessage: 'Username does not exist. Check the @username and try again.',
      retryable: false,
    };
  }

  if (normalized.includes('USERNAME_INVALID')) {
    return {
      rawMessage,
      code: 'USERNAME_INVALID',
      userMessage: 'Username format is invalid. Use a valid Telegram @username.',
      retryable: false,
    };
  }

  if (normalized.includes('USERNAME_OCCUPIED')) {
    return {
      rawMessage,
      code: 'USERNAME_OCCUPIED',
      userMessage: 'Username is already taken.',
      retryable: false,
    };
  }

  if (normalized.includes('INVITE_HASH_INVALID')) {
    return {
      rawMessage,
      code: 'INVITE_HASH_INVALID',
      userMessage: 'Invite link is invalid.',
      retryable: false,
    };
  }

  if (normalized.includes('INVITE_HASH_EXPIRED')) {
    return {
      rawMessage,
      code: 'INVITE_HASH_EXPIRED',
      userMessage: 'Invite link has expired.',
      retryable: false,
    };
  }

  if (normalized.includes('CHAT_ADMIN_REQUIRED')) {
    return {
      rawMessage,
      code: 'CHAT_ADMIN_REQUIRED',
      userMessage: 'This action requires admin rights in the target chat/channel.',
      retryable: false,
    };
  }

  if (normalized.includes('CHAT_FORWARDS_RESTRICTED')) {
    return {
      rawMessage,
      code: 'CHAT_FORWARDS_RESTRICTED',
      userMessage: 'Forwarding is restricted in this chat.',
      retryable: false,
    };
  }

  if (normalized.includes('MESSAGE_ID_INVALID')) {
    return {
      rawMessage,
      code: 'MESSAGE_ID_INVALID',
      userMessage: 'Message ID is invalid or not found in the specified chat.',
      retryable: false,
    };
  }

  if (normalized.includes('PEER_ID_INVALID')) {
    return {
      rawMessage,
      code: 'PEER_ID_INVALID',
      userMessage: 'Chat/User reference is invalid. Verify chat ID, username, or invite link.',
      retryable: false,
    };
  }

  if (normalized.includes('PEER_FLOOD')) {
    return {
      rawMessage,
      code: 'PEER_FLOOD',
      userMessage: 'Telegram temporarily rate-limited this account (PEER_FLOOD). Wait and retry later.',
      retryable: true,
      retryAfter: 60,
      retryAfterSeconds: 60,
    };
  }

  if (normalized.includes('FLOOD_WAIT')) {
    const retryAfterSeconds = extractFloodWaitSeconds(rawMessage) ?? 60;
    return {
      rawMessage,
      code: 'FLOOD_WAIT',
      userMessage: `Telegram rate limit reached. Retry after ${retryAfterSeconds} seconds.`,
      retryable: true,
      retryAfter: retryAfterSeconds,
      retryAfterSeconds,
    };
  }

  if (normalized.includes('NETWORK_TIMEOUT') || normalized.includes('ETIMEDOUT')) {
    return {
      rawMessage,
      code: 'NETWORK_TIMEOUT',
      userMessage: 'Network timeout while connecting to Telegram. Please retry.',
      retryable: true,
    };
  }

  return {
    rawMessage,
    code: 'UNKNOWN',
    userMessage: rawMessage || 'Unexpected Telegram error occurred.',
    retryable: false,
  };
}
