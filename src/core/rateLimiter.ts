import { logger } from './logger';

/**
 * Rate limiter for Telegram API calls
 */
export class RateLimiter {
  private static instance: RateLimiter;
  private requestQueue: Array<{ fn: () => Promise<any>; resolve: (value: any) => void; reject: (error: any) => void }>;
  private isProcessing: boolean;
  private lastRequestTime: number;
  private minInterval: number; // Minimum interval between requests in milliseconds

  private constructor() {
    this.requestQueue = [];
    this.isProcessing = false;
    this.lastRequestTime = 0;
    this.minInterval = 1000; // 1 second between requests (Telegram's recommended rate)
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  /**
   * Execute a function with rate limiting
   * @param fn The function to execute
   * @param priority Whether to prioritize this request (default: false)
   * @returns Promise that resolves with the function result
   */
  public async execute<T>(fn: () => Promise<T>, priority: boolean = false): Promise<T> {
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
 * Decorator for rate limiting methods
 */
export function rateLimit(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value;
  const rateLimiter = RateLimiter.getInstance();

  descriptor.value = async function (...args: any[]) {
    return rateLimiter.execute(() => method.apply(this, args));
  };

  return descriptor;
}

/**
 * Execute a function with rate limiting (convenience function)
 */
export async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const rateLimiter = RateLimiter.getInstance();
  return rateLimiter.execute(fn);
}