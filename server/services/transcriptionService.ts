// Fix for OpenAI library File upload compatibility
import { File } from "node:buffer";
if (!globalThis.File) {
  globalThis.File = File as any;
}

import OpenAI from "openai";
import { storage } from "../storage";
import fs from "fs";
import path from "path";
import { ObjectStorageService } from "../objectStorage";
import fetch from "node-fetch";
import ffmpeg from "fluent-ffmpeg";
import { transcripts, videos } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { RateLimiter } from "limiter";
import { createHash } from "crypto";
import NodeCache from "node-cache";

// Progress tracking interfaces
interface TranscriptionProgress {
  stage: 'initializing' | 'audio_extraction' | 'language_detection' | 'chunking' | 'uploading' | 'transcribing' | 'processing' | 'finalizing' | 'cache_hit' | 'whisper_transcription' | 'transcription_complete';
  progress: number; // 0-100
  message: string;
  estimatedTimeRemaining?: number;
  currentFile?: string;
  currentChunk?: number;
  totalChunks?: number;
  detectedLanguage?: string;
  estimatedTime?: number;
  language?: string;
  confidence?: number;
  fingerprint?: string;
  audioInfo?: {
    duration: number;
    sizeMB: number;
    compressionRatio?: number;
  };
}

// Audio fingerprint interface
interface AudioFingerprint {
  hash: string;
  duration: number;
  sizeMB: number;
  transcriptId?: string;
  language?: string;
  confidence?: number;
  segments?: any[];
  createdAt: number;
}

export class TranscriptionError extends Error {
  constructor(
    message: string,
    public code: 'FFMPEG_ERROR' | 'WHISPER_ERROR' | 'STORAGE_ERROR' | 'NETWORK_ERROR' | 'FILE_SIZE_ERROR' | 'DATABASE_ERROR' | 'PARTIAL_SUCCESS',
    public originalError?: Error
  ) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

export class WhisperError extends TranscriptionError {
  constructor(message: string, public whisperCode: string, originalError?: Error) {
    super(message, 'WHISPER_ERROR', originalError);
    this.name = 'WhisperError';
  }
}

export class TranscriptionService {
  private openai: OpenAI;
  private readonly WHISPER_SIZE_LIMIT_MB = 25; // OpenAI Whisper API limit
  private readonly PROCESSING_BUFFER_MB = 5; // Safety buffer for processing
  private rateLimiter: RateLimiter; // Rate limiter for Whisper API
  private progressCallback?: (videoId: string, progress: TranscriptionProgress) => void;
  private keepaliveInterval?: NodeJS.Timeout; // Database connection keepalive for long operations
  private static transcriptCache = new NodeCache({ 
    stdTTL: 86400, // 24 hours
    checkperiod: 3600, // Check for expired keys every hour
    maxKeys: 1000 // Maximum 1000 cached transcripts
  });

  constructor(apiKey: string) {
    this.openai = new OpenAI({ 
      apiKey,
      timeout: 120000,    // 2-minute timeout for long transcriptions
      maxRetries: 3,      // Automatic retries for transient failures
      baseURL: "https://api.openai.com/v1" // Explicit base URL
    });
    
    // Initialize rate limiter: 45 requests per minute (leaving buffer under 50 limit)
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 45,
      interval: 'minute'
    });
  }

  async testApiKey(): Promise<boolean> {
    try {
      await this.openai.models.list();
      return true;
    } catch (error) {
      console.error("OpenAI API key test failed:", error);
      return false;
    }
  }

  /**
   * Get audio duration using FFmpeg
   */
  private async getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) {
          console.error('Error getting audio duration:', err);
          reject(err);
        } else {
          const duration = metadata.format.duration || 0;
          resolve(duration);
        }
      });
    });
  }

  /**
   * Generate audio fingerprint for caching with fallback
   */
  private async generateAudioFingerprint(audioPath: string): Promise<AudioFingerprint> {
    try {
      const stats = fs.statSync(audioPath);
      const duration = await this.getAudioDuration(audioPath);
      
      // Create hash based on file content and metadata using Node.js built-in crypto
      const fileBuffer = fs.readFileSync(audioPath);
      const contentHash = createHash('sha256').update(fileBuffer).digest('hex');
      const metadataHash = createHash('sha256').update(`${stats.size}-${duration}-${stats.mtime.getTime()}`).digest('hex');
      const combinedHash = createHash('sha256').update(contentHash + metadataHash).digest('hex');
      
      return {
        hash: combinedHash,
        duration,
        sizeMB: stats.size / (1024 * 1024),
        createdAt: Date.now()
      };
    } catch (error) {
      console.warn('⚠️ Audio fingerprinting failed, using fallback method:', error);
      
      // Fallback: Use simpler hash based on file stats only
      const stats = fs.statSync(audioPath);
      const duration = await this.getAudioDuration(audioPath);
      const fallbackHash = createHash('sha256')
        .update(`${audioPath}-${stats.size}-${duration}-${stats.mtime.getTime()}`)
        .digest('hex');
      
      return {
        hash: fallbackHash,
        duration,
        sizeMB: stats.size / (1024 * 1024),
        createdAt: Date.now()
      };
    }
  }

  /**
   * Check cache for existing transcription
   */
  private checkTranscriptCache(audioFingerprint: AudioFingerprint): any[] | null {
    const cacheKey = `transcript:${audioFingerprint.hash}`;
    const cached = TranscriptionService.transcriptCache.get<any[]>(cacheKey);
    
    if (cached) {
      console.log(`🎯 Cache hit for audio fingerprint: ${audioFingerprint.hash.substring(0, 16)}...`);
      return cached;
    }
    
    return null;
  }

  /**
   * Store transcription in cache
   */
  private storeTranscriptCache(audioFingerprint: AudioFingerprint, segments: any[], language?: string, confidence?: number): void {
    const cacheKey = `transcript:${audioFingerprint.hash}`;
    
    const cacheData = {
      segments,
      language,
      confidence,
      fingerprint: audioFingerprint,
      cachedAt: Date.now()
    };
    
    TranscriptionService.transcriptCache.set(cacheKey, segments);
    console.log(`💾 Cached transcription for fingerprint: ${audioFingerprint.hash.substring(0, 16)}... (${segments.length} segments)`);
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { keys: number; hits: number; misses: number; ksize: number; vsize: number } {
    return TranscriptionService.transcriptCache.getStats();
  }

  /**
   * Clear transcript cache
   */
  static clearCache(): void {
    TranscriptionService.transcriptCache.flushAll();
    console.log(`🧹 Transcript cache cleared`);
  }

  /**
   * Set progress callback for real-time updates
   */
  setProgressCallback(callback: (videoId: string, progress: TranscriptionProgress) => void): void {
    this.progressCallback = callback;
  }

  /**
   * Start database keepalive to prevent connection timeouts during long operations
   */
  private startKeepalive(): void {
    this.stopKeepalive(); // Clear any existing keepalive
    
    console.log("🔄 Starting database keepalive for long-running transcription...");
    
    this.keepaliveInterval = setInterval(async () => {
      try {
        const { checkDatabaseConnection } = await import("../db");
        const isHealthy = await checkDatabaseConnection();
        if (isHealthy) {
          console.log("💓 Database connection keepalive successful");
        } else {
          console.warn("⚠️ Database connection keepalive failed - connection may be unhealthy");
        }
      } catch (error) {
        console.error("❌ Database keepalive check failed:", error);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop database keepalive
   */
  private stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = undefined;
      console.log("🛑 Stopped database keepalive");
    }
  }

  /**
   * Emit progress update
   */
  private emitProgress(videoId: string, progress: TranscriptionProgress): void {
    if (this.progressCallback) {
      this.progressCallback(videoId, progress);
    }
  }

  async transcribeVideo(videoId: string, userId: string): Promise<void> {
    const startTime = Date.now();
    
    // Start database keepalive for long-running operation
    this.startKeepalive();
    
    try {
      // Update status to processing
      await storage.updateVideoTranscriptionStatus(videoId, "processing");
      
      this.emitProgress(videoId, {
        stage: 'initializing',
        progress: 5,
        message: 'Initializing transcription process...'
      });

      // Get video info
      const video = await storage.getVideo(videoId);
      if (!video) {
        throw new Error("Video not found");
      }

      // Get user for API key validation
      const user = await storage.getUser(userId);
      if (!user?.openaiApiKey) {
        throw new Error("OpenAI API key not configured");
      }

      let allSegments: any[] = [];

      if (video.isChunked) {
        console.log(`🎬 Transcribing chunked video: ${video.filename} (${video.totalChunks} parts)`);
        this.emitProgress(videoId, {
          stage: 'audio_extraction',
          progress: 15,
          message: `Processing chunked video (${video.totalChunks} parts)...`,
          totalChunks: video.totalChunks || undefined
        });
        allSegments = await this.transcribeChunkedVideo(videoId, userId);
      } else {
        console.log(`🎬 Transcribing complete video: ${video.filename}`);
        this.emitProgress(videoId, {
          stage: 'audio_extraction',
          progress: 15,
          message: 'Extracting audio from video...'
        });
        allSegments = await this.transcribeCompleteVideo(videoId, userId);
      }

      // Calculate overall confidence
      const overallConfidence = allSegments.length > 0 
        ? allSegments.reduce((sum, seg) => sum + (seg.confidence || 0), 0) / allSegments.length
        : 0;

      // Save transcript and update video status in a transaction
      this.emitProgress(videoId, {
        stage: 'finalizing',
        progress: 95,
        message: 'Saving transcript to database...'
      });
      
      try {
        await this.saveTranscriptWithTransaction(videoId, allSegments, overallConfidence);
      } catch (dbError) {
        console.error("💥 Transaction failed, attempting fallback status update...", dbError);
        
        // Fallback: At least try to update the transcription status separately
        try {
          await storage.updateVideoTranscriptionStatus(videoId, "completed");
          console.log("✅ Fallback status update successful");
          
          // Also emit progress to notify frontend
          this.emitProgress(videoId, {
            stage: 'transcription_complete',
            progress: 100,
            message: `Transcription completed with ${allSegments.length} segments (status updated, transcript save failed)`
          });
          
          throw new TranscriptionError(
            `Transcription completed but transcript storage failed. Video marked as completed.`,
            'PARTIAL_SUCCESS',
            dbError instanceof Error ? dbError : undefined
          );
        } catch (statusError) {
          console.error("💥 Fallback status update also failed:", statusError);
          throw dbError; // Re-throw original error
        }
      }
      
      const elapsedTime = (Date.now() - startTime) / 1000;
      this.emitProgress(videoId, {
        stage: 'transcription_complete',
        progress: 100,
        message: `Transcription completed in ${elapsedTime.toFixed(1)}s with ${allSegments.length} segments`
      });
      
      console.log(`✅ Transcription completed: ${allSegments.length} segments total in ${elapsedTime.toFixed(1)}s`)

    } catch (error) {
      console.error("Transcription error:", error);
      await storage.updateVideoTranscriptionStatus(videoId, "error");
      
      // Re-throw as specific TranscriptionError if not already one
      if (error instanceof TranscriptionError) {
        throw error;
      } else if (error instanceof Error) {
        // Categorize the error based on its message/type
        if (error.message.includes('FFmpeg') || error.message.includes('audio extraction')) {
          throw new TranscriptionError(`Audio processing failed: ${error.message}`, 'FFMPEG_ERROR', error);
        } else if (error.message.includes('Whisper') || error.message.includes('transcription')) {
          throw new TranscriptionError(`Speech-to-text failed: ${error.message}`, 'WHISPER_ERROR', error);
        } else if (error.message.includes('database') || error.message.includes('storage')) {
          throw new TranscriptionError(`Storage operation failed: ${error.message}`, 'STORAGE_ERROR', error);
        } else if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('download')) {
          throw new TranscriptionError(`Network operation failed: ${error.message}`, 'NETWORK_ERROR', error);
        } else {
          throw new TranscriptionError(`Transcription failed: ${error.message}`, 'WHISPER_ERROR', error);
        }
      } else {
        throw new TranscriptionError('Unknown transcription error occurred', 'WHISPER_ERROR');
      }
    } finally {
      // Always stop the keepalive when transcription completes (success or failure)
      this.stopKeepalive();
    }
  }

  private extractPublicIdFromPath(originalPath: string): string {
    // If it's already a Cloudinary public ID, return as is
    if (!originalPath.includes('/') && !originalPath.includes('http')) {
      return originalPath;
    }
    
    // If it's a URL, extract the public ID
    if (originalPath.includes('cloudinary.com')) {
      const urlParts = originalPath.split('/');
      const filename = urlParts[urlParts.length - 1];
      return filename.split('.')[0]; // Remove file extension
    }
    
    // If it's a path like /objects/something, extract the ID
    if (originalPath.startsWith('/objects/')) {
      return originalPath.replace('/objects/', '');
    }
    
    // Default: assume it's already a public ID
    return originalPath;
  }

  async updateTranscript(transcriptId: string, segments: any[]): Promise<void> {
    await storage.updateTranscript(transcriptId, segments, true);
  }

  async getTranscriptByVideoId(videoId: string): Promise<any> {
    const [transcript] = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.videoId, videoId))
      .limit(1);

    return transcript || null;
  }

  /**
   * Transcribe a chunked video by reassembling audio from all parts
   */
  private async transcribeChunkedVideo(videoId: string, userId: string): Promise<any[]> {
    // Get video metadata and video parts
    const video = await storage.getVideo(videoId);
    if (!video) {
      throw new Error("Video not found");
    }
    
    const videoParts = await storage.getVideoParts(videoId);
    if (!videoParts || videoParts.length === 0) {
      throw new Error("No video parts found for chunked video");
    }

    console.log(`📹 Found ${videoParts.length} video parts to transcribe`);
    
    const objectStorage = new ObjectStorageService();
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const audioSegmentPaths: string[] = [];
    
    try {
      // Extract audio from each video part
      for (let i = 0; i < videoParts.length; i++) {
        const part = videoParts[i];
        console.log(`🔄 Processing part ${i + 1}/${videoParts.length} (${part.startTime}s - ${part.endTime}s)`);
        
        try {
          // Generate URL for this video part
          const videoUrl = objectStorage.generateUrl(part.cloudinaryPublicId, {
            resource_type: 'video',
            secure: true
          });

          // Download and extract audio from this part
          const audioPath = await this.downloadAndExtractAudio(videoUrl, `${videoId}_part_${i}`);
          audioSegmentPaths.push(audioPath);
          
          console.log(`✅ Part ${i + 1} audio extracted`);
        } catch (error) {
          console.error(`❌ Failed to extract audio from part ${i + 1}:`, error);
          // Continue with other parts
        }
      }

      if (audioSegmentPaths.length === 0) {
        throw new Error("No audio segments could be extracted from video parts");
      }

      // Process each audio segment individually to respect Whisper's 25MB limit
      // and maintain proper ordering
      const allSegments: any[] = [];
      
      for (let i = 0; i < audioSegmentPaths.length; i++) {
        const audioPath = audioSegmentPaths[i];
        const part = videoParts[i];
        
        console.log(`🎤 Transcribing audio segment ${i + 1}/${audioSegmentPaths.length}`);
        
        // Check file size before transcription
        const stats = fs.statSync(audioPath);
        const fileSizeMB = stats.size / (1024 * 1024);
        
        if (fileSizeMB > 20) {
          console.warn(`⚠️ Audio segment ${i + 1} is ${fileSizeMB.toFixed(2)}MB, splitting further...`);
          
          // Split this audio segment if it's too large  
          const segmentSegments = await this.transcribeLargeAudioFile(audioPath, part.startTime);
          
          // Add part identification (time offset already applied in transcribeLargeAudioFile)
          const offsetSegments = segmentSegments.map(segment => ({
            ...segment,
            id: `part_${i}_${segment.id}`,
            partIndex: i
          }));
          
          allSegments.push(...offsetSegments);
        } else {
          console.log(`✅ Audio segment ${i + 1} is ${fileSizeMB.toFixed(2)}MB, transcribing directly`);
          
          // Transcribe directly with time offset
          const partSegments = await this.transcribeAudioFile(audioPath, part.startTime, video);
          
          // Add part identification
          const offsetSegments = partSegments.map(segment => ({
            ...segment,
            id: `part_${i}_${segment.id}`,
            partIndex: i
          }));
          
          allSegments.push(...offsetSegments);
        }
        
        console.log(`✅ Audio segment ${i + 1} transcribed successfully`);
      }

      console.log(`🔄 Sorting ${allSegments.length} segments by timestamp...`);
      const sortedSegments = allSegments.sort((a, b) => a.start - b.start);
      
      console.log(`✅ Chunked transcription complete: ${sortedSegments.length} total segments`);
      return sortedSegments;
      
    } finally {
      // Guaranteed cleanup of all temporary files
      for (const audioPath of audioSegmentPaths) {
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
      }
    }
  }

  /**
   * Transcribe a complete (non-chunked) video
   */
  private async transcribeCompleteVideo(videoId: string, userId: string): Promise<any[]> {
    const video = await storage.getVideo(videoId);
    if (!video) {
      throw new Error("Video not found");
    }

    const objectStorage = new ObjectStorageService();
    
    // Generate video URL
    const videoUrl = await this.findVideoUrl(video.originalPath, objectStorage);
    
    // Download and convert to audio
    const audioPath = await this.downloadAndExtractAudio(videoUrl, videoId);
    
    try {
      // Check if audio file is too large for Whisper (25MB limit)
      const stats = fs.statSync(audioPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      let segments: any[] = [];
      
      const maxSizeMB = this.WHISPER_SIZE_LIMIT_MB - this.PROCESSING_BUFFER_MB;
      
      if (fileSizeMB > maxSizeMB) {
        console.log(`⚠️ Audio file is ${fileSizeMB.toFixed(2)}MB, splitting for Whisper API`);
        segments = await this.transcribeLargeAudioFile(audioPath, 0, video);
      } else {
        console.log(`✅ Audio file is ${fileSizeMB.toFixed(2)}MB, transcribing directly`);
        
        // Optimize the audio file for best quality-to-size ratio
        const optimizedPath = await this.optimizeAudioForWhisper(audioPath, maxSizeMB);
        const isOptimized = optimizedPath !== audioPath;
        
        try {
          segments = await this.transcribeAudioFile(optimizedPath, 0, video);
        } finally {
          // Clean up optimized file if it was created
          if (isOptimized && fs.existsSync(optimizedPath)) {
            fs.unlinkSync(optimizedPath);
          }
        }
      }
      
      return segments;
    } finally {
      // Guaranteed cleanup
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    }
  }

  /**
   * Download video and extract audio for transcription
   */
  private async downloadAndExtractAudio(videoUrl: string, identifier: string): Promise<string> {
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const videoPath = path.join(tempDir, `video_${identifier}.mp4`);
    const audioPath = path.join(tempDir, `audio_${identifier}.wav`);

    try {
      // Download video
      console.log(`⬇️ Downloading video for audio extraction...`);
      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error(`Failed to download video: ${response.statusText}`);
      }
      
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(videoPath, buffer);

      // Extract audio using FFmpeg
      console.log(`🎵 Extracting audio from video...`);
      await this.extractAudioWithFFmpeg(videoPath, audioPath);
      
      // Clean up video file
      if (fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      return audioPath;
    } catch (error) {
      // Clean up on error
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      throw error;
    }
  }

  /**
   * Extract audio from video using FFmpeg
   */
  private async extractAudioWithFFmpeg(videoPath: string, audioPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .format('wav')
        .audioCodec('pcm_s24le')  // 24-bit depth for better quality
        .audioChannels(1)
        .audioFrequency(22050)    // Higher sample rate for better Whisper accuracy
        .audioFilters([
          'volume=1.2',           // Slight volume boost for clarity
          'highpass=f=80',        // Remove low-frequency noise
          'lowpass=f=8000'        // Remove high-frequency noise above speech range
        ])
        .noVideo()
        .output(audioPath)
        .on('start', (cmd: string) => {
          console.log(`🚀 FFmpeg audio extraction started: ${cmd}`);
        })
        .on('end', () => {
          console.log(`✅ Audio extraction completed: ${audioPath}`);
          resolve();
        })
        .on('error', (err: any) => {
          console.error(`❌ FFmpeg audio extraction error:`, err);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Transcribe an audio file with Whisper
   */
  private async transcribeAudioFile(audioPath: string, timeOffset: number = 0, videoMetadata?: any): Promise<any[]> {
    console.log(`🎤 Transcribing audio file: ${path.basename(audioPath)}`);
    
    try {
      // Generate audio fingerprint for caching (with fallback if it fails)
      let audioFingerprint: AudioFingerprint | null = null;
      let cachedSegments: any[] | null = null;
      
      try {
        audioFingerprint = await this.generateAudioFingerprint(audioPath);
        console.log(`🔍 Generated fingerprint: ${audioFingerprint.hash.substring(0, 16)}... (${audioFingerprint.sizeMB.toFixed(2)}MB, ${audioFingerprint.duration.toFixed(1)}s)`);
        
        // Check cache first
        cachedSegments = this.checkTranscriptCache(audioFingerprint);
      } catch (fingerprintError) {
        console.warn(`⚠️ Fingerprinting failed, proceeding without caching:`, fingerprintError);
        audioFingerprint = null;
        cachedSegments = null;
      }
      
      if (cachedSegments && audioFingerprint) {
        console.log(`💡 Using cached transcription (${cachedSegments.length} segments)`);
        
        // Apply time offset to cached segments
        const offsetSegments = cachedSegments.map(segment => ({
          ...segment,
          start: segment.start - (segment.originalOffset || 0) + timeOffset,
          end: segment.end - (segment.originalOffset || 0) + timeOffset,
          originalOffset: timeOffset
        }));
        
        // Update progress for cache hit
        if (this.progressCallback) {
          this.progressCallback(videoMetadata?.id || 'unknown', {
            stage: 'cache_hit',
            progress: 100,
            message: `Used cached transcription (${cachedSegments.length} segments)`,
            fingerprint: audioFingerprint?.hash.substring(0, 16)
          });
        }
        
        return offsetSegments;
      }
      
      console.log(`🔥 Cache miss - proceeding with API transcription`);
      
      // Update progress for API call
      if (this.progressCallback) {
        this.progressCallback(videoMetadata?.id || 'unknown', {
          stage: 'language_detection',
          progress: 20,
          message: `Detecting language for ${path.basename(audioPath)}...`
        });
      }
      
      // Detect language for optimization
      const language = await this.detectLanguage(audioPath);
      
      // Generate context-aware prompt
      const prompt = this.generateContextPrompt(language, videoMetadata);
      
      // Update progress for transcription
      if (this.progressCallback) {
        this.progressCallback(videoMetadata?.id || 'unknown', {
          stage: 'whisper_transcription',
          progress: 50,
          message: `Transcribing ${path.basename(audioPath)} (${language})...`,
          estimatedTime: audioFingerprint ? Math.round(audioFingerprint.duration * 0.3) : undefined // Whisper is ~0.3x audio duration
        });
      }
      
      // Wait for rate limit availability for main transcription
      await this.rateLimiter.removeTokens(1);
      console.log(`⏱️ Rate limit check passed for transcription`);
      
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: "whisper-1",
        language: language,
        prompt: prompt,
        response_format: "verbose_json",
        timestamp_granularities: ["word", "segment"], // Enhanced precision
        temperature: 0.0, // Deterministic results for consistency
      });
      
      const segments = this.processTranscriptionSegments(transcription, timeOffset);
      
      // Store in cache for future use (only if fingerprinting worked)
      if (audioFingerprint) {
        const cacheSegments = segments.map(segment => ({
          ...segment,
          originalOffset: timeOffset
        }));
        
        // Calculate average confidence from segments
        const avgConfidence = segments.reduce((acc, s) => acc + (s.confidence || 0), 0) / segments.length;
        
        try {
          this.storeTranscriptCache(
            audioFingerprint, 
            cacheSegments, 
            language, 
            avgConfidence
          );
        } catch (cacheError) {
          console.warn(`⚠️ Failed to store transcript in cache:`, cacheError);
        }
      } else {
        console.log(`⚠️ Skipping cache storage due to fingerprinting failure`);
      }
      
      // Calculate average confidence for progress reporting  
      const progressConfidence = segments.reduce((acc, s) => acc + (s.confidence || 0), 0) / segments.length;
      
      // Update progress for completion
      if (this.progressCallback) {
        this.progressCallback(videoMetadata?.id || 'unknown', {
          stage: 'transcription_complete',
          progress: 100,
          message: `Transcribed ${segments.length} segments successfully`,
          language,
          confidence: progressConfidence
        });
      }
      
      return segments;
    } catch (error: any) {
      // Handle Whisper-specific errors
      if (error.status === 429) {
        throw new WhisperError('Whisper API rate limit exceeded', 'RATE_LIMIT', error);
      } else if (error.status === 400) {
        throw new WhisperError('Invalid audio format for Whisper', 'INVALID_FORMAT', error);
      } else if (error.status === 413) {
        throw new WhisperError('Audio file too large for Whisper API', 'FILE_TOO_LARGE', error);
      } else if (error.status === 401) {
        throw new WhisperError('Invalid OpenAI API key', 'INVALID_API_KEY', error);
      } else if (error.status >= 500) {
        throw new WhisperError('Whisper API server error', 'SERVER_ERROR', error);
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new WhisperError('Network error connecting to Whisper API', 'NETWORK_ERROR', error);
      }
      
      throw new WhisperError('Unknown Whisper API error', 'UNKNOWN', error);
    }
  }
  
  private processTranscriptionSegments(transcription: any, timeOffset: number): any[] {
    // Process segments and apply time offset
    const segments = transcription.segments?.map((segment: any, index: number) => ({
      id: `segment_${timeOffset}_${index}`,
      start: segment.start + timeOffset,
      end: segment.end + timeOffset,
      text: segment.text.trim(),
      confidence: segment.avg_logprob ? Math.exp(segment.avg_logprob) : undefined,
      language: transcription.language,
    })) || [];

    console.log(`✅ Transcribed ${segments.length} segments with ${timeOffset}s offset`);
    return segments;
  }

  /**
   * Detect language of audio file for optimization
   */
  private async detectLanguage(audioPath: string): Promise<string> {
    console.log(`🔍 Detecting language for: ${path.basename(audioPath)}`);
    
    try {
      // Wait for rate limit availability
      await this.rateLimiter.removeTokens(1);
      console.log(`⏱️ Rate limit check passed for language detection`);
      
      const quickTranscription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: "whisper-1",
        response_format: "json"
      });
      
      const detectedLanguage = (quickTranscription as any).language || 'en';
      console.log(`🌐 Detected language: ${detectedLanguage}`);
      return detectedLanguage;
    } catch (error) {
      console.warn(`⚠️ Language detection failed, defaulting to English:`, error);
      return 'en'; // Default to English if detection fails
    }
  }

  /**
   * Generate context-aware prompts for better transcription accuracy
   */
  private generateContextPrompt(language: string, videoMetadata?: any): string {
    const basePrompts: Record<string, string> = {
      'en': "This is a video about software development, video editing, or technical content. The audio may contain technical terminology, code snippets, programming languages, and software tool names.",
      'es': "Este es un video sobre desarrollo de software, edición de video o contenido técnico. El audio puede contener terminología técnica, fragmentos de código y nombres de herramientas de software.",
      'fr': "Il s'agit d'une vidéo sur le développement logiciel, le montage vidéo ou le contenu technique. L'audio peut contenir une terminologie technique, des extraits de code et des noms d'outils logiciels.",
      'de': "Dies ist ein Video über Softwareentwicklung, Videobearbeitung oder technische Inhalte. Das Audio kann technische Terminologie, Code-Schnipsel und Software-Tool-Namen enthalten.",
      'it': "Questo è un video su sviluppo software, editing video o contenuti tecnici. L'audio può contenere terminologia tecnica, frammenti di codice e nomi di strumenti software.",
      'pt': "Este é um vídeo sobre desenvolvimento de software, edição de vídeo ou conteúdo técnico. O áudio pode conter terminologia técnica, trechos de código e nomes de ferramentas de software.",
      'ja': "これはソフトウェア開発、ビデオ編集、または技術的なコンテンツに関するビデオです。音声には専門用語、コードスニペット、ソフトウェアツール名が含まれる可能性があります。",
      'ko': "이것은 소프트웨어 개발, 비디오 편집 또는 기술 컨텐츠에 관한 비디오입니다. 오디오에는 기술 용어, 코드 조각, 소프트웨어 도구 이름이 포함될 수 있습니다.",
      'zh': "这是一个关于软件开发、视频编辑或技术内容的视频。音频可能包含技术术语、代码片段和软件工具名称。"
    };
    
    const basePrompt = basePrompts[language] || basePrompts['en'];
    
    // Add video-specific context if available
    if (videoMetadata?.filename) {
      const filename = videoMetadata.filename.toLowerCase();
      if (filename.includes('tutorial') || filename.includes('lesson')) {
        return basePrompt + " This is an educational tutorial with step-by-step instructions.";
      } else if (filename.includes('demo') || filename.includes('showcase')) {
        return basePrompt + " This is a demonstration or showcase of software features.";
      } else if (filename.includes('review') || filename.includes('analysis')) {
        return basePrompt + " This is a review or analysis of software tools or techniques.";
      }
    }
    
    return basePrompt;
  }

  /**
   * Detect silence breaks in audio for intelligent chunking
   */
  private async detectSilenceBreaks(audioPath: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const silenceBreaks: number[] = [];
      let stderrOutput = '';
      
      ffmpeg(audioPath)
        .audioFilters([
          'silencedetect=noise=-35dB:duration=2' // Detect 2-second silences at -35dB threshold
        ])
        .format('null')
        .output('-')
        .on('start', (cmd: string) => {
          console.log(`🔍 Starting silence detection: ${cmd}`);
        })
        .on('stderr', (stderrLine: string) => {
          stderrOutput += stderrLine + '\n';
          
          // Parse silence detection output
          const silenceStartMatch = stderrLine.match(/silence_start: ([\d.]+)/);
          const silenceEndMatch = stderrLine.match(/silence_end: ([\d.]+)/);
          
          if (silenceEndMatch) {
            const silenceEndTime = parseFloat(silenceEndMatch[1]);
            if (!isNaN(silenceEndTime) && silenceEndTime > 5) { // Ignore very early silences
              silenceBreaks.push(silenceEndTime);
            }
          }
        })
        .on('end', () => {
          console.log(`✅ Silence detection complete: ${silenceBreaks.length} breaks found`);
          resolve(silenceBreaks);
        })
        .on('error', (err: any) => {
          console.error(`❌ Silence detection failed:`, err);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Create intelligent chunks based on silence breaks
   */
  private async createIntelligentChunks(
    audioPath: string, 
    silenceBreaks: number[], 
    tempDir: string, 
    baseName: string
  ): Promise<{ path: string; startTime: number; endTime: number }[]> {
    
    // Get total audio duration
    const audioDuration = await this.getAudioDuration(audioPath);
    
    // Create chunks with optimal sizing
    const chunks: { path: string; startTime: number; endTime: number }[] = [];
    const targetChunkDuration = 480; // 8 minutes target (leaves room for variation)
    const maxChunkDuration = 720; // 12 minutes maximum
    
    let currentStart = 0;
    let chunkIndex = 0;
    
    while (currentStart < audioDuration) {
      let chunkEnd = currentStart + targetChunkDuration;
      
      // Find the best silence break near our target end time
      if (chunkEnd < audioDuration) {
        const idealEnd = chunkEnd;
        const searchWindow = 120; // 2-minute search window
        
        const candidateBreaks = silenceBreaks.filter(breakTime => 
          breakTime >= idealEnd - searchWindow && 
          breakTime <= idealEnd + searchWindow &&
          breakTime <= audioDuration
        );
        
        if (candidateBreaks.length > 0) {
          // Choose the break closest to our ideal end time
          chunkEnd = candidateBreaks.reduce((closest, current) => 
            Math.abs(current - idealEnd) < Math.abs(closest - idealEnd) ? current : closest
          );
        } else {
          // No good silence break, but don't exceed max duration
          chunkEnd = Math.min(currentStart + maxChunkDuration, audioDuration);
        }
      } else {
        chunkEnd = audioDuration;
      }
      
      // Create the chunk file
      const chunkPath = path.join(tempDir, `${baseName}_intelligent_chunk_${chunkIndex}.wav`);
      
      await new Promise<void>((resolve, reject) => {
        ffmpeg(audioPath)
          .seekInput(currentStart)
          .duration(chunkEnd - currentStart)
          .format('wav')
          .audioCodec('pcm_s24le')
          .audioFilters([
            'afade=t=in:ss=0:d=0.5', // Fade in
            `afade=t=out:st=${chunkEnd - currentStart - 0.5}:d=0.5` // Fade out
          ])
          .output(chunkPath)
          .on('end', () => resolve())
          .on('error', (err: any) => reject(err))
          .run();
      });
      
      chunks.push({
        path: chunkPath,
        startTime: currentStart,
        endTime: chunkEnd
      });
      
      console.log(`📁 Created intelligent chunk ${chunkIndex + 1}: ${currentStart.toFixed(1)}s - ${chunkEnd.toFixed(1)}s (${(chunkEnd - currentStart).toFixed(1)}s duration)`);
      
      currentStart = chunkEnd;
      chunkIndex++;
    }
    
    return chunks;
  }

  /**
   * Create intelligent chunks with overlap for better transcription continuity
   */
  private async createIntelligentChunksWithOverlap(
    audioPath: string, 
    silenceBreaks: number[], 
    tempDir: string, 
    baseName: string
  ): Promise<{ path: string; startTime: number; endTime: number; hasOverlap: boolean; originalStartTime: number }[]> {
    
    // Get total audio duration
    const audioDuration = await this.getAudioDuration(audioPath);
    
    // Create chunks with optimal sizing and overlap
    const chunks: { path: string; startTime: number; endTime: number; hasOverlap: boolean; originalStartTime: number }[] = [];
    const targetChunkDuration = 480; // 8 minutes target (leaves room for variation)
    const maxChunkDuration = 720; // 12 minutes maximum
    const overlapDuration = 30; // 30 seconds overlap
    
    let currentStart = 0;
    let chunkIndex = 0;
    
    while (currentStart < audioDuration) {
      let chunkEnd = currentStart + targetChunkDuration;
      
      // Find the best silence break near our target end time
      if (chunkEnd < audioDuration) {
        const idealEnd = chunkEnd;
        const searchWindow = 120; // 2-minute search window
        
        const candidateBreaks = silenceBreaks.filter(breakTime => 
          breakTime >= idealEnd - searchWindow && 
          breakTime <= idealEnd + searchWindow &&
          breakTime <= audioDuration
        );
        
        if (candidateBreaks.length > 0) {
          // Choose the break closest to our ideal end time
          chunkEnd = candidateBreaks.reduce((closest, current) => 
            Math.abs(current - idealEnd) < Math.abs(closest - idealEnd) ? current : closest
          );
        } else {
          // No good silence break, but don't exceed max duration
          chunkEnd = Math.min(currentStart + maxChunkDuration, audioDuration);
        }
      } else {
        chunkEnd = audioDuration;
      }
      
      // Add overlap for continuity (except for first chunk)
      const hasOverlap = chunkIndex > 0;
      const actualStartTime = hasOverlap ? Math.max(0, currentStart - overlapDuration) : currentStart;
      const actualDuration = chunkEnd - actualStartTime;
      
      // Create the chunk file with overlap
      const chunkPath = path.join(tempDir, `${baseName}_intelligent_chunk_${chunkIndex}.wav`);
      
      await new Promise<void>((resolve, reject) => {
        ffmpeg(audioPath)
          .seekInput(actualStartTime)
          .duration(actualDuration)
          .format('wav')
          .audioCodec('pcm_s24le')  // Higher quality for overlapped chunks
          .audioChannels(1)
          .audioFrequency(22050)    // Higher sample rate
          .audioFilters([
            'volume=1.2',           // Slight volume boost
            'highpass=f=80',        // Remove low-frequency noise
            'lowpass=f=8000',       // Remove high-frequency noise
            'afade=t=in:ss=0:d=0.5', // Fade in
            `afade=t=out:st=${actualDuration - 0.5}:d=0.5` // Fade out
          ])
          .output(chunkPath)
          .on('end', () => resolve())
          .on('error', (err: any) => reject(err))
          .run();
      });
      
      chunks.push({
        path: chunkPath,
        startTime: actualStartTime,
        endTime: chunkEnd,
        hasOverlap,
        originalStartTime: currentStart
      });
      
      console.log(`📁 Created intelligent chunk ${chunkIndex + 1}: ${actualStartTime.toFixed(1)}s - ${chunkEnd.toFixed(1)}s (${actualDuration.toFixed(1)}s duration, overlap: ${hasOverlap})`);
      
      currentStart = chunkEnd;
      chunkIndex++;
    }
    
    return chunks;
  }


  /**
   * Compress audio for Whisper API while preserving speech quality
   */
  private async compressAudioForWhisper(audioPath: string): Promise<string> {
    const outputPath = audioPath.replace('.wav', '_compressed.mp3');
    console.log(`🗜️ Compressing audio: ${path.basename(audioPath)} → ${path.basename(outputPath)}`);
    
    return new Promise((resolve, reject) => {
      ffmpeg(audioPath)
        .format('mp3')
        .audioBitrate('96k')        // Aggressive compression while preserving speech
        .audioChannels(1)          // Mono
        .audioFrequency(22050)     // Maintain sample rate for quality
        .audioFilters([
          'volume=1.5',            // Boost volume to compensate for compression
          'compand=0.02,0.20:-60/-60,-40/-40,-20/-15,-10/-10,0/-7:0.1:0.1', // Audio companding for speech
          'highpass=f=100',        // Remove low-frequency noise
          'lowpass=f=8000'         // Remove high-frequency noise above speech range
        ])
        .outputOptions([
          '-q:a', '2',             // High quality VBR
          '-compression_level', '2' // Fast compression
        ])
        .output(outputPath)
        .on('start', (cmd: string) => {
          console.log(`🚀 Audio compression started: ${cmd}`);
        })
        .on('progress', (progress: any) => {
          if (progress.percent && progress.percent % 25 === 0) {
            console.log(`📊 Compression progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          // Log compression stats
          const originalStats = fs.statSync(audioPath);
          const compressedStats = fs.statSync(outputPath);
          const compressionRatio = ((originalStats.size - compressedStats.size) / originalStats.size * 100);
          
          console.log(`✅ Compression complete: ${(originalStats.size / 1024 / 1024).toFixed(2)}MB → ${(compressedStats.size / 1024 / 1024).toFixed(2)}MB (${compressionRatio.toFixed(1)}% reduction)`);
          resolve(outputPath);
        })
        .on('error', (err: any) => {
          console.error(`❌ Audio compression failed:`, err);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Smart file size optimizer - tries different compression strategies
   */
  private async optimizeAudioForWhisper(audioPath: string, targetSizeMB: number = 20): Promise<string> {
    const stats = fs.statSync(audioPath);
    const currentSizeMB = stats.size / (1024 * 1024);
    
    if (currentSizeMB <= targetSizeMB) {
      console.log(`✅ Audio file is already under ${targetSizeMB}MB (${currentSizeMB.toFixed(2)}MB)`);
      return audioPath;
    }
    
    console.log(`🎯 Optimizing audio file from ${currentSizeMB.toFixed(2)}MB to under ${targetSizeMB}MB`);
    
    // Strategy 1: Standard MP3 compression
    try {
      const compressedPath = await this.compressAudioForWhisper(audioPath);
      const compressedStats = fs.statSync(compressedPath);
      const compressedSizeMB = compressedStats.size / (1024 * 1024);
      
      if (compressedSizeMB <= targetSizeMB) {
        console.log(`✅ Standard compression successful: ${compressedSizeMB.toFixed(2)}MB`);
        return compressedPath;
      }
      
      // If still too large, try aggressive compression
      console.log(`⚠️ Standard compression still too large (${compressedSizeMB.toFixed(2)}MB), trying aggressive compression...`);
      fs.unlinkSync(compressedPath); // Clean up
      
      const aggressivePath = await this.aggressiveAudioCompression(audioPath, targetSizeMB);
      return aggressivePath;
      
    } catch (error) {
      console.error(`❌ Audio optimization failed:`, error);
      throw new TranscriptionError('Audio optimization failed', 'FILE_SIZE_ERROR', error as Error);
    }
  }

  /**
   * Aggressive audio compression for very large files
   */
  private async aggressiveAudioCompression(audioPath: string, targetSizeMB: number): Promise<string> {
    const outputPath = audioPath.replace('.wav', '_aggressive.mp3');
    console.log(`🔥 Applying aggressive compression to fit under ${targetSizeMB}MB`);
    
    return new Promise((resolve, reject) => {
      ffmpeg(audioPath)
        .format('mp3')
        .audioBitrate('64k')       // Very aggressive bitrate
        .audioChannels(1)         // Mono
        .audioFrequency(16000)    // Lower sample rate
        .audioFilters([
          'volume=2.0',           // Higher volume boost
          'compand=0.02,0.20:-60/-60,-40/-35,-20/-12,-10/-8,0/-5:0.05:0.1', // Aggressive companding
          'highpass=f=150',       // More aggressive high-pass
          'lowpass=f=7000',       // More aggressive low-pass
          'speechnorm=e=25:r=0.0001:l=1' // Speech normalization
        ])
        .outputOptions([
          '-q:a', '4',            // Lower quality for smaller size
          '-compression_level', '0' // Fastest compression
        ])
        .output(outputPath)
        .on('start', (cmd: string) => {
          console.log(`🚀 Aggressive compression started: ${cmd}`);
        })
        .on('end', () => {
          const compressedStats = fs.statSync(outputPath);
          const compressedSizeMB = compressedStats.size / (1024 * 1024);
          console.log(`✅ Aggressive compression complete: ${compressedSizeMB.toFixed(2)}MB`);
          resolve(outputPath);
        })
        .on('error', (err: any) => {
          console.error(`❌ Aggressive compression failed:`, err);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Split and transcribe large audio files using intelligent chunking
   */
  private async transcribeLargeAudioFile(audioPath: string, baseTimeOffset: number = 0, videoMetadata?: any): Promise<any[]> {
    const tempDir = path.dirname(audioPath);
    const baseName = path.basename(audioPath, path.extname(audioPath));
    
    // Try intelligent chunking first, fallback to time-based if silence detection fails
    try {
      console.log(`🧠 Attempting intelligent chunking with silence detection...`);
      return await this.transcribeWithIntelligentChunking(audioPath, baseTimeOffset, videoMetadata);
    } catch (error) {
      console.warn(`⚠️ Intelligent chunking failed, falling back to time-based chunking:`, error);
      return await this.transcribeWithTimeBasedChunking(audioPath, baseTimeOffset, videoMetadata);
    }
  }

  /**
   * Intelligent chunking using silence detection for natural boundaries
   */
  private async transcribeWithIntelligentChunking(audioPath: string, baseTimeOffset: number = 0, videoMetadata?: any): Promise<any[]> {
    const tempDir = path.dirname(audioPath);
    const baseName = path.basename(audioPath, path.extname(audioPath));
    
    // First, analyze silence patterns
    const silenceBreaks = await this.detectSilenceBreaks(audioPath);
    console.log(`🔍 Detected ${silenceBreaks.length} silence breaks for intelligent chunking`);
    
    // Create optimal chunks based on silence detection with overlap for continuity
    const chunks = await this.createIntelligentChunksWithOverlap(audioPath, silenceBreaks, tempDir, baseName);
    
    let allSegments: any[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`🎤 Transcribing intelligent chunk ${i + 1}/${chunks.length} (${chunk.startTime.toFixed(2)}s - ${chunk.endTime.toFixed(2)}s, overlap: ${chunk.hasOverlap})`);
      
      try {
        // Check file size before transcription
        const stats = fs.statSync(chunk.path);
        const fileSizeMB = stats.size / (1024 * 1024);
        
        let chunkSegments: any[] = [];
        
        if (fileSizeMB > 20) {
          // If even intelligent chunking creates large files, compress
          const compressedPath = await this.compressAudioForWhisper(chunk.path);
          chunkSegments = await this.transcribeAudioFile(compressedPath, baseTimeOffset + chunk.startTime, videoMetadata);
          
          // Clean up compressed file
          if (fs.existsSync(compressedPath)) {
            fs.unlinkSync(compressedPath);
          }
        } else {
          chunkSegments = await this.transcribeAudioFile(chunk.path, baseTimeOffset + chunk.startTime, videoMetadata);
        }
        
        // For overlapped chunks (not the first), filter out duplicate segments
        let filteredSegments = chunkSegments;
        if (chunk.hasOverlap && i > 0) {
          const overlapThreshold = baseTimeOffset + chunk.originalStartTime;
          filteredSegments = chunkSegments.filter(segment => segment.start >= overlapThreshold);
          console.log(`🔄 Filtered ${chunkSegments.length - filteredSegments.length} overlapping segments from intelligent chunk ${i + 1}`);
        }
        
        allSegments.push(...filteredSegments);
        
        console.log(`✅ Intelligent chunk ${i + 1} transcribed: ${filteredSegments.length} segments (${chunkSegments.length} total, overlap filtered)`);
      } catch (error) {
        console.error(`❌ Failed to transcribe intelligent chunk ${i + 1}:`, error);
      } finally {
        // Clean up chunk file
        if (fs.existsSync(chunk.path)) {
          fs.unlinkSync(chunk.path);
        }
      }
    }
    
    // Post-process to merge segments for better continuity
    const processedSegments = this.mergeAdjacentSegments(allSegments);
    console.log(`🔗 Merged ${allSegments.length} segments into ${processedSegments.length} final segments with intelligent chunking`);
    
    return processedSegments.sort((a, b) => a.start - b.start);
  }

  /**
   * Fallback time-based chunking with overlap for continuity
   */
  private async transcribeWithTimeBasedChunking(audioPath: string, baseTimeOffset: number = 0, videoMetadata?: any): Promise<any[]> {
    const tempDir = path.dirname(audioPath);
    const baseName = path.basename(audioPath, path.extname(audioPath));
    
    // Split audio into 10-minute chunks with 30-second overlap for continuity
    const chunkDuration = 600; // 10 minutes in seconds
    const overlapDuration = 30; // 30 seconds overlap
    
    // Get audio duration first
    const metadata = await new Promise<any>((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err: any, data: any) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    
    const totalDuration = metadata.format.duration;
    const numChunks = Math.ceil(totalDuration / chunkDuration);
    
    console.log(`📦 Splitting audio into ${numChunks} chunks of ${chunkDuration}s each with ${overlapDuration}s overlap`);
    
    let allSegments: any[] = [];
    
    for (let i = 0; i < numChunks; i++) {
      const startTime = Math.max(0, i * chunkDuration - (i > 0 ? overlapDuration : 0));
      const actualDuration = Math.min(
        chunkDuration + (i > 0 ? overlapDuration : 0), 
        totalDuration - startTime
      );
      const chunkPath = path.join(tempDir, `${baseName}_chunk_${i}.wav`);
      
      try {
        // Create audio chunk with overlap
        await new Promise<void>((resolve, reject) => {
          ffmpeg(audioPath)
            .seekInput(startTime)
            .duration(actualDuration)
            .format('wav')
            .audioCodec('pcm_s24le')     // Higher quality for overlapped chunks
            .audioChannels(1)
            .audioFrequency(22050)       // Higher sample rate
            .audioFilters([
              'volume=1.2',              // Slight volume boost
              'highpass=f=80',           // Remove low-frequency noise
              'lowpass=f=8000'           // Remove high-frequency noise
            ])
            .output(chunkPath)
            .on('end', () => resolve())
            .on('error', (err: any) => reject(err))
            .run();
        });
        
        // Transcribe chunk with proper time offset
        const chunkSegments = await this.transcribeAudioFile(chunkPath, baseTimeOffset + startTime, videoMetadata);
        
        // For overlapped chunks (not the first), filter out segments that are duplicates from previous chunk
        let filteredSegments = chunkSegments;
        if (i > 0) {
          const overlapThreshold = baseTimeOffset + (i * chunkDuration);
          filteredSegments = chunkSegments.filter(segment => segment.start >= overlapThreshold);
          console.log(`🔄 Filtered ${chunkSegments.length - filteredSegments.length} overlapping segments from chunk ${i + 1}`);
        }
        
        allSegments.push(...filteredSegments);
        
        // Clean up chunk
        if (fs.existsSync(chunkPath)) {
          fs.unlinkSync(chunkPath);
        }
        
        console.log(`✅ Chunk ${i + 1}/${numChunks} transcribed: ${filteredSegments.length} segments (${chunkSegments.length} total, overlap filtered)`);
      } catch (error) {
        console.error(`❌ Failed to process chunk ${i + 1}:`, error);
        if (fs.existsSync(chunkPath)) {
          fs.unlinkSync(chunkPath);
        }
      }
    }
    
    // Post-process to merge segments that may have been split at chunk boundaries
    const processedSegments = this.mergeAdjacentSegments(allSegments);
    console.log(`🔗 Merged ${allSegments.length} segments into ${processedSegments.length} final segments`);
    
    return processedSegments.sort((a, b) => a.start - b.start);
  }

  /**
   * Merge adjacent segments with similar timing and text for better continuity
   */
  private mergeAdjacentSegments(segments: any[]): any[] {
    if (segments.length === 0) return segments;
    
    // Sort segments by start time first
    const sortedSegments = segments.sort((a, b) => a.start - b.start);
    const mergedSegments: any[] = [];
    
    let currentSegment = { ...sortedSegments[0] };
    
    for (let i = 1; i < sortedSegments.length; i++) {
      const nextSegment = sortedSegments[i];
      
      // Check if segments should be merged based on:
      // 1. Time gap (< 0.5 seconds)
      // 2. Text similarity (continuing sentences)
      // 3. Same language/confidence
      const timeGap = nextSegment.start - currentSegment.end;
      const shouldMerge = this.shouldMergeSegments(currentSegment, nextSegment, timeGap);
      
      if (shouldMerge) {
        // Merge segments
        currentSegment = {
          ...currentSegment,
          end: nextSegment.end,
          text: this.mergeSegmentTexts(currentSegment.text, nextSegment.text),
          confidence: currentSegment.confidence && nextSegment.confidence 
            ? (currentSegment.confidence + nextSegment.confidence) / 2 
            : currentSegment.confidence || nextSegment.confidence
        };
        console.log(`🔗 Merged segments: "${currentSegment.text.substring(0, 50)}..."`);
      } else {
        // Keep current segment and start new one
        mergedSegments.push(currentSegment);
        currentSegment = { ...nextSegment };
      }
    }
    
    // Don't forget the last segment
    mergedSegments.push(currentSegment);
    
    return mergedSegments;
  }

  /**
   * Determine if two segments should be merged
   */
  private shouldMergeSegments(current: any, next: any, timeGap: number): boolean {
    // Don't merge if time gap is too large
    if (timeGap > 0.5) return false;
    
    // Don't merge if different languages
    if (current.language !== next.language) return false;
    
    // Don't merge if combined text would be too long
    const combinedLength = (current.text + next.text).length;
    if (combinedLength > 500) return false;
    
    // Check for text continuity indicators
    const currentText = current.text.trim();
    const nextText = next.text.trim();
    
    // Merge if current segment ends mid-sentence or next starts with continuation
    const currentEndsIncomplete = !currentText.match(/[.!?]$/);
    const nextStartsWithLowercase = nextText.match(/^[a-z]/);
    const nextStartsWithConjunction = nextText.match(/^(and|but|or|so|yet|for|nor|because|although|however|therefore|meanwhile|furthermore)\s/i);
    
    return currentEndsIncomplete || nextStartsWithLowercase || nextStartsWithConjunction || timeGap < 0.1;
  }

  /**
   * Intelligently merge text from two segments
   */
  private mergeSegmentTexts(currentText: string, nextText: string): string {
    const current = currentText.trim();
    const next = nextText.trim();
    
    // If current doesn't end with punctuation and next doesn't start with capital, use space
    if (!current.match(/[.!?]$/) && !next.match(/^[A-Z]/)) {
      return `${current} ${next}`;
    }
    
    // If there's clear sentence boundary, use space
    return `${current} ${next}`;
  }

  /**
   * Concatenate multiple audio files into one
   */
  private async concatenateAudioFiles(inputPaths: string[], outputPath: string): Promise<void> {
    console.log(`🔗 Concatenating ${inputPaths.length} audio files into ${path.basename(outputPath)}`);
    
    return new Promise((resolve, reject) => {
      const command = ffmpeg();
      
      // Add all input files
      for (const inputPath of inputPaths) {
        command.input(inputPath);
      }
      
      command
        .format('wav')
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(16000)
        .on('start', (cmd: string) => {
          console.log(`🚀 Audio concatenation started: ${cmd}`);
        })
        .on('progress', (progress: any) => {
          if (progress.percent) {
            const percent = Math.round(progress.percent);
            if (percent % 10 === 0) { // Report every 10%
              console.log(`📊 Concatenation progress: ${percent}%`);
            }
          }
        })
        .on('end', () => {
          console.log(`✅ Audio concatenation completed: ${path.basename(outputPath)}`);
          resolve();
        })
        .on('error', (err: any) => {
          console.error(`❌ Audio concatenation error:`, err);
          reject(err);
        })
        .mergeToFile(outputPath, path.dirname(outputPath));
    });
  }

  /**
   * Find video URL using different naming patterns
   */
  private async findVideoUrl(originalPath: string, objectStorage: ObjectStorageService): Promise<string> {
    if (originalPath?.startsWith('/objects/')) {
      // For object storage videos, try common Cloudinary naming patterns
      const baseId = this.extractPublicIdFromPath(originalPath);
      const possibleIds = [
        `video-clipper/uploads/${baseId}`,
        `uploads/${baseId}`,
        baseId,
        `${baseId}.mp4`
      ];
      
      // Try each possible public ID pattern
      for (const publicId of possibleIds) {
        try {
          const testUrl = objectStorage.generateUrl(publicId, {
            resource_type: 'video',
            secure: true
          });
          
          // Test if this URL exists by making a HEAD request
          const headResponse = await fetch(testUrl, { method: 'HEAD' });
          if (headResponse.ok) {
            console.log(`✅ Found video at: ${publicId}`);
            return testUrl;
          }
        } catch (error) {
          // Continue to next pattern
        }
      }
      
      throw new Error(`Video not found in Cloudinary with any naming pattern for: ${baseId}`);
    } else {
      // Extract public ID from the original path
      const publicId = this.extractPublicIdFromPath(originalPath);
      
      // Generate Cloudinary URL for the video
      return objectStorage.generateUrl(publicId, {
        resource_type: 'video',
        secure: true
      });
    }
  }

  private async saveTranscriptWithTransaction(videoId: string, allSegments: any[], overallConfidence: number): Promise<void> {
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`💾 Attempting to save transcript (attempt ${attempt}/${maxRetries})...`);
        
        // Fresh database connection for each attempt
        const { db } = await import("../db");
        
        await db.transaction(async (tx) => {
          // Create transcript
          await tx.insert(transcripts).values({
            videoId,
            segments: allSegments,
            confidence: overallConfidence,
            language: allSegments.length > 0 ? allSegments[0].language : 'en',
          });

          // Update video transcription status
          await tx.update(videos)
            .set({ 
              transcriptionStatus: "completed",
              updatedAt: new Date()
            })
            .where(eq(videos.id, videoId));
        });
        
        console.log(`✅ Transcript saved successfully on attempt ${attempt}`);
        return; // Success - exit the retry loop
        
      } catch (error: any) {
        lastError = error;
        console.error(`❌ Database save attempt ${attempt} failed:`, error.message);
        
        // If this isn't the last attempt, wait before retrying
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
          console.log(`⏳ Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // If we get here, all attempts failed
    console.error(`💥 Failed to save transcript after ${maxRetries} attempts. Last error:`, lastError);
    throw new TranscriptionError(
      `Failed to save transcript to database after ${maxRetries} attempts: ${lastError?.message}`,
      'DATABASE_ERROR',
      lastError || undefined
    );
  }
}

// Static method for getting transcript without requiring API key
export async function getTranscriptByVideoId(videoId: string): Promise<any> {
  const [transcript] = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.videoId, videoId))
    .limit(1);

  return transcript || null;
}
