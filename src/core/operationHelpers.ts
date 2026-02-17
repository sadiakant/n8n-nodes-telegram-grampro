import { IExecuteFunctions } from 'n8n-workflow';
import { TelegramClient } from 'telegram';
import { getClient } from './clientManager';
import { safeExecute } from './floodWaitHandler';
import { withRateLimit } from './rateLimiter';

/**
 * Base class for Telegram operations to reduce code duplication
 */
export abstract class BaseOperation {
  protected client!: TelegramClient;

  protected context: IExecuteFunctions;
  protected operation: string;

  constructor(
    context: IExecuteFunctions,
    operation: string
  ) {
    this.context = context;
    this.operation = operation;
  }

  /**
   * Initialize the Telegram client with credentials
   */
  protected async initializeClient(): Promise<void> {
    const creds = await this.context.getCredentials('telegramApi') as any;

    if (!creds) {
      throw new Error('No Telegram credentials found');
    }

    this.client = await getClient(
      creds.apiId,
      creds.apiHash,
      creds.session
    ) as TelegramClient;
  }

  /**
   * Execute a function with rate limiting and error handling
   */
  protected async executeWithRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    return await withRateLimit(() => safeExecute(fn));
  }

  /**
   * Get a node parameter with proper typing
   */
  protected getParameter<T>(name: string, index: number = 0): T {
    return this.context.getNodeParameter(name, index) as T;
  }

  /**
   * Get a string parameter
   */
  protected getStringParameter(name: string, index: number = 0): string {
    return this.getParameter<string>(name, index);
  }

  /**
   * Get a number parameter
   */
  protected getNumberParameter(name: string, index: number = 0): number {
    return this.getParameter<number>(name, index);
  }

  /**
   * Get a boolean parameter
   */
  protected getBooleanParameter(name: string, index: number = 0): boolean {
    return this.getParameter<boolean>(name, index);
  }

  /**
   * Get an array parameter
   */
  protected getArrayParameter<T>(name: string, index: number = 0): T[] {
    return this.getParameter<T[]>(name, index);
  }

  /**
   * Validate parameters before execution
   */
  protected async validateParameters(): Promise<void> {
    // Override in subclasses for specific validation
  }

  /**
   * Execute the operation
   */
  protected abstract execute(): Promise<any>;

  /**
   * Main execution method with initialization and validation
   */
  async run(): Promise<any> {
    await this.initializeClient();
    await this.validateParameters();
    return await this.execute();
  }
}

/**
 * Common parameter extraction utilities
 */
export class ParameterExtractor {
  static extractMessageParams(context: IExecuteFunctions, index: number = 0) {
    return {
      chatId: context.getNodeParameter('chatId', index) as string,
      text: context.getNodeParameter('text', index, '') as string,
      messageId: context.getNodeParameter('messageId', index, 0) as number,
      replyTo: context.getNodeParameter('replyTo', index) as number,
      noWebpage: context.getNodeParameter('noWebpage', index, false) as boolean,
      silent: context.getNodeParameter('silent', index, false) as boolean,
    };
  }

  static extractChatParams(context: IExecuteFunctions, index: number = 0) {
    return {
      chatId: context.getNodeParameter('chatId', index) as string,
      title: context.getNodeParameter('title', index) as string,
      about: context.getNodeParameter('about', index, '') as string,
      users: context.getNodeParameter('users', index, []) as string[],
    };
  }

  static extractUserParams(context: IExecuteFunctions, index: number = 0) {
    return {
      userId: context.getNodeParameter('userId', index) as string,
      username: context.getNodeParameter('username', index) as string,
      firstName: context.getNodeParameter('firstName', index) as string,
      lastName: context.getNodeParameter('lastName', index) as string,
      bio: context.getNodeParameter('bio', index) as string,
    };
  }

  static extractMediaParams(context: IExecuteFunctions, index: number = 0) {
    return {
      chatId: context.getNodeParameter('chatId', index) as string,
      messageId: context.getNodeParameter('messageId', index) as number,
      media: context.getNodeParameter('media', index) as any,
      caption: context.getNodeParameter('caption', index, '') as string,
    };
  }
}

/**
 * Common response formatting utilities
 */
export class ResponseFormatter {
  static success(data: any, metadata?: any) {
    return [{
      json: {
        success: true,
        ...data,
        ...(metadata && { metadata })
      }
    }];
  }

  static error(message: string, error?: any) {
    return [{
      json: {
        success: false,
        error: message,
        ...(error && { details: error })
      }
    }];
  }

  static messageResult(message: any) {
    return ResponseFormatter.success({
      id: message.id,
      text: message.message,
      date: message.date,
      chatId: message.chatId?.toString(),
      fromId: message.fromId?.toString(),
    });
  }

  static userResult(user: any) {
    return ResponseFormatter.success({
      id: user.id?.toString(),
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      isBot: user.bot,
      isVerified: user.verified,
      bio: user.bio,
    });
  }

  static chatResult(chat: any) {
    return ResponseFormatter.success({
      id: chat.id?.toString(),
      title: chat.title,
      username: chat.username,
      type: chat.className?.replace('Chat', '').toLowerCase(),
      participantsCount: chat.participantsCount,
    });
  }
}
