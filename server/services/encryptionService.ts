import crypto from 'crypto';

export class EncryptionService {
  private static readonly algorithm = 'aes-256-cbc';
  private static readonly keyLength = 32; // 256 bits
  private static readonly ivLength = 16; // 128 bits

  private static getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is required for API key encryption');
    }
    
    // Ensure key is 32 bytes (256 bits)
    return crypto.scryptSync(key, 'salt', this.keyLength);
  }

  /**
   * Encrypt sensitive data like API keys
   */
  static encrypt(text: string): string {
    if (!text) {
      return '';
    }

    try {
      const key = this.getEncryptionKey();
      const iv = crypto.randomBytes(this.ivLength);
      
      const cipher = crypto.createCipher(this.algorithm, key);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Combine iv + encrypted data
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt sensitive data like API keys
   */
  static decrypt(encryptedData: string): string {
    if (!encryptedData) {
      return '';
    }

    try {
      const key = this.getEncryptionKey();
      const parts = encryptedData.split(':');
      
      // Handle legacy format (assume it's plain text or different encryption)
      if (parts.length === 1) {
        // Check if it looks like a plain API key (starts with sk-)
        if (encryptedData.startsWith('sk-')) {
          return encryptedData; // Return as-is if it's a plain API key
        }
        
        // Try to decrypt as old format - just return empty if it fails
        try {
          const decipher = crypto.createDecipher('aes-256-cbc', key);
          let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          return decrypted;
        } catch (legacyError) {
          console.warn('Could not decrypt legacy format, treating as plain text');
          return encryptedData;
        }
      }
      
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipher(this.algorithm, key);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      // Return empty string instead of throwing to prevent authentication failures
      console.warn('Failed to decrypt API key, returning empty string');
      return '';
    }
  }

  /**
   * Generate a secure random encryption key for .env
   */
  static generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}