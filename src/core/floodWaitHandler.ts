import { logger } from './logger';

export async function safeExecute<T>(fn: () => Promise<T>): Promise<T> {
  let retryCount = 0;
  const maxRetries = 5;
  const baseDelay = 1000; // Base delay in milliseconds

  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      retryCount++;
      const error = err as Error;

      // Handle different types of Telegram errors
      if (error.message?.includes('FLOOD_WAIT')) {
        const match = error.message.match(/\d+/);
        const seconds = match ? Number(match[0]) : 60; // Default to 60 seconds if parsing fails
        logger.warn(`Flood wait detected: sleeping for ${seconds} seconds (retry ${retryCount}/${maxRetries})`);
        
        await new Promise(r => setTimeout(r, seconds * 1000));
        continue;
      }

      // Handle AUTH_KEY_DUPLICATED errors
      if (error.message?.includes('AUTH_KEY_DUPLICATED')) {
        logger.error('Authentication key duplicated. This usually means the session is being used elsewhere.');
        throw new Error('Session is already in use. Please use a different session or wait for the other session to disconnect.');
      }

      // Handle SESSION_REVOKED errors
      if (error.message?.includes('SESSION_REVOKED')) {
        logger.error('Session has been revoked. Please re-authenticate.');
        throw new Error('Session revoked. Please re-authenticate with Telegram.');
      }

      // Handle USER_DEACTIVATED_BAN errors
      if (error.message?.includes('USER_DEACTIVATED_BAN')) {
        logger.error('User account has been banned.');
        throw new Error('Your Telegram account has been banned.');
      }

      // Handle PEER_FLOOD errors
      if (error.message?.includes('PEER_FLOOD')) {
        logger.warn(`Peer flood detected: sleeping for 60 seconds (retry ${retryCount}/${maxRetries})`);
        await new Promise(r => setTimeout(r, 60000));
        continue;
      }

      // Handle NETWORK_TIMEOUT errors
      if (error.message?.includes('NETWORK_TIMEOUT') || error.message?.includes('ETIMEDOUT')) {
        if (retryCount <= maxRetries) {
          const delay = baseDelay * Math.pow(2, retryCount - 1); // Exponential backoff
          logger.warn(`Network timeout: retrying in ${delay}ms (retry ${retryCount}/${maxRetries})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        } else {
          logger.error('Max retries exceeded for network timeout');
          throw new Error('Network timeout after multiple retries');
        }
      }

      // Handle CHAT_WRITE_FORBIDDEN errors
      if (error.message?.includes('CHAT_WRITE_FORBIDDEN')) {
        logger.error('Write access forbidden in chat');
        throw new Error('You do not have permission to write in this chat.');
      }

      // Handle USER_BANNED_IN_CHANNEL errors
      if (error.message?.includes('USER_BANNED_IN_CHANNEL')) {
        logger.error('User banned in channel');
        throw new Error('You are banned from this channel.');
      }

      // Handle INPUT_USER_DEACTIVATED errors
      if (error.message?.includes('INPUT_USER_DEACTIVATED')) {
        logger.error('User deactivated');
        throw new Error('The specified user is deactivated.');
      }

      // Handle generic errors with retry logic
      if (retryCount <= maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount - 1); // Exponential backoff
        logger.warn(`Generic error: retrying in ${delay}ms (retry ${retryCount}/${maxRetries}) - Error: ${error.message}`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // If we've exhausted all retries or it's an unrecoverable error
      logger.error(`Failed after ${retryCount} retries: ${error.message}`);
      throw error;
    }
  }
}
