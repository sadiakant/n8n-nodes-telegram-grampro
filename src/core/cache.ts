/**
 * Simple in-memory cache for frequently accessed Telegram data
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

export class CacheManager {
  private cache = new Map<string, CacheEntry<any>>();
  private maxSize = 1000; // Maximum number of cache entries
  private defaultTTL = 5 * 60 * 1000; // 5 minutes default TTL
  private static _instance: CacheManager | null = null;
  private static _lock: boolean = false;

  private constructor() { }

  /**
   * Get the singleton instance (thread-safe)
   */
  public static getInstance(): CacheManager {
    if (!CacheManager._instance) {
      if (!CacheManager._lock) {
        CacheManager._lock = true;
        if (!CacheManager._instance) {
          CacheManager._instance = new CacheManager();
        }
        CacheManager._lock = false;
      } else {
        // Busy-wait until lock is released
        while (CacheManager._lock) { /* intentional empty block */ }
        if (!CacheManager._instance) {
          throw new Error('Failed to initialize CacheManager instance');
        }
      }
    }
    return CacheManager._instance;
  }

  /**
   * Set a value in cache
   */
  set<T>(key: string, value: T, ttl: number = this.defaultTTL): void {
    // Clean up expired entries if cache is getting full
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }

    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Get a value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Check if a key exists in cache
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Set maximum cache size
   */
  setMaxSize(size: number): void {
    this.maxSize = size;
    // Clean up if we're over the new limit
    if (this.cache.size > this.maxSize) {
      this.cleanup();
    }
  }

  /**
   * Set default TTL for new entries
   */
  setDefaultTTL(ttl: number): void {
    this.defaultTTL = ttl;
  }
}

// Create a singleton instance
export const cache = CacheManager.getInstance();

/**
 * Cache key generator for common operations
 */
export class CacheKeys {
  static getUser(userId: string): string {
    return `user:${userId}`;
  }

  static getChat(chatId: string): string {
    return `chat:${chatId}`;
  }

  static getChannel(channelId: string): string {
    return `channel:${channelId}`;
  }

  static getChatMembers(channelId: string, limit: number): string {
    return `chatMembers:${channelId}:${limit}`;
  }

  static getDialogs(limit: number): string {
    return `dialogs:${limit}`;
  }
}