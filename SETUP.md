# Video Clipper Setup Guide

This guide helps you set up the Video Clipper application for the first time.

## Prerequisites

1. **Node.js** (version 16 or higher)
2. **PostgreSQL Database** (local or hosted like Railway/Supabase)
3. **Environment Variables** (see `.env.example`)

## Quick Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Copy the example environment file and configure your settings:
```bash
cp .env.example .env
```

Edit `.env` with your actual values:
```bash
# Database Configuration
DATABASE_URL=postgresql://username:password@host:port/database

# Security Configuration  
ENCRYPTION_KEY=<generate_with_command_below>

# External Services (configure as needed)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
OPENAI_API_KEY=sk-your_openai_key
```

**Generate Encryption Key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Database Setup
The application will automatically detect missing database tables on startup and provide instructions.

To create the database schema manually:
```bash
npm run db:push
```

### 4. Start the Application
```bash
npm run dev
```

## First Boot Process

When you start the application for the first time, it will:

1. **🔍 Check Database Connection** - Verify it can connect to PostgreSQL
2. **📋 Validate Schema** - Check if all required tables exist
3. **⚠️ Show Setup Instructions** - If tables are missing, provide setup commands
4. **🏥 Health Check** - Verify environment variables and services
5. **🚀 Start Server** - Launch with clear status messages

### What You'll See

**✅ Successful Setup:**
```
🚀 Starting Video Clipper Application...
📡 Testing database connection...
✅ Database connection successful
🔍 Checking database schema...
✅ All required tables exist
✅ All startup checks passed. Initializing server...

🎉 Video Clipper Server Started Successfully!
📡 Server running on http://localhost:5000
```

**⚠️ Schema Setup Needed:**
```
🚀 Starting Video Clipper Application...
📡 Testing database connection...
✅ Database connection successful
🔍 Checking database schema...
⚠️  Missing tables: transcript_segments, ai_model_calls
📋 Database schema needs to be deployed:
   Run: npm run db:push
   This will create the missing database tables.
```

## API Endpoints for Setup Verification

### Health Check
```bash
curl http://localhost:5000/api/chat/system/health
```

### Setup Status
```bash
curl http://localhost:5000/api/chat/system/setup
```

## Troubleshooting

### Database Connection Issues
- Verify `DATABASE_URL` is correctly formatted
- Check database server is running and accessible
- Ensure database exists and user has proper permissions

### Missing Tables
- Run `npm run db:push` to deploy schema
- Check console output for specific missing tables
- Verify Drizzle configuration in `drizzle.config.ts`

### Environment Variables
- Check `.env` file exists in project root
- Verify encryption key is 64 hex characters
- External service keys are optional but needed for full functionality

## User Credential Management

After setup, users can configure their personal API keys through the web interface:

1. **OpenAI API Key** - For transcription services
2. **OpenRouter API Key** - For AI-powered features  
3. **Cloudinary Credentials** - For personal video storage

These are stored encrypted and persist across sessions.

## Development vs Production

**Development:**
- Uses `npm run dev` with hot reload
- Environment loaded from `.env` file
- Detailed console logging

**Production:**
- Use `npm run build` then `npm run start`
- Environment from system variables or `.env`
- Production-optimized logging

---

**Need Help?** Check the console output during startup - it provides detailed information about what needs to be configured.