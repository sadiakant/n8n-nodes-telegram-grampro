import { logger } from './logger';
import { mapTelegramError } from './telegramErrorMapper';

export async function safeExecute<T>(fn: () => Promise<T>): Promise<T> {
	let retryCount = 0;
	const maxRetries = 5;
	const baseDelay = 1000; // Base delay in milliseconds
	const asError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

	while (true) {
		try {
			return await fn();
		} catch (err: unknown) {
			retryCount++;
			const error = asError(err);
			const mappedError = mapTelegramError(err);

			// Handle different types of Telegram errors
			if (mappedError.code === 'FLOOD_WAIT') {
				const seconds = mappedError.retryAfterSeconds ?? 60;
				if (retryCount <= maxRetries) {
					logger.warn(`${mappedError.userMessage} (retry ${retryCount}/${maxRetries})`);
					await new Promise((r) => setTimeout(r, seconds * 1000));
					continue;
				}
				logger.error('Max retries exceeded for FLOOD_WAIT');
				throw new Error(`${mappedError.userMessage} Max retries (${maxRetries}) exceeded.`, {
					cause: err,
				});
			}

			// Handle AUTH_KEY_DUPLICATED errors
			if (mappedError.code === 'AUTH_KEY_DUPLICATED') {
				logger.error(mappedError.userMessage);
				throw new Error(mappedError.userMessage, { cause: err });
			}

			// Handle AUTH_KEY_UNREGISTERED errors
			if (mappedError.code === 'AUTH_KEY_UNREGISTERED') {
				logger.error(mappedError.userMessage);
				throw new Error(mappedError.userMessage, { cause: err });
			}

			// Handle SESSION_REVOKED errors
			if (mappedError.code === 'SESSION_REVOKED' || mappedError.code === 'SESSION_EXPIRED') {
				logger.error(mappedError.userMessage);
				throw new Error(mappedError.userMessage, { cause: err });
			}

			// SESSION_PASSWORD_NEEDED is expected during 2FA auth flow and can be handled upstream
			if (mappedError.code === 'SESSION_PASSWORD_NEEDED') {
				throw error;
			}

			// Handle login code errors immediately (non-retriable)
			if (mappedError.code === 'PHONE_CODE_INVALID' || mappedError.code === 'PHONE_CODE_EXPIRED') {
				logger.error(mappedError.userMessage);
				throw new Error(mappedError.userMessage, { cause: err });
			}

			// Handle USER_DEACTIVATED_BAN errors
			if (mappedError.code === 'USER_DEACTIVATED_BAN') {
				logger.error(mappedError.userMessage);
				throw new Error(mappedError.userMessage, { cause: err });
			}

			// Handle PEER_FLOOD errors
			if (mappedError.code === 'PEER_FLOOD') {
				const seconds = mappedError.retryAfterSeconds ?? 60;
				if (retryCount <= maxRetries) {
					logger.warn(`${mappedError.userMessage} (retry ${retryCount}/${maxRetries})`);
					await new Promise((r) => setTimeout(r, seconds * 1000));
					continue;
				}
				logger.error('Max retries exceeded for PEER_FLOOD');
				throw new Error(`${mappedError.userMessage} Max retries (${maxRetries}) exceeded.`, {
					cause: err,
				});
			}

			// Handle NETWORK_TIMEOUT errors
			if (mappedError.code === 'NETWORK_TIMEOUT') {
				if (retryCount <= maxRetries) {
					const delay = baseDelay * Math.pow(2, retryCount - 1); // Exponential backoff
					logger.warn(
						`${mappedError.userMessage} Retrying in ${delay}ms (retry ${retryCount}/${maxRetries})`,
					);
					await new Promise((r) => setTimeout(r, delay));
					continue;
				} else {
					logger.error('Max retries exceeded for network timeout');
					throw new Error('Network timeout after multiple retries', { cause: err });
				}
			}

			// Handle CHAT_WRITE_FORBIDDEN errors
			if (mappedError.code === 'CHAT_WRITE_FORBIDDEN') {
				logger.error(mappedError.userMessage);
				throw new Error(mappedError.userMessage, { cause: err });
			}

			// Handle USER_BANNED_IN_CHANNEL errors
			if (mappedError.code === 'USER_BANNED_IN_CHANNEL') {
				logger.error(mappedError.userMessage);
				throw new Error(mappedError.userMessage, { cause: err });
			}

			// Handle INPUT_USER_DEACTIVATED errors
			if (mappedError.code === 'INPUT_USER_DEACTIVATED') {
				logger.error(mappedError.userMessage);
				throw new Error(mappedError.userMessage, { cause: err });
			}

			// Unknown/non-retryable errors should fail fast instead of silently stalling loops.
			if (mappedError.retryable && retryCount <= maxRetries) {
				const delay = baseDelay * Math.pow(2, retryCount - 1); // Exponential backoff
				logger.warn(
					`Retryable error: retrying in ${delay}ms (retry ${retryCount}/${maxRetries}) - Error: ${error.message}`,
				);
				await new Promise((r) => setTimeout(r, delay));
				continue;
			}

			logger.error(`Failed without retry: ${mappedError.userMessage}`);
			throw new Error(mappedError.userMessage, { cause: err });
		}
	}
}
