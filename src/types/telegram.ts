import { TelegramClient } from 'telegram';
import { Api } from 'telegram';

/**
 * Telegram entity types
 */
export type TelegramEntity = Api.User | Api.Chat | Api.Channel;

/**
 * Message types for different operations
 */
export interface TelegramMessage {
  id: number;
  text: string;
  date: Date;
  fromId?: string;
  chatId?: string;
  replyToId?: number;
  isOutgoing: boolean;
  direction: 'sent' | 'received';
  mediaType?: string;
}

/**
 * Chat types
 */
export interface TelegramChat {
  id: string;
  title?: string;
  username?: string;
  type: 'user' | 'chat' | 'channel';
  participantsCount?: number;
  isCreator?: boolean;
  isPublic?: boolean;
}

/**
 * User types
 */
export interface TelegramUser {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isBot?: boolean;
  isVerified?: boolean;
  isScam?: boolean;
  bio?: string;
  commonChatsCount?: number;
}

/**
 * Media types
 */
export interface TelegramMedia {
  id: string;
  type: 'photo' | 'video' | 'document' | 'audio' | 'sticker';
  fileName?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
}

/**
 * Channel participant types
 */
export interface ChannelParticipant {
  userId: string;
  role: 'creator' | 'admin' | 'member';
  isAdmin: boolean;
  isCreator: boolean;
  inviterId?: string;
  invitedAt?: Date;
}

/**
 * Poll types
 */
export interface TelegramPoll {
  id: string;
  question: string;
  options: string[];
  isQuiz: boolean;
  isAnonymous: boolean;
  correctAnswerIndex?: number;
  totalVoters?: number;
}

/**
 * Session types
 */
export interface TelegramSession {
  sessionString: string;
  apiId: number;
  apiHash: string;
  phoneNumber?: string;
  isEncrypted: boolean;
}

/**
 * Error types
 */
export interface TelegramError {
  code: string;
  message: string;
  retryable: boolean;
  retryAfter?: number;
}

/**
 * Client configuration
 */
export interface TelegramClientConfig {
  apiId: number;
  apiHash: string;
  session: string;
  useWSS?: boolean;
  connectionRetries?: number;
  autoReconnect?: boolean;
  connectTimeout?: number;
}

/**
 * Operation result types
 */
export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: TelegramError;
  metadata?: {
    timestamp: Date;
    operation: string;
    chatId?: string;
    messageId?: number;
  };
}

/**
 * Message sending options
 */
export interface SendMessageOptions {
  chatId: string;
  text: string;
  replyTo?: number;
  noWebpage?: boolean;
  silent?: boolean;
  scheduleDate?: Date;
}

/**
 * Message editing options
 */
export interface EditMessageOptions {
  chatId: string;
  messageId: number;
  text: string;
  noWebpage?: boolean;
}

/**
 * Message deletion options
 */
export interface DeleteMessageOptions {
  chatId: string;
  messageId: number;
  revoke: boolean;
}

/**
 * Message pinning options
 */
export interface PinMessageOptions {
  chatId: string;
  messageId: number;
  notify: boolean;
}

/**
 * Poll creation options
 */
export interface CreatePollOptions {
  chatId: string;
  question: string;
  options: string[];
  isQuiz: boolean;
  isAnonymous: boolean;
  correctAnswerIndex?: number;
}

/**
 * Chat creation options
 */
export interface CreateChatOptions {
  title: string;
  about?: string;
  users: string[];
}

/**
 * Channel creation options
 */
export interface CreateChannelOptions {
  title: string;
  about?: string;
  isBroadcast?: boolean;
  isPublic?: boolean;
  username?: string;
}

/**
 * User lookup options
 */
export interface UserLookupOptions {
  userId: string;
  includeFullInfo?: boolean;
}

/**
 * History fetching options
 */
export interface HistoryOptions {
  chatId: string;
  limit: number;
  offset?: number;
  minId?: number;
  maxId?: number;
}

/**
 * Participant fetching options
 */
export interface ParticipantsOptions {
  channelId: string;
  limit: number;
  offset?: number;
  filter?: 'admins' | 'kicked' | 'banned' | 'recent' | 'search';
  query?: string;
}

/**
 * Client manager interface
 */
export interface IClientManager {
  getClient(apiId: number, apiHash: string, session: string): Promise<TelegramClient>;
  disconnectClient(apiId: number, session: string): Promise<void>;
  cleanupAllClients(): Promise<void>;
  isClientConnected(client: TelegramClient): Promise<boolean>;
}