# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

**Development Server:**
- `npm run dev` - Start development server with hot reload (runs Express + Vite dev server)
- `npm run build` - Build for production (Vite build + server bundle with esbuild)
- `npm run start` - Run production build

**Database Operations:**
- `npm run db:push` - Push schema changes to database using Drizzle
- `npm run check` - TypeScript type checking

## Architecture Overview

This is a full-stack video clipping application built with React + Express + TypeScript.

**Monorepo Structure:**
- `client/` - React frontend with Vite build system
- `server/` - Express.js backend with TypeScript
- `shared/` - Shared schema and types between client/server

**Key Technologies:**
- **Frontend:** React 18, Vite, Wouter routing, TanStack Query, Shadcn/UI + Tailwind CSS
- **Backend:** Express.js, Drizzle ORM with PostgreSQL, Passport.js authentication
- **Video Processing:** FFmpeg via fluent-ffmpeg, OpenAI Whisper API for transcription
- **Storage:** Cloudinary for video and asset storage

## Database Schema

The application uses Drizzle ORM with PostgreSQL. Key tables:
- `users` - User accounts with username/password authentication
- `videos` - Uploaded video metadata and processing status
- `transcripts` - AI-generated transcripts with timestamps 
- `clips` - Generated video clips with timeline boundaries
- `sessions` - Express session storage

Schema is defined in `shared/schema.ts` with Zod validation.

## Authentication System

Uses Passport.js with username/password strategy:
- Session-based authentication with PostgreSQL session store
- User registration/login endpoints in `server/auth.ts`
- `isAuthenticated` middleware protects API routes
- Frontend uses `useAuth` hook for auth state management

## Video Processing Pipeline

1. **Upload:** Direct-to-storage using signed Cloudinary uploads
2. **Processing:** FFmpeg extracts metadata and validates video format
3. **Transcription:** OpenAI Whisper API generates timestamped segments
4. **Clipping:** User selects timeline ranges, FFmpeg creates clip files
5. **Storage:** All files stored in Cloudinary with proper access controls

Key services:
- `VideoProcessingService` - FFmpeg operations and metadata extraction
- `TranscriptionService` - OpenAI Whisper API integration  
- `ObjectStorageService` - Cloudinary integration with signed uploads

## Frontend Architecture

**State Management:**
- TanStack Query for server state with caching
- React Hook Form + Zod for form validation
- Custom hooks for auth (`useAuth`)

**Key Components:**
- `Dashboard` - Main video management interface
- `VideoPlayer` - Custom video player with timeline controls
- `TranscriptPanel` - Editable transcript with timestamp sync
- `ClipManager` - Timeline-based clip creation interface

**UI Framework:**
- Shadcn/UI components built on Radix UI primitives
- Tailwind CSS with custom design system
- Dark theme support via next-themes

## Development Notes

**Port Configuration:**
- Development server runs on port specified in `PORT` env var (default 5000)
- Vite dev server proxies through Express for unified development experience

**Environment Variables Required:**
- `DATABASE_URL` - PostgreSQL connection string (Railway external URL, not internal)
- `OPENAI_API_KEY` - For video transcription service
- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret

**File Upload Limits:**
- Express configured for 50MB request limit to support video uploads
- Actual video storage uses direct-to-cloud upload URLs to bypass server limits