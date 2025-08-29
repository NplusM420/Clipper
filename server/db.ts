import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import { config } from 'dotenv';
import * as schema from "@shared/schema";

// Load environment variables
config();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Please check your .env file and ensure it contains a valid DATABASE_URL.",
  );
}

export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Allow self-signed certificates for Railway
  },
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 60000, // Close idle clients after 60 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
  statement_timeout: 30000, // Cancel any statement that takes over 30 seconds
  query_timeout: 30000, // Cancel any query that takes over 30 seconds
});

export const db = drizzle(pool, { schema });

// Database connection health check
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  }
}

// Handle pool errors gracefully
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

pool.on('connect', (client) => {
  console.log('New database client connected');
});

// Cleanup on process exit
process.on('exit', () => {
  pool.end();
});

process.on('SIGTERM', () => {
  pool.end(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  pool.end(() => {
    process.exit(0);
  });
});
