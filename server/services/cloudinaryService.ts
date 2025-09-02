import { db } from "../db";
import { cloudinarySettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY === 'your_64_character_hex_encryption_key_here') {
  throw new Error('ENCRYPTION_KEY environment variable must be set to a secure 64-character hex string. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}

export class CloudinaryService {
  private static instance: CloudinaryService;

  static getInstance(): CloudinaryService {
    if (!CloudinaryService.instance) {
      CloudinaryService.instance = new CloudinaryService();
    }
    return CloudinaryService.instance;
  }

  // Encrypt sensitive data
  private encryptData(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY!, 'hex'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  // Decrypt sensitive data
  private decryptData(encryptedText: string): string {
    const textParts = encryptedText.split(':');
    if (textParts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }
    const iv = Buffer.from(textParts[0], 'hex');
    const encryptedData = textParts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY!, 'hex'), iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // Save user's Cloudinary settings
  async saveUserSettings(userId: string, cloudName: string, apiKey: string, apiSecret: string): Promise<void> {
    console.log('Encrypting Cloudinary data for user:', userId);
    const encryptedCloudName = this.encryptData(cloudName);
    const encryptedApiKey = this.encryptData(apiKey);
    const encryptedApiSecret = this.encryptData(apiSecret);
    
    console.log('Inserting/updating Cloudinary settings in database...');
    const result = await db
      .insert(cloudinarySettings)
      .values({
        userId,
        cloudName: encryptedCloudName,
        apiKey: encryptedApiKey,
        apiSecret: encryptedApiSecret,
      })
      .onConflictDoUpdate({
        target: cloudinarySettings.userId,
        set: {
          cloudName: encryptedCloudName,
          apiKey: encryptedApiKey,
          apiSecret: encryptedApiSecret,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    console.log('Database operation completed, result:', result.length > 0 ? 'success' : 'no rows affected');
  }

  // Get user's Cloudinary settings
  async getUserSettings(userId: string): Promise<{ cloudName: string; apiKey: string; apiSecret: string } | null> {
    console.log('Querying database for Cloudinary settings for user:', userId);
    
    const [settings] = await db
      .select()
      .from(cloudinarySettings)
      .where(eq(cloudinarySettings.userId, userId))
      .limit(1);

    if (!settings) {
      console.log('No Cloudinary settings found in database for user:', userId);
      return null;
    }

    console.log('Found encrypted Cloudinary settings, decrypting...');
    try {
      const decrypted = {
        cloudName: this.decryptData(settings.cloudName),
        apiKey: this.decryptData(settings.apiKey),
        apiSecret: this.decryptData(settings.apiSecret),
      };
      console.log('Successfully decrypted Cloudinary settings for cloud:', decrypted.cloudName);
      return decrypted;
    } catch (error) {
      console.error('Failed to decrypt Cloudinary settings:', error);
      return null;
    }
  }

  // Get effective Cloudinary settings (user settings or environment fallback)
  async getEffectiveSettings(userId: string): Promise<{ cloudName: string; apiKey: string; apiSecret: string }> {
    // Try to get user-specific settings first
    const userSettings = await this.getUserSettings(userId);
    if (userSettings) {
      return userSettings;
    }

    // Fall back to environment variables
    const envCloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const envApiKey = process.env.CLOUDINARY_API_KEY;
    const envApiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!envCloudName || !envApiKey || !envApiSecret) {
      throw new Error('Cloudinary credentials not configured. Please set up Cloudinary settings in your user account or environment variables.');
    }

    return {
      cloudName: envCloudName,
      apiKey: envApiKey,
      apiSecret: envApiSecret,
    };
  }

  // Test Cloudinary credentials
  async testCredentials(cloudName: string, apiKey: string, apiSecret: string): Promise<boolean> {
    try {
      console.log('Testing Cloudinary credentials for cloud:', cloudName);
      
      // Save current configuration
      const currentConfig = cloudinary.config();
      console.log('Current Cloudinary config before test:', {
        cloud_name: currentConfig.cloud_name,
        api_key: currentConfig.api_key ? '***' + currentConfig.api_key.slice(-4) : 'none'
      });
      
      // Temporarily configure with test credentials
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });

      console.log('Testing with temporary config:', {
        cloud_name: cloudName,
        api_key: '***' + apiKey.slice(-4)
      });

      // Make a simple API call to test credentials - try getting usage info instead of ping
      const result = await cloudinary.api.usage();
      console.log('Cloudinary test successful, usage:', result.credits?.usage || 'N/A');
      
      // Restore original configuration
      cloudinary.config(currentConfig);
      console.log('Restored original Cloudinary configuration');
      
      return true;
    } catch (error: any) {
      console.error('Cloudinary credential test failed:', {
        message: error.message,
        code: error.error?.code,
        http_code: error.http_code,
        cloudName: cloudName,
        hasApiKey: !!apiKey,
        hasApiSecret: !!apiSecret
      });
      
      // Try to restore original configuration even if test failed
      try {
        cloudinary.config({
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          api_secret: process.env.CLOUDINARY_API_SECRET,
        });
        console.log('Restored original configuration after failed test');
      } catch (restoreError) {
        console.error('Failed to restore original configuration:', restoreError);
      }
      
      return false;
    }
  }

  // Delete user settings
  async deleteUserSettings(userId: string): Promise<void> {
    await db
      .delete(cloudinarySettings)
      .where(eq(cloudinarySettings.userId, userId));
  }
}

export const cloudinaryService = CloudinaryService.getInstance();