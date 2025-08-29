import OpenAI from "openai";
import { storage } from "../storage";
import fs from "fs";
import path from "path";
import { ObjectStorageService } from "../objectStorage";
import fetch from "node-fetch";
import ffmpeg from "fluent-ffmpeg";
import { transcripts, videos } from "@shared/schema";
import { eq } from "drizzle-orm";

export class TranscriptionError extends Error {
  constructor(
    message: string,
    public code: 'FFMPEG_ERROR' | 'WHISPER_ERROR' | 'STORAGE_ERROR' | 'NETWORK_ERROR' | 'FILE_SIZE_ERROR',
    public originalError?: Error
  ) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

export class TranscriptionService {
  private openai: OpenAI;
  private readonly WHISPER_SIZE_LIMIT_MB = 25; // OpenAI Whisper API limit
  private readonly PROCESSING_BUFFER_MB = 5; // Safety buffer for processing

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async transcribeVideo(videoId: string, userId: string): Promise<void> {
    try {
      // Update status to processing
      await storage.updateVideoTranscriptionStatus(videoId, "processing");

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
        allSegments = await this.transcribeChunkedVideo(videoId, userId);
      } else {
        console.log(`🎬 Transcribing complete video: ${video.filename}`);
        allSegments = await this.transcribeCompleteVideo(videoId, userId);
      }

      // Calculate overall confidence
      const overallConfidence = allSegments.length > 0 
        ? allSegments.reduce((sum, seg) => sum + (seg.confidence || 0), 0) / allSegments.length
        : 0;

      // Save transcript and update video status in a transaction
      await this.saveTranscriptWithTransaction(videoId, allSegments, overallConfidence);
      console.log(`✅ Transcription completed: ${allSegments.length} segments total`)

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

  /**
   * Transcribe a chunked video by reassembling audio from all parts
   */
  private async transcribeChunkedVideo(videoId: string, userId: string): Promise<any[]> {
    // Get all video parts
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
          const partSegments = await this.transcribeAudioFile(audioPath, part.startTime);
          
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
        segments = await this.transcribeLargeAudioFile(audioPath, 0);
      } else {
        console.log(`✅ Audio file is ${fileSizeMB.toFixed(2)}MB, transcribing directly`);
        segments = await this.transcribeAudioFile(audioPath, 0);
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
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(16000)
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
  private async transcribeAudioFile(audioPath: string, timeOffset: number = 0): Promise<any[]> {
    console.log(`🎤 Transcribing audio file: ${path.basename(audioPath)}`);
    
    const transcription = await this.openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    // Process segments and apply time offset
    const segments = transcription.segments?.map((segment, index) => ({
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
   * Split and transcribe large audio files
   */
  private async transcribeLargeAudioFile(audioPath: string, baseTimeOffset: number = 0): Promise<any[]> {
    const tempDir = path.dirname(audioPath);
    const baseName = path.basename(audioPath, path.extname(audioPath));
    
    // Split audio into 10-minute chunks (should be well under 25MB limit)
    const chunkDuration = 600; // 10 minutes in seconds
    
    // Get audio duration first
    const metadata = await new Promise<any>((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err: any, data: any) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    
    const totalDuration = metadata.format.duration;
    const numChunks = Math.ceil(totalDuration / chunkDuration);
    
    console.log(`📦 Splitting audio into ${numChunks} chunks of ${chunkDuration}s each`);
    
    let allSegments: any[] = [];
    
    for (let i = 0; i < numChunks; i++) {
      const startTime = i * chunkDuration;
      const chunkPath = path.join(tempDir, `${baseName}_chunk_${i}.wav`);
      
      try {
        // Create audio chunk
        await new Promise<void>((resolve, reject) => {
          ffmpeg(audioPath)
            .seekInput(startTime)
            .duration(Math.min(chunkDuration, totalDuration - startTime))
            .format('wav')
            .audioCodec('pcm_s16le')
            .output(chunkPath)
            .on('end', () => resolve())
            .on('error', (err: any) => reject(err))
            .run();
        });
        
        // Transcribe chunk with proper time offset
        const chunkSegments = await this.transcribeAudioFile(chunkPath, baseTimeOffset + startTime);
        allSegments.push(...chunkSegments);
        
        // Clean up chunk
        if (fs.existsSync(chunkPath)) {
          fs.unlinkSync(chunkPath);
        }
        
        console.log(`✅ Chunk ${i + 1}/${numChunks} transcribed: ${chunkSegments.length} segments`);
      } catch (error) {
        console.error(`❌ Failed to process chunk ${i + 1}:`, error);
        if (fs.existsSync(chunkPath)) {
          fs.unlinkSync(chunkPath);
        }
      }
    }
    
    return allSegments.sort((a, b) => a.start - b.start);
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
        .set({ transcriptionStatus: "completed" })
        .where(eq(videos.id, videoId));
    });
  }
}
