// Shared constants for Video Clipper platform

export const LIMITS = {
  // File size limits
  MAX_VIDEO_SIZE: 2 * 1024 * 1024 * 1024, // 2GB
  
  // Duration limits (in seconds)
  MAX_VIDEO_DURATION: 3600, // 1 hour
  
  // Polling intervals (in milliseconds)
  PROCESSING_POLL_INTERVAL: 5000, // 5 seconds
} as const;

export const FOLDERS = {
  // Cloudinary folder structure
  BASE: 'video-clipper',
  UPLOADS: 'video-clipper/uploads',
  VIDEOS: 'video-clipper/videos', 
  CLIPS: 'video-clipper/clips',
} as const;

export const VIDEO_QUALITIES = {
  "1080p": { width: 1920, height: 1080, videoBitrate: "5000k" },
  "720p": { width: 1280, height: 720, videoBitrate: "3000k" },
  "480p": { width: 854, height: 480, videoBitrate: "1500k" },
} as const;

export const CACHE = {
  // Cache control headers
  MAX_AGE: 3600, // 1 hour
} as const;