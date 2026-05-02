import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions';
import { LogLevel } from 'teleproto/extensions/Logger';
import { logger } from './logger';
import { asNodeOperationError, createNodeOperationError } from './nodeOperationError';
import { SessionEncryption } from './sessionEncryption';
import * as crypto from 'crypto';

export type ClientPurpose = 'trigger' | 'operation';

type GetClientOptions = {
	receiveUpdates?: boolean;
	cacheClient?: boolean;
	verifyAuthorization?: boolean;
	autoReconnect?: boolean;
};

// Store active clients
const clients = new Map<string, TelegramClient>();
// Store active connection promises to prevent race conditions (Thundering Herd)
const connectionLocks = new Map<string, Promise<TelegramClient>>();
// Store connection timestamps for cleanup
const connectionTimestamps = new Map<string, number>();
// Track last usage time for idle cleanup
const clientLastUsed = new Map<string, number>();
// Cleanup interval (1 minute - frequent checks for responsive cleanup)
const CLEANUP_INTERVAL = 1 * 60 * 1000;
const MAX_CONNECTION_AGE = 30 * 60 * 1000; // 30 minutes
// Keep operation-only clients short-lived so wait nodes do not leave a live
// MTProto update stream running in the background for minutes at a time.
const MAX_IDLE_AGE = 30 * 1000; // 30 seconds idle -> auto-disconnect (only for clients without event handlers)

// Automatic cleanup of stale connections
setInterval(() => {
	cleanupStaleConnections();
}, CLEANUP_INTERVAL);

function cleanupStaleConnections(): void {
	const now = Date.now();

	// 1. Clean up stale connection locks
	for (const [key, timestamp] of connectionTimestamps.entries()) {
		if (now - timestamp > MAX_CONNECTION_AGE) {
			connectionLocks.delete(key);
			connectionTimestamps.delete(key);
			logger.debug(`[ClientManager] Cleaned up stale connection lock: ${key}`);
		}
	}

	// 2. Clean up idle clients that have NO active event handlers (i.e. not used by a trigger)
	for (const [key, client] of clients.entries()) {
		const lastUsed = clientLastUsed.get(key) ?? 0;
		const isIdle = now - lastUsed > MAX_IDLE_AGE;
		const hasEventHandlers = client.listEventHandlers().length > 0;

		if (isIdle && !hasEventHandlers && !isDestroyedClient(client)) {
			logger.info(
				`[ClientManager] Auto-disconnecting idle client (no event handlers, idle ${Math.round((now - lastUsed) / 1000)}s): ${key}`,
			);
			gracefulDestroy(client).catch(() => {});
			clients.delete(key);
			clientLastUsed.delete(key);
		}
	}
}

function buildClientKey(apiId: number, session: string): string {
	// NOTE: purpose is intentionally NOT part of the key.
	// Both trigger and operations MUST share the same client to avoid
	// dual-connection issues where Telegram stops sending updates to
	// the first client when a second connects with the same session.
	return `${apiId}:${session.length > 20 ? session.substring(0, 20) : session}:${session.slice(-10)}`;
}

function isDestroyedClient(client: TelegramClient): boolean {
	return Boolean((client as TelegramClient & { _destroyed?: boolean })._destroyed);
}

async function verifyClientAuthorization(
	client: TelegramClient,
	receiveUpdates: boolean,
): Promise<void> {
	if (receiveUpdates) {
		// getMe primes Telegram's update delivery for trigger-style clients.
		await client.getMe();
		return;
	}

	const authorized = await client.checkAuthorization();
	if (!authorized) {
		throw createNodeOperationError('Telegram client is not authorized.');
	}
}

async function prepareConnectedClient(
	client: TelegramClient,
	options: { receiveUpdates: boolean; verifyAuthorization: boolean },
): Promise<void> {
	if (options.receiveUpdates) {
		// Operation-only workflows do not need missed-update recovery, and this
		// path is the one currently surfacing constructor-ID parser crashes.
		await client.catchUp?.();
	}

	if (options.verifyAuthorization) {
		await verifyClientAuthorization(client, options.receiveUpdates);
	}
}

export async function getClient(
	apiId: number | string,
	apiHash: string,
	session: string,
	options: GetClientOptions = {},
	purpose: ClientPurpose = 'operation',
): Promise<TelegramClient> {
	const numericApiId = typeof apiId === 'string' ? parseInt(apiId, 10) : apiId;
	const receiveUpdates = options.receiveUpdates ?? false;
	const cacheClient = options.cacheClient ?? true;
	const verifyAuthorization = options.verifyAuthorization ?? true;
	const autoReconnect = options.autoReconnect ?? true;
	const key = buildClientKey(numericApiId, session);

	// 1. If this client is currently connecting, wait for that specific promise
	const existingLock = cacheClient ? connectionLocks.get(key) : undefined;
	if (existingLock) {
		logger.debug(
			`[ClientManager] [${purpose}] Waiting for existing connection lock for ${numericApiId}...`,
		);
		return await existingLock;
	}

	// 2. Check if we have a cached client
	if (cacheClient && clients.has(key)) {
		const existingClient = clients.get(key)!;

		if (isDestroyedClient(existingClient)) {
			logger.warn(
				`[ClientManager] [${purpose}] Client ${numericApiId} is destroyed. Recreating cached client.`,
			);
			clients.delete(key);
			clientLastUsed.delete(key);
		} else {
			// On-demand staleness check: if client is idle and has no event handlers, destroy it
			const lastUsed = clientLastUsed.get(key) ?? 0;
			const isIdle = Date.now() - lastUsed >= MAX_IDLE_AGE;
			const hasEventHandlers = existingClient.listEventHandlers().length > 0;

			if (isIdle && !hasEventHandlers) {
				logger.info(
					`[ClientManager] [${purpose}] Client ${numericApiId} is idle (${Math.round((Date.now() - lastUsed) / 1000)}s) with no event handlers. Destroying and creating fresh client.`,
				);
				await gracefulDestroy(existingClient);
				clients.delete(key);
				clientLastUsed.delete(key);
				// Fall through to create a new client below
			} else if (existingClient.connected) {
				// Client is healthy and active - reuse it
				clientLastUsed.set(key, Date.now());
				await prepareConnectedClient(existingClient, {
					receiveUpdates,
					verifyAuthorization,
				});
				logger.debug(
					`[ClientManager] [${purpose}] Reusing existing connected client for ${numericApiId}`,
				);
				return existingClient;
			} else {
				// If not connected, try to reconnect gracefully
				logger.warn(
					`[ClientManager] [${purpose}] Client ${numericApiId} found but disconnected. Attempting heal...`,
				);
				try {
					await existingClient.connect();
					await prepareConnectedClient(existingClient, {
						receiveUpdates,
						verifyAuthorization,
					});
					clientLastUsed.set(key, Date.now());
					return existingClient;
				} catch {
					logger.error(
						`[ClientManager] [${purpose}] Heal failed for ${numericApiId}. Destroying and recreating.`,
					);
					await gracefulDestroy(existingClient);
					clients.delete(key);
					clientLastUsed.delete(key);
				}
			}
		}
	}

	// 3. Create a new Connection (Protected by a Lock)
	const connectPromise = (async () => {
		logger.info(
			`[ClientManager] [${purpose}] Initializing new client for ${numericApiId} (receiveUpdates=${receiveUpdates}, cacheClient=${cacheClient})...`,
		);

		// Decrypt session if it's encrypted
		let decryptedSession = session;
		if (SessionEncryption.isEncryptedSession(session)) {
			try {
				// Generate encryption key from API credentials
				const combined = `${numericApiId}:${apiHash}`;
				const encryptionKey = crypto
					.createHash('sha256')
					.update(combined)
					.digest('hex')
					.substring(0, 32);

				decryptedSession = SessionEncryption.decryptSession(session, encryptionKey);
				logger.debug(
					`[ClientManager] [${purpose}] Session decrypted successfully for ${numericApiId}`,
				);
			} catch (error) {
				logger.error(
					`[ClientManager] [${purpose}] Session decryption failed for ${numericApiId}: ${error}`,
				);
				const message = error instanceof Error ? error.message : String(error);
				throw createNodeOperationError(`Session decryption failed: ${message}`, { cause: error });
			}
		}

		const stringSession = new StringSession(decryptedSession);
		const client = new TelegramClient(stringSession, numericApiId, apiHash, {
			connectionRetries: 5,
			autoReconnect,
		});
		client.setLogLevel(LogLevel.ERROR);

		try {
			await client.connect();
			await prepareConnectedClient(client, {
				receiveUpdates,
				verifyAuthorization,
			});

			logger.info(`[ClientManager] [${purpose}] Connection established for ${numericApiId}`);
			if (cacheClient) {
				clients.set(key, client);
				clientLastUsed.set(key, Date.now());
			}
			return client;
		} catch (error) {
			logger.error(`[ClientManager] [${purpose}] Connection failed for ${numericApiId}: ${error}`);
			await gracefulDestroy(client);
			throw asNodeOperationError(error);
		} finally {
			// Remove the lock and timestamp so future requests can try again if this failed
			connectionLocks.delete(key);
			connectionTimestamps.delete(key);
		}
	})();

	// Set the lock and track timestamp
	if (cacheClient) {
		connectionLocks.set(key, connectPromise);
		connectionTimestamps.set(key, Date.now());
	}

	return await connectPromise;
}

/**
 * Forcefully destroys a client to ensure no hanging sockets
 */
async function gracefulDestroy(client: TelegramClient) {
	try {
		await client.disconnect();
		await client.destroy();
	} catch {
		// Ignore destruction errors
	}
}

/**
 * Gracefully disconnect and clean up a client
 */
export async function disconnectClient(
	apiId: number,
	session: string,
	purpose: ClientPurpose = 'operation',
): Promise<void> {
	const key = buildClientKey(apiId, session);
	if (clients.has(key)) {
		const client = clients.get(key)!;
		await gracefulDestroy(client);
		clients.delete(key);
		logger.info(`[ClientManager] [${purpose}] Manually disconnected client: ${apiId}`);
	}
}

/**
 * Clean up all clients (useful for shutdown)
 */
export async function cleanupAllClients(): Promise<void> {
	logger.info('[ClientManager] Cleaning up all Telegram clients...');
	const promises = [];
	for (const client of clients.values()) {
		promises.push(gracefulDestroy(client));
	}
	await Promise.all(promises);
	clients.clear();
	connectionLocks.clear();
	connectionTimestamps.clear();
	clientLastUsed.clear();
	logger.info('[ClientManager] Cleanup complete.');
}
