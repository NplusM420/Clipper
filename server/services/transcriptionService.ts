import OpenAI from "openai";
import { storage } from "../storage";
import fs from "fs";
import path from "path";
import { ObjectStorageService } from "../objectStorage";
import fetch from "node-fetch";

export class TranscriptionService {
  private openai: OpenAI;

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

      // Get video URL from Cloudinary
      const objectStorage = new ObjectStorageService();
      
      // Extract public ID from the original path (assuming it's stored as Cloudinary public ID)
      const publicId = this.extractPublicIdFromPath(video.originalPath);
      
      // Generate Cloudinary URL for the video
      const videoUrl = objectStorage.generateUrl(publicId, {
        resource_type: 'video',
        secure: true
      });

      // Download video file to temporary location
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const tempPath = path.join(tempDir, `video_${videoId}.mp4`);
      
      // Download video from Cloudinary
      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error(`Failed to download video: ${response.statusText}`);
      }
      
      const buffer = await response.buffer();
      fs.writeFileSync(tempPath, buffer);

      // Transcribe using Whisper
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
      });

      // Process segments
      const segments = transcription.segments?.map((segment, index) => ({
        id: `segment_${index}`,
        start: segment.start,
        end: segment.end,
        text: segment.text.trim(),
        confidence: segment.avg_logprob ? Math.exp(segment.avg_logprob) : undefined,
      })) || [];

      // Calculate overall confidence
      const overallConfidence = segments.length > 0 
        ? segments.reduce((sum, seg) => sum + (seg.confidence || 0), 0) / segments.length
        : 0;

      // Save transcript
      await storage.createTranscript({
        videoId,
        segments,
        confidence: overallConfidence,
        language: transcription.language,
      });

      // Update video status
      await storage.updateVideoTranscriptionStatus(videoId, "completed");

      // Clean up temp file
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }

    } catch (error) {
      console.error("Transcription error:", error);
      await storage.updateVideoTranscriptionStatus(videoId, "error");
      throw error;
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
}
