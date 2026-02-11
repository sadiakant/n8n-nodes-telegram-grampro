import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { LogLevel } from 'telegram/extensions/Logger';
import { logger } from './logger';
import { SessionEncryption } from './sessionEncryption';

// Store active clients
const clients = new Map<string, TelegramClient>();
// Store active connection promises to prevent race conditions (Thundering Herd)
const connectionLocks = new Map<string, Promise<TelegramClient>>();
// Store connection timestamps for cleanup
const connectionTimestamps = new Map<string, number>();
// Cleanup interval for stale connections (5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const MAX_CONNECTION_AGE = 30 * 60 * 1000; // 30 minutes

// Automatic cleanup of stale connections
setInterval(() => {
  cleanupStaleConnections();
}, CLEANUP_INTERVAL);

function cleanupStaleConnections(): void {
  const now = Date.now();
  const staleKeys: string[] = [];
  
  for (const [key, timestamp] of connectionTimestamps.entries()) {
    if (now - timestamp > MAX_CONNECTION_AGE) {
      staleKeys.push(key);
    }
  }
  
  for (const key of staleKeys) {
    connectionLocks.delete(key);
    connectionTimestamps.delete(key);
    logger.debug(`[ClientManager] Cleaned up stale connection lock: ${key}`);
  }
}

export async function getClient(apiId: number | string, apiHash: string, session: string) {
    const numericApiId = typeof apiId === 'string' ? parseInt(apiId, 10) : apiId;
    // Use a more robust key generation to prevent collisions
    const key = `${numericApiId}:${session.length > 20 ? session.substring(0, 20) : session}:${session.slice(-10)}`;

    // 1. If this client is currently connecting, wait for that specific promise
    if (connectionLocks.has(key)) {
        logger.debug(`[ClientManager] Waiting for existing connection lock for ${numericApiId}...`);
        return await connectionLocks.get(key);
    }

    // 2. Check if we have a cached client
    if (clients.has(key)) {
        const existingClient = clients.get(key)!;
        
        // Quick Health Check
        if (existingClient.connected) {
            return existingClient;
        }

        // If not connected, try to reconnect gracefully
        logger.warn(`[ClientManager] Client ${numericApiId} found but disconnected. Attempting heal...`);
        try {
            await existingClient.connect();
            return existingClient;
        } catch (e) {
            logger.error(`[ClientManager] Heal failed for ${numericApiId}. Destroying and recreating.`);
            await gracefulDestroy(existingClient);
            clients.delete(key);
        }
    }

    // 3. Create a new Connection (Protected by a Lock)
    const connectPromise = (async () => {
        logger.info(`[ClientManager] Initializing new client for ${numericApiId}...`);
        
        // Decrypt session if it's encrypted
        let decryptedSession = session;
        if (SessionEncryption.isEncryptedSession(session)) {
            try {
                // Generate encryption key from API credentials
                const crypto = require('crypto');
                const combined = `${numericApiId}:${apiHash}`;
                const encryptionKey = crypto.createHash('sha256').update(combined).digest('hex').substring(0, 32);
                
                decryptedSession = SessionEncryption.decryptSession(session, encryptionKey);
                logger.debug(`[ClientManager] Session decrypted successfully for ${numericApiId}`);
            } catch (error) {
                logger.error(`[ClientManager] Session decryption failed for ${numericApiId}: ${error}`);
                throw new Error(`Session decryption failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        
        const stringSession = new StringSession(decryptedSession);
        const client = new TelegramClient(stringSession, numericApiId, apiHash, {
            connectionRetries: 5,
            useWSS: false, // TCP is more stable for server-side n8n than WSS
            autoReconnect: true,
        });
        client.setLogLevel(LogLevel.ERROR);

        try {
            await client.connect();
            
            // 4. Validate the connection actually works (Ping)
            // We use 'getMe' as a lightweight verification that we are authorized and socket is alive
            await client.getMe();
            
            logger.info(`[ClientManager] Connection established for ${numericApiId}`);
            clients.set(key, client);
            return client;

        } catch (error) {
            logger.error(`[ClientManager] Connection failed for ${numericApiId}: ${error}`);
            await gracefulDestroy(client);
            throw error;
        } finally {
            // Remove the lock and timestamp so future requests can try again if this failed
            connectionLocks.delete(key);
            connectionTimestamps.delete(key);
        }
    })();

    // Set the lock and track timestamp
    connectionLocks.set(key, connectPromise);
    connectionTimestamps.set(key, Date.now());
    
    return await connectPromise;
}

/**
 * Forcefully destroys a client to ensure no hanging sockets
 */
async function gracefulDestroy(client: TelegramClient) {
    try {
        await client.disconnect();
        await client.destroy();
    } catch (e) { 
        // Ignore destruction errors
    }
}

/**
 * Gracefully disconnect and clean up a client
 */
export async function disconnectClient(apiId: number, session: string): Promise<void> {
    const key = `${apiId}:${session.slice(0, 10)}`;
    if (clients.has(key)) {
        const client = clients.get(key)!;
        await gracefulDestroy(client);
        clients.delete(key);
        logger.info(`[ClientManager] Manually disconnected client: ${apiId}`);
    }
}

/**
 * Clean up all clients (useful for shutdown)
 */
export async function cleanupAllClients(): Promise<void> {
    logger.info('[ClientManager] Cleaning up all Telegram clients...');
    const promises = [];
    for (const [key, client] of clients) {
        promises.push(gracefulDestroy(client));
    }
    await Promise.all(promises);
    clients.clear();
    connectionLocks.clear();
    connectionTimestamps.clear();
    logger.info('[ClientManager] Cleanup complete.');
}
