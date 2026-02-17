import { logger } from './logger';

interface QueuedRequest<T = any> {
  fn: () => Promise<T>;
  resolve: (_value: T) => void; // eslint-disable-line no-unused-vars
  reject: (_error: unknown) => void; // eslint-disable-line no-unused-vars
}

/**
 * Rate limiter for Telegram API calls
 */
export class RateLimiter {
  private static instance: RateLimiter;
  private static _instance: RateLimiter | null = null;
  private static _lock: boolean = false;
  private requestQueue: QueuedRequest[];
  private isProcessing: boolean;
  private lastRequestTime: number;
  private minInterval: number; // Minimum interval between requests in milliseconds
  private maxQueueSize: number; // Maximum queue size to prevent DoS

  private constructor() {
    this.requestQueue = [];
    this.isProcessing = false;
    this.lastRequestTime = 0;
    this.minInterval = 1000; // 1 second between requests (Telegram's recommended rate)
    this.maxQueueSize = 1000; // Maximum 1000 requests in queue
  }

  /**
   * Get the singleton instance (thread-safe)
   */
  public static getInstance(): RateLimiter {
    if (!RateLimiter._instance) {
      if (!RateLimiter._lock) {
        RateLimiter._lock = true;
        if (!RateLimiter._instance) {
          RateLimiter._instance = new RateLimiter();
        }
        RateLimiter._lock = false;
      } else {
        // Busy-wait until lock is released
        while (RateLimiter._lock) { /* intentional empty block */ }
        if (!RateLimiter._instance) {
          throw new Error('Failed to initialize RateLimiter instance');
        }
      }
    }
    return RateLimiter._instance;
  }

  /**
   * Execute a function with rate limiting
   * @param fn The function to execute
   * @param priority Whether to prioritize this request (default: false)
   * @returns Promise that resolves with the function result
   */
  public async execute<T>(fn: () => Promise<T>, priority: boolean = false): Promise<T> {
    // Check if queue is full to prevent DoS
    if (this.requestQueue.length >= this.maxQueueSize) {
      throw new Error('Rate limiter queue is full. Please try again later.');
    }

    return new Promise<T>((resolve, reject) => {
      const request = { fn, resolve, reject };

      if (priority) {
        // Insert at the beginning for high priority requests
        this.requestQueue.unshift(request);
      } else {
        this.requestQueue.push(request);
      }

      this.processQueue();
    });
  }

  /**
   * Process the request queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.requestQueue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      // Wait if we need to respect the rate limit
      if (timeSinceLastRequest < this.minInterval) {
        const waitTime = this.minInterval - timeSinceLastRequest;
        logger.debug(`Rate limiting: waiting ${waitTime}ms before next request`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const request = this.requestQueue.shift();
      if (!request) break;

      try {
        this.lastRequestTime = Date.now();
        const result = await request.fn();
        request.resolve(result);
      } catch (error) {
        logger.error(`Rate limiter error: ${error}`);
        request.reject(error);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Set the minimum interval between requests
   * @param interval The interval in milliseconds
   */
  public setMinInterval(interval: number): void {
    if (interval < 100) {
      logger.warn('Minimum interval cannot be less than 100ms, using 100ms');
      this.minInterval = 100;
    } else {
      this.minInterval = interval;
    }
  }

  /**
   * Get the current queue length
   */
  public getQueueLength(): number {
    return this.requestQueue.length;
  }

  /**
   * Clear the request queue
   */
  public clearQueue(): void {
    this.requestQueue.forEach(request => {
      request.reject(new Error('Request cancelled due to queue clear'));
    });
    this.requestQueue = [];
  }
}

/**
 * Execute a function with rate limiting (convenience function)
 */
export async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const rateLimiter = RateLimiter.getInstance();
  return rateLimiter.execute(fn);
}