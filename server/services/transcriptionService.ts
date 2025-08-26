import OpenAI from "openai";
import { storage } from "../storage";
import fs from "fs";
import { ObjectStorageService } from "../objectStorage";

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

      // Download video file from object storage
      const objectStorage = new ObjectStorageService();
      const videoFile = await objectStorage.getObjectEntityFile(video.originalPath);
      
      // Create temporary file for processing
      const tempPath = `/tmp/video_${videoId}.mp4`;
      const writeStream = fs.createWriteStream(tempPath);
      const readStream = videoFile.createReadStream();
      
      await new Promise((resolve, reject) => {
        readStream.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

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
      fs.unlinkSync(tempPath);

    } catch (error) {
      console.error("Transcription error:", error);
      await storage.updateVideoTranscriptionStatus(videoId, "error");
      throw error;
    }
  }

  async updateTranscript(transcriptId: string, segments: any[]): Promise<void> {
    await storage.updateTranscript(transcriptId, segments, true);
  }
}
