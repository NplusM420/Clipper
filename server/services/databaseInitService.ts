import { db, checkDatabaseConnection, pool } from '../db';
import { sql } from 'drizzle-orm';
import { PgDatabase } from 'drizzle-orm/pg-core';
import * as schema from '@shared/schema';

export interface DatabaseStatus {
  connected: boolean;
  tablesExist: boolean;
  schemaVersion: string;
  missingTables: string[];
  errors: string[];
}

export class DatabaseInitService {
  private static readonly REQUIRED_TABLES = [
    'users',
    'sessions',
    'videos',
    'video_parts',
    'transcripts',
    'clips',
    'openrouter_settings',
    'cloudinary_settings',
    'chat_sessions',
    'chat_messages',
    'ai_discovered_clips',
    'ai_model_calls'
  ];

  static async initialize(): Promise<DatabaseStatus> {
    console.log('🚀 Starting database initialization...');
    
    const status: DatabaseStatus = {
      connected: false,
      tablesExist: false,
      schemaVersion: '1.0.0',
      missingTables: [],
      errors: []
    };

    try {
      // Step 1: Test database connection
      console.log('📡 Testing database connection...');
      status.connected = await checkDatabaseConnection();
      
      if (!status.connected) {
        status.errors.push('Failed to connect to database');
        return status;
      }
      console.log('✅ Database connection successful');

      // Step 2: Check if tables exist
      console.log('🔍 Checking database schema...');
      const existingTables = await this.getExistingTables();
      status.missingTables = this.REQUIRED_TABLES.filter(
        table => !existingTables.includes(table)
      );

      if (status.missingTables.length === 0) {
        console.log('✅ All required tables exist');
        status.tablesExist = true;
      } else {
        console.log(`⚠️  Missing tables: ${status.missingTables.join(', ')}`);
        
        // Step 3: Provide instructions for schema deployment
        console.log('📋 Database schema needs to be deployed:');
        console.log('   Run: npm run db:push');
        console.log('   This will create the missing database tables.');
        console.log('');
        console.log('   The server will continue with limited functionality.');
        console.log('   Some features may not work until tables are created.');
        
        status.errors.push(`Missing database tables: ${status.missingTables.join(', ')}. Run 'npm run db:push' to deploy schema.`);
        
        // Allow server to start but with warnings
        status.tablesExist = false;
      }

      // Step 4: Validate schema integrity
      if (status.tablesExist) {
        console.log('🔍 Validating schema integrity...');
        const integrityCheck = await this.validateSchemaIntegrity();
        if (!integrityCheck.valid) {
          status.errors.push(...integrityCheck.errors);
        } else {
          console.log('✅ Schema integrity validated');
        }
      }

      console.log('🎉 Database initialization complete!');
      return status;

    } catch (error: any) {
      console.error('❌ Database initialization failed:', error);
      status.errors.push(`Initialization error: ${error.message}`);
      return status;
    }
  }

  private static async getExistingTables(): Promise<string[]> {
    try {
      const result = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      `);
      
      return result.rows.map((row: any) => row.table_name);
    } catch (error) {
      console.error('Error getting existing tables:', error);
      return [];
    }
  }

  private static async deploySchema(): Promise<void> {
    try {
      console.log('⚠️  Database schema needs deployment.');
      console.log('📋 Please run: npm run db:push');
      console.log('   This will create the missing database tables.');
      console.log('   Then restart the server.');
      
      // For now, we'll allow the server to start with warnings
      // but users should run the migration manually
      throw new Error('Database schema deployment required. Please run: npm run db:push');
      
    } catch (error: any) {
      console.error('Schema deployment failed:', error);
      throw new Error(`Database schema needs manual deployment. Run: npm run db:push`);
    }
  }

  private static async validateSchemaIntegrity(): Promise<{valid: boolean, errors: string[]}> {
    const errors: string[] = [];

    try {
      // Test basic operations on each critical table
      await db.execute(sql`SELECT 1 FROM users LIMIT 1`);
      await db.execute(sql`SELECT 1 FROM videos LIMIT 1`);
      await db.execute(sql`SELECT 1 FROM openrouter_settings LIMIT 1`);
      await db.execute(sql`SELECT 1 FROM cloudinary_settings LIMIT 1`);
      
      // Check for required columns (basic validation)
      const userColumns = await db.execute(sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND table_schema = 'public'
      `);
      
      const requiredUserColumns = ['id', 'username', 'email', 'openai_api_key'];
      const existingUserColumns = userColumns.rows.map((row: any) => row.column_name);
      const missingUserColumns = requiredUserColumns.filter(col => !existingUserColumns.includes(col));
      
      if (missingUserColumns.length > 0) {
        errors.push(`Missing user columns: ${missingUserColumns.join(', ')}`);
      }

    } catch (error: any) {
      errors.push(`Schema validation error: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Startup health check for services
  static async performStartupHealthCheck(): Promise<{
    database: boolean;
    encryption: boolean;
    environment: boolean;
    services: Record<string, boolean>;
    warnings: string[];
  }> {
    console.log('🏥 Performing startup health check...');
    
    const health = {
      database: false,
      encryption: false,
      environment: false,
      services: {
        cloudinary: false,
        openai: false,
        websocket: true // Always available
      },
      warnings: [] as string[]
    };

    // Database health
    health.database = await checkDatabaseConnection();

    // Environment variables health
    const requiredEnvVars = ['DATABASE_URL', 'ENCRYPTION_KEY'];
    const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);
    
    if (missingEnvVars.length === 0) {
      health.environment = true;
    } else {
      health.warnings.push(`Missing environment variables: ${missingEnvVars.join(', ')}`);
    }

    // Encryption health
    try {
      const encryptionKey = process.env.ENCRYPTION_KEY;
      if (encryptionKey && encryptionKey !== 'your_64_character_hex_encryption_key_here') {
        // Test that the key is valid hex and correct length
        const keyBuffer = Buffer.from(encryptionKey, 'hex');
        if (keyBuffer.length === 32) {
          health.encryption = true;
        } else {
          health.warnings.push('Encryption key should be 64 hex characters (32 bytes)');
        }
      } else {
        health.warnings.push('Encryption key not properly configured');
      }
    } catch (error) {
      health.warnings.push('Invalid encryption key format');
    }

    // Service availability (basic checks)
    const cloudinaryVars = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
    health.services.cloudinary = cloudinaryVars.every(key => process.env[key]);

    if (process.env.OPENAI_API_KEY) {
      health.services.openai = true;
    }

    // Log results
    const overallHealth = health.database && health.environment && health.encryption;
    if (overallHealth) {
      console.log('✅ Startup health check passed');
    } else {
      console.log('⚠️  Startup health check completed with warnings');
    }

    if (health.warnings.length > 0) {
      console.log('📋 Health warnings:');
      health.warnings.forEach(warning => console.log(`  • ${warning}`));
    }

    return health;
  }
}