# Windows Setup Guide for Video Clipper

This guide helps you set up the Video Clipper application on Windows, addressing common npm installation issues.

## Prerequisites

- Node.js 18+ installed
- Git installed
- PostgreSQL database access
- Administrator privileges for initial setup

## Quick Setup (Using Batch Scripts)

### 1. Initial Setup
```cmd
# Open Command Prompt as Administrator
# Navigate to the project directory
cd "D:\Clients\AI Layer Labs\Demos\ClipperBuild\Clipper_fresh"

# Run cleanup if you have installation issues
windows-cleanup.bat

# Install dependencies
windows-install.bat

# Start development server
windows-dev.bat
```

## Manual Setup (If Batch Scripts Fail)

### 1. Clean Previous Installation
```cmd
# Stop any running Node processes
taskkill /f /im node.exe
taskkill /f /im npm.exe

# Remove problematic directories
rmdir /s /q node_modules
del /f /q package-lock.json

# Clear npm cache
npm cache clean --force
```

### 2. Configure npm for Windows
```cmd
npm config set fund false
npm config set audit false
npm config set prefer-offline true
npm config set cache-min 3600
```

### 3. Install Dependencies
Try these commands in order until one succeeds:

```cmd
# Option 1: Standard install with Windows flags
npm install --no-optional --legacy-peer-deps --prefer-offline

# Option 2: Force install if option 1 fails
npm install --force --no-optional --legacy-peer-deps

# Option 3: Use Yarn if npm completely fails
npm install -g yarn
yarn install --ignore-optional --ignore-engines
```

### 4. Start Development Server
Try these commands in order:

```cmd
# Option 1: Standard dev command
npm run dev

# Option 2: Windows-specific dev command
npm run dev:win

# Option 3: Direct tsx execution
npm run dev:direct

# Option 4: Manual tsx command
npx tsx server/index.ts
```

## Environment Configuration

### 1. Copy Environment Variables
```cmd
copy .env.example .env
```

### 2. Edit .env file with your values:
```env
# Database Configuration
DATABASE_URL=postgresql://postgres:password@localhost:5432/video_clipper

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Security Configuration (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY=your_64_character_hex_encryption_key_here

# Server Configuration
PORT=5000
NODE_ENV=development
```

### 3. Generate Encryption Key
Run this command to generate a secure encryption key:
```cmd
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy the output and paste it as your `ENCRYPTION_KEY` value.

## Database Setup

### 1. Push Database Schema
```cmd
npm run db:push
```

## Troubleshooting

### Permission Issues
- Run Command Prompt as Administrator
- Disable antivirus temporarily during installation
- Ensure no editors or processes are locking files

### Module Resolution Issues
```cmd
# Clear module cache
npm cache clean --force

# Update npm itself
npm install -g npm@latest

# Try different Node.js version if issues persist
```

### Port Already in Use
```cmd
# Find process using port 5000
netstat -ano | findstr :5000

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

### Database Connection Issues
- Ensure PostgreSQL is running
- Check DATABASE_URL format
- Test connection manually

## Available Scripts

- `npm run dev` - Start development server (Linux/Mac style)
- `npm run dev:win` - Start development server (Windows style)
- `npm run dev:direct` - Direct tsx execution
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run check` - TypeScript type checking
- `npm run db:push` - Push database schema changes

## Success Indicators

When setup is successful, you should see:
```
[dotenv] injecting env (X) from .env
serving on port 5000 with WebSocket support
```

## Getting Help

If you encounter issues:
1. Check the error logs in Command Prompt
2. Verify all environment variables are set
3. Ensure database is accessible
4. Try the manual setup steps
5. Contact support with specific error messages

## Security Notes

- Never commit your `.env` file to version control
- Keep your `ENCRYPTION_KEY` secure and unique
- Use strong database passwords
- Regularly update dependencies for security patches