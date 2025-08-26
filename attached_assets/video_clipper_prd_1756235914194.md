# Video Clipper Tool - Product Requirements Document

## Executive Summary

The Video Clipper Tool is a web-based application that enables users to transform long-form video content into short-form clips for social media and content creation. The tool provides video upload, transcription, timestamp-based clipping, and export capabilities in a streamlined interface.

## Project Overview

**Platform**: Replit (using Replit Agent for development)  
**Target Users**: Content creators in a private community  
**Primary Use Case**: Converting long-form videos into short-form social media content  
**Deployment**: Single-user tool with multi-access capability  
**Video Length Limit**: 1 hour maximum per upload  

## Core Technologies

- **Frontend**: React.js
- **Backend**: Node.js with Express
- **Speech-to-Text**: OpenAI Whisper API
- **Video Processing**: FFmpeg
- **Authentication**: Replit built-in authentication
- **Storage**: Replit built-in media storage
- **File Format**: MP4 input and output

## User Stories

### Primary User Stories
1. **As a content creator**, I want to upload MP4 files so that I can process long-form content
2. **As a content creator**, I want to see a full transcript of my video so that I can identify key moments
3. **As a content creator**, I want to mark clip boundaries while watching so that I can quickly select interesting segments
4. **As a content creator**, I want to input precise timestamps manually so that I can create exact clips
5. **As a content creator**, I want to export clips as MP4 files so that I can use them on social platforms
6. **As a user**, I want to securely store my API keys so that the tool can access necessary services

## Feature Specifications

### 1. Authentication & User Management
- **Requirement**: Integration with Replit's built-in authentication system
- **Functionality**: 
  - User login/logout
  - Session management
  - User-specific file storage and settings

### 2. Settings Management
- **Requirement**: Secure API key storage and configuration
- **Features**:
  - OpenAI API key input and storage
  - FFmpeg configuration options
  - Export quality settings
  - User preferences storage
- **Security**: Encrypted storage of API keys

### 3. Video Upload System
- **File Support**: MP4 format
- **Upload Method**: Drag-and-drop or file browser
- **Storage**: Replit built-in media storage
- **File Size Limits**: 1-hour maximum video length
- **File Size Validation**: Pre-upload duration check
- **Progress Indicator**: Upload progress bar with status updates

### 4. Video Player Interface
- **Core Features**:
  - HTML5 video player with standard controls (play, pause, seek, volume)
  - Timeline scrubber for precise navigation
  - Current timestamp display
  - Playback speed controls (0.5x, 1x, 1.25x, 1.5x, 2x)
- **Clipping Interface**:
  - Click-to-mark functionality for start/end points
  - Visual indicators for marked segments on timeline
  - Drag handles for adjusting clip boundaries
  - Multiple clip support with segment list

### 5. Transcription System
- **Integration**: OpenAI Whisper API
- **Processing**: Automatic transcription on video upload
- **Display**: 
  - Full transcript display alongside or below video
  - Timestamp synchronization with video playback
  - Highlighted text following current playback position
  - Clickable timestamps for video navigation
- **Editing Features**:
  - Inline text editing capability for transcript corrections
  - Save edited transcript functionality
  - Version history for transcript edits
- **Features**:
  - Search within transcript
  - Text selection to auto-create clips
  - Confidence score display (if available from Whisper)

### 6. Clip Creation Interface
- **Manual Input**:
  - Start time input field (HH:MM:SS.mmm format)
  - End time input field (HH:MM:SS.mmm format)
  - Clip name/title input
  - Preview functionality
- **Interactive Selection**:
  - Click-to-mark start point during playback
  - Click-to-mark end point during playback
  - Drag selection on timeline
  - Visual feedback for selected segments
- **Clip Management**:
  - List view of all created clips
  - Edit, rename, delete clip functionality
  - Clip preview thumbnails
  - Duration display for each clip

### 7. Video Processing & Export
- **Backend Processing**: FFmpeg integration for video clipping
- **Export Options**:
  - Quality settings (1080p, 720p, 480p)
  - Bitrate options
  - Format: MP4 output
- **Processing Queue**: 
  - Batch processing capability
  - Progress indicators for each clip
  - Download ready notifications

### 8. File Management
- **Storage Integration**: Replit built-in media storage
- **Organization**:
  - User-specific folders
  - Original video storage
  - Processed clips storage
  - File size tracking
- **Auto-Cleanup System**: 
  - 7-day retention policy for processed clips
  - Automatic deletion after retention period
  - User notifications before cleanup
  - Original video preservation (separate retention policy)
- **Download System**: Direct download links for completed clips

## Technical Requirements

### Frontend Requirements
- React.js application with modern hooks and state management
- Component-based architecture for reusability
- Real-time video synchronization with transcript
- Responsive design for desktop and tablet usage
- Drag-and-drop functionality
- Progress indicators and loading states
- Form validation and error handling

### Backend Requirements
- Node.js with Express.js framework
- RESTful API design with proper HTTP status codes
- Asynchronous video processing with job queues
- File upload handling (chunked uploads for large files)
- Automated cleanup job scheduling (7-day retention)
- Database integration for user data and clip metadata
- Error handling, logging, and monitoring
- Rate limiting for API endpoints

### Performance Requirements
- Video upload: Progress tracking with resume capability for files up to 1 hour
- Upload validation: Pre-processing duration check to enforce 1-hour limit
- Transcription: Processing time proportional to video length (estimated 1:4 ratio)
- Clipping: Sub-30 second processing for clips under 5 minutes
- Concurrent users: Support for multiple simultaneous users
- Storage cleanup: Daily automated cleanup job for expired clips

### Security Requirements
- Encrypted API key storage
- User authentication via Replit system
- File access controls (user-specific)
- Input validation and sanitization

## User Interface Specifications

### Main Dashboard
- Upload area (drag-and-drop zone)
- Recent videos list
- Quick access to settings
- Storage usage indicator

### Video Processing Interface
**Layout**: Two-panel or stacked design
- **Video Panel**: 
  - Video player with timeline
  - Playback controls
  - Clip markers and handles
- **Transcript Panel**:
  - Scrollable transcript with timestamps
  - Inline editing functionality with save/cancel options
  - Search functionality
  - Text selection tools for clip creation
- **Clip Management Sidebar**:
  - Clip list with thumbnails
  - Export controls
  - Processing status

### Settings Page
- API Configuration section
- Export preferences  
- Account information
- Storage management with cleanup settings
- Retention policy configuration

## Success Metrics

### User Experience Metrics
- Time from upload to first clip created
- Number of clips created per session
- User retention rate
- Error rate during processing

### Technical Performance Metrics
- Upload success rate
- Transcription accuracy rate
- Average processing time per minute of video
- System uptime and reliability

## Implementation Phases

### Phase 1: Core Infrastructure
- React.js frontend setup with component structure
- Node.js/Express backend with basic routing
- User authentication integration with Replit
- Settings page with API key management
- Basic file upload system with 1-hour validation

### Phase 2: Video Processing
- Whisper API integration for transcription
- Video player component with React
- FFmpeg integration for video clipping
- Basic transcript display and editing functionality

### Phase 3: Advanced Features
- Interactive clip creation interface
- Real-time transcript synchronization with video
- Batch processing capabilities
- Automated cleanup system implementation

### Phase 4: Polish & Optimization
- UI/UX improvements and responsive design
- Performance optimization for large files
- Comprehensive error handling
- Testing and bug fixes

## Constraints & Limitations

### Technical Constraints
- Replit platform limitations (storage, processing power, bandwidth)
- OpenAI API rate limits and costs
- FFmpeg processing capabilities on Replit infrastructure

### User Constraints
- Single-user tool design (no collaboration features)
- Private community access only
- Dependency on external API availability

## Risk Assessment

### High Risk
- OpenAI API costs scaling with usage
- Replit platform limitations for large file processing
- FFmpeg processing performance on cloud infrastructure

### Medium Risk
- User experience complexity with multiple interaction methods
- Storage limitations for user-generated content

### Low Risk
- Basic authentication and settings management
- Standard video player implementation

## Future Considerations

### Potential Enhancements
- Automated clip suggestions based on transcript analysis
- Social media platform-specific export presets
- Collaborative features for team workflows
- Advanced editing features (transitions, text overlays)

### Scalability Options
- Migration to dedicated hosting for performance
- Multi-user collaboration features
- API for third-party integrations