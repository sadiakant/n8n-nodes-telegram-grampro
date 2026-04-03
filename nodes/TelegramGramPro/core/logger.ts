import { LoggerProxy, type LogMetadata } from 'n8n-workflow';
import type { TelegramLoggerContext, TelegramUnknownRecord } from './types';

const levelMap = {
	error: 0,
	warn: 1,
	info: 2,
	debug: 3,
} as const;

type LogLevel = keyof typeof levelMap;

function isLogLevel(value: string): value is LogLevel {
	return value in levelMap;
}

function resolveLogLevel(): LogLevel {
	const configuredLevel =
		process.env.GRAMPRO_LOG_LEVEL?.toLowerCase() ?? process.env.N8N_LOG_LEVEL?.toLowerCase();

	if (configuredLevel && isLogLevel(configuredLevel)) {
		return configuredLevel;
	}

	return 'warn';
}

function isMetadataRecord(value: TelegramUnknownRecord | LogMetadata): value is LogMetadata {
	return typeof value === 'object' && value !== null;
}

function normalizeContext(context?: TelegramLoggerContext): LogMetadata | undefined {
	if (!context) {
		return undefined;
	}

	if (context instanceof Error) {
		return {
			errorName: context.name,
			errorMessage: context.message,
			stack: context.stack,
		};
	}

	if (isMetadataRecord(context)) {
		return context;
	}

	return undefined;
}

function log(level: LogLevel, message: string, context?: TelegramLoggerContext): void {
	if (!shouldLog(level)) return;

	const timestampedMessage = `[${level.toUpperCase()}] ${new Date().toISOString()} - ${message}`;
	const metadata = normalizeContext(context);

	if (metadata) {
		LoggerProxy[level](timestampedMessage, metadata);
		return;
	}

	LoggerProxy[level](timestampedMessage);
}

const resolvedLevel: LogLevel = resolveLogLevel();
const currentLevel: number = levelMap[resolvedLevel];

function shouldLog(level: LogLevel): boolean {
	return levelMap[level] <= currentLevel;
}

export const logger = {
	info: (message: string, context?: TelegramLoggerContext): void => {
		log('info', message, context);
	},
	warn: (message: string, context?: TelegramLoggerContext): void => {
		log('warn', message, context);
	},
	error: (message: string, context?: TelegramLoggerContext): void => {
		log('error', message, context);
	},
	debug: (message: string, context?: TelegramLoggerContext): void => {
		log('debug', message, context);
	},
};
