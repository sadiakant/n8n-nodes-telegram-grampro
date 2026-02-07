import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { LogLevel } from 'telegram/extensions/Logger';
import { logger } from './logger';

// Store active clients
const clients = new Map<string, TelegramClient>();
// Store active connection promises to prevent race conditions (Thundering Herd)
const connectionLocks = new Map<string, Promise<TelegramClient>>();

export async function getClient(apiId: number | string, apiHash: string, session: string) {
    const numericApiId = typeof apiId === 'string' ? parseInt(apiId, 10) : apiId;
    const key = `${numericApiId}:${session.slice(0, 10)}`; // Create a unique key based on ID and partial session

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
        
        const stringSession = new StringSession(session);
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
            // Remove the lock so future requests can try again if this failed
            connectionLocks.delete(key);
        }
    })();

    // Set the lock
    connectionLocks.set(key, connectPromise);
    
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
    logger.info('[ClientManager] Cleanup complete.');
}
