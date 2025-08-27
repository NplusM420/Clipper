import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load environment variables
config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not found. Please check your .env file.");
}

// Debug: Log the hostname to help identify the issue
const dbUrl = new URL(process.env.DATABASE_URL);
console.log(`Connecting to database host: ${dbUrl.hostname}`);

if (dbUrl.hostname.includes('railway.internal')) {
  throw new Error(
    "You're using Railway's internal connection string. " +
    "Please use the external connection string from Railway's 'Public Networking' section. " +
    "It should look like: postgresql://postgres:password@containers-us-west-xxx.railway.app:5432/railway"
  );
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Allow self-signed certificates for Railway
    }
  },
});
