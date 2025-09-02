import crypto from 'crypto';

export class EncryptionService {
  private static readonly algorithm = 'aes-256-cbc';
  private static readonly keyLength = 32; // 256 bits
  private static readonly ivLength = 16; // 128 bits

  private static getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key || key === 'your_64_character_hex_encryption_key_here') {
      throw new Error('ENCRYPTION_KEY environment variable must be set to a secure 64-character hex string. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    }
    
    // Convert hex string to buffer (32 bytes for 256-bit key)
    return Buffer.from(key, 'hex');
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
      
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      
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
        
        // Try to decrypt as old format using old method temporarily
        try {
          // Use the old scrypt-based key for legacy data
          const legacyKey = crypto.scryptSync(process.env.ENCRYPTION_KEY!, 'salt', 32);
          const decipher = crypto.createDecipher('aes-256-cbc', legacyKey);
          let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          console.log('Successfully decrypted legacy format OpenAI key');
          return decrypted;
        } catch (legacyError: any) {
          console.warn('Could not decrypt legacy format:', legacyError.message);
          // If it's a valid API key format, return as-is (might be unencrypted)
          if (encryptedData.startsWith('sk-') && encryptedData.length > 20) {
            console.log('Treating as unencrypted API key');
            return encryptedData;
          }
          return '';
        }
      }
      
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      
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