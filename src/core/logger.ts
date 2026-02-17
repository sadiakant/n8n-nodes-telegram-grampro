/**
 * Simple logger utility for Telegram MTProto node
 */
const levelMap = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

type LogLevel = keyof typeof levelMap;

const resolvedLevel: LogLevel = "warn"; // Default to warn for production compliance
const currentLevel: number = levelMap[resolvedLevel];

function shouldLog(level: LogLevel) {
  return levelMap[level] <= currentLevel;
}

export const logger = {
  /**
   * Log informational messages
   * @param message The message to log
   * @param context Optional context object
   */
  info: (message: string, context?: any): void => {
    if (!shouldLog("info")) return;
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
    if (context) {
      console.log(JSON.stringify(context, null, 2));
    }
  },

  /**
   * Log warning messages
   * @param message The warning message to log
   * @param context Optional context object
   */
  warn: (message: string, context?: any): void => {
    if (!shouldLog("warn")) return;
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`);
    if (context) {
      console.warn(JSON.stringify(context, null, 2));
    }
  },

  /**
   * Log error messages
   * @param message The error message to log
   * @param context Optional context object
   */
  error: (message: string, context?: any): void => {
    if (!shouldLog("error")) return;
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`);
    if (context) {
      console.error(JSON.stringify(context, null, 2));
    }
  },

  /**
   * Log debug messages (only in development)
   * @param message The debug message to log
   * @param context Optional context object
   */
  debug: (message: string, context?: any): void => {
    if (!shouldLog('debug')) return;
    console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`);
    if (context) {
      console.debug(JSON.stringify(context, null, 2));
    }
  },
};
