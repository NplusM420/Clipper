# Video Clipper

A full-stack TypeScript app for uploading long-form videos, generating transcripts with Whisper, and creating shareable clips. Built with React + Vite on the client and Express + Drizzle ORM (PostgreSQL) on the server. Uses Cloudinary for media storage and Socket.IO for real-time progress.

## Features
- Upload videos (direct or chunked for large files)
- Seamless playback of chunked videos
- Whisper-powered transcription with caching and retries
- Clip creation and processing with FFmpeg
- Session auth and per-user API key storage (encrypted)
- Real-time progress via WebSockets

## Prerequisites
- Node.js 18+
- PostgreSQL database (Neon/Supabase/Railway or local)
- Cloudinary account (for storage)
- OpenAI API key (optional - users can set in app)

## Quick Start
1. Copy env template and fill in values:
```bash
cp .env.example .env
```
Set:
- DATABASE_URL (Postgres connection string)
- ENCRYPTION_KEY (64 hex chars: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
- SESSION_SECRET (any strong string)

2. Install and build:
```bash
npm install
npm run db:push
npm run dev
```
App runs on `http://localhost:5000` (serves API and client).

## Scripts
- `npm run dev` - Start dev server (Express + Vite dev)
- `npm run build` - Build client and server bundle
- `npm start` - Start production build
- `npm run db:push` - Apply schema to database (Drizzle)

## Environment Variables
See `.env.example` for the full list. Required:
- DATABASE_URL
- ENCRYPTION_KEY (64 hex)
- CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

Optional:
- OPENAI_API_KEY (users can store in settings; this is only for startup health check)

## Architecture
- client/: React app (Vite)
- server/: Express API, sockets, services
- shared/: Drizzle schema and shared types
- migrations/: Generated SQL by Drizzle

Database: Drizzle ORM with PostgreSQL. Connection configured in `server/db.ts`. Session store uses Postgres.

Storage: Cloudinary via `server/objectStorage.ts`. The server proxies `/objects/:id` to avoid exposing cloud config to clients.

Transcription: `server/services/transcriptionService.ts` integrates Whisper with intelligent chunking and caching.

## Deployment (Railway)
- Set env vars from `.env.example` in Railway
- `railway.toml` and `nixpacks.toml` are included
- Ensure `DATABASE_URL` is external and `sslmode=require`
- Run `npm run db:push` once to create tables

## Security Notes
- Never commit `.env` files or secrets
- `ENCRYPTION_KEY` must be 64 hex chars or the server will error
- Users can add their own OpenAI key in Settings; keys are encrypted at rest

## License
MIT (see LICENSE)
