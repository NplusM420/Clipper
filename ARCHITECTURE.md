# Video Clipper Tool

## Overview

The Video Clipper Tool is a web-based application that enables content creators to transform long-form videos into short-form clips for social media and content creation. The tool provides video upload capabilities, AI-powered transcription using OpenAI Whisper, and precise video clipping functionality with timeline controls. Users can upload MP4 videos up to 2GB in size, view full transcripts with timestamps, mark clip boundaries through visual timeline interaction, and export clips as MP4 files.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React.js with TypeScript using Vite as the build tool
- **UI Framework**: Shadcn/UI components built on Radix UI primitives for accessibility
- **Styling**: Tailwind CSS with custom design tokens and dark theme support
- **State Management**: React Query (TanStack Query) for server state management with built-in caching and synchronization
- **Routing**: Wouter for lightweight client-side routing
- **Forms**: React Hook Form with Zod validation for type-safe form handling

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM with PostgreSQL dialect for type-safe database operations
- **Authentication**: Username/password authentication with Passport.js and session management
- **File Processing**: FFmpeg for video processing and clipping operations
- **API Design**: RESTful API endpoints with comprehensive error handling and request logging

### Data Storage Solutions
- **Primary Database**: PostgreSQL via Railway with connection pooling
- **Object Storage**: Cloudinary integration for video file storage
- **Session Storage**: PostgreSQL-backed session store using connect-pg-simple
- **Schema Management**: Drizzle migrations with schema versioning in shared directory

### Authentication and Authorization
- **Authentication Provider**: Custom username/password authentication with Passport.js
- **Session Management**: Express sessions with PostgreSQL persistence and 7-day TTL
- **API Security**: Route-level authentication middleware protecting all API endpoints
- **Object Access Control**: Custom ACL system for fine-grained file access permissions based on user ownership

### Core Business Logic
- **Video Processing Pipeline**: Multi-stage processing including upload validation, metadata extraction, transcription, and clip generation
- **Transcription Service**: OpenAI Whisper API integration with segment-level timestamps and editing capabilities
- **Clip Management**: Timeline-based clip creation with precise start/end time controls and progress tracking
- **File Upload**: Direct-to-storage uploads with presigned URLs and comprehensive validation

## External Dependencies

### Cloud Services
- **Railway Database**: PostgreSQL hosting with automatic scaling and connection pooling
- **Cloudinary**: Object storage and transformation service for video files

### Third-Party APIs
- **OpenAI Whisper API**: Speech-to-text transcription service with timestamp granularity and JSON response format
- **Cloudinary API**: Video upload, storage, and transformation service

### Core Libraries
- **Video Processing**: fluent-ffmpeg for video manipulation, clipping, and metadata extraction
- **File Upload**: Uppy dashboard for drag-and-drop file upload with progress tracking and validation
- **UI Components**: Radix UI primitives providing accessible, unstyled components for complex interactions
- **Database**: PostgreSQL via Railway with standard node-postgres connections