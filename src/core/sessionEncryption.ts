import * as crypto from 'crypto';

/**
 * Session encryption utility for secure storage of Telegram sessions
 */
export class SessionEncryption {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly IV_LENGTH = 16; // 128 bits
  private static readonly TAG_LENGTH = 16; // 128 bits

  /**
   * Generate a secure encryption key from a password
   * @param password The password to derive the key from
   * @param salt Optional salt (will generate if not provided)
   * @returns The derived key as a Buffer
   */
  private static generateKey(password: string, salt?: Buffer): { key: Buffer; salt: Buffer } {
    const keySalt = salt || crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(
      password,
      keySalt,
      100000, // iterations
      this.KEY_LENGTH,
      'sha256'
    );
    return { key, salt: keySalt };
  }

  /**
   * Encrypt a session string
   * @param session The session string to encrypt
   * @param password The password to use for encryption
   * @returns The encrypted session as a base64 string
   */
  static encryptSession(session: string, password: string): string {
    try {
      const { key, salt } = this.generateKey(password);
      const iv = crypto.randomBytes(this.IV_LENGTH);
      
      const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
      let encrypted = cipher.update(session, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      // Combine salt + iv + tag + encrypted data
      const combined = Buffer.concat([
        salt,
        iv,
        tag,
        Buffer.from(encrypted, 'hex')
      ]);
      
      return combined.toString('base64');
    } catch (error) {
      throw new Error(`Session encryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Decrypt a session string
   * @param encryptedSession The encrypted session as a base64 string
   * @param password The password used for encryption
   * @returns The decrypted session string
   */
  static decryptSession(encryptedSession: string, password: string): string {
    try {
      const combined = Buffer.from(encryptedSession, 'base64');
      
      // Extract salt, iv, tag, and encrypted data
      const salt = combined.subarray(0, 16);
      const iv = combined.subarray(16, 16 + this.IV_LENGTH);
      const tag = combined.subarray(16 + this.IV_LENGTH, 16 + this.IV_LENGTH + this.TAG_LENGTH);
      const encryptedData = combined.subarray(16 + this.IV_LENGTH + this.TAG_LENGTH);
      
      const { key } = this.generateKey(password, salt);
      
      const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encryptedData, null, 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error(`Session decryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate a secure password for session encryption
   * @returns A secure random password
   */
  static generateSecurePassword(): string {
    return crypto.randomBytes(32).toString('base64');
  }

  /**
   * Check if a session string appears to be encrypted
   * @param session The session string to check
   * @returns True if the session appears to be encrypted
   */
  static isEncryptedSession(session: string): boolean {
    try {
      // Try to decode as base64
      const decoded = Buffer.from(session, 'base64');
      
      // Encrypted sessions should be longer than plain sessions
      // and have a specific structure (salt + iv + tag + data)
      return decoded.length > 100 && decoded.length % 2 === 0;
    } catch {
      return false;
    }
  }
}