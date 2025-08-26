import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { storage } from "../storage";
import { ObjectStorageService } from "../objectStorage";
import { ObjectAclPolicy } from "../objectAcl";

export class VideoProcessingService {
  private objectStorage: ObjectStorageService;

  constructor() {
    this.objectStorage = new ObjectStorageService();
  }

  async processClip(clipId: string): Promise<void> {
    try {
      // Update status to processing
      await storage.updateClipStatus(clipId, "processing");
      await storage.updateClipProgress(clipId, 0);

      // Get clip and video info
      const clip = await storage.getClip(clipId);
      if (!clip) {
        throw new Error("Clip not found");
      }

      const video = await storage.getVideo(clip.videoId);
      if (!video) {
        throw new Error("Video not found");
      }

      // Download original video
      const videoFile = await this.objectStorage.getObjectEntityFile(video.originalPath);
      const tempInputPath = `/tmp/input_${clipId}.mp4`;
      const tempOutputPath = `/tmp/output_${clipId}.mp4`;

      // Download video file
      const writeStream = fs.createWriteStream(tempInputPath);
      const readStream = videoFile.createReadStream();
      
      await new Promise((resolve, reject) => {
        readStream.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Process clip with FFmpeg
      await this.createClip(
        tempInputPath,
        tempOutputPath,
        clip.startTime,
        clip.endTime,
        clip.quality || "1080p",
        (progress) => {
          storage.updateClipProgress(clipId, Math.round(progress));
        }
      );

      // Upload processed clip to object storage
      const uploadURL = await this.objectStorage.getObjectEntityUploadURL();
      
      // Upload file
      const clipData = fs.readFileSync(tempOutputPath);
      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: clipData,
        headers: {
          'Content-Type': 'video/mp4',
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload processed clip');
      }

      // Set ACL policy for the clip
      const clipPath = await this.objectStorage.trySetObjectEntityAclPolicy(
        uploadURL,
        {
          owner: clip.userId,
          visibility: "private", // Clips are private by default
        } as ObjectAclPolicy
      );

      // Update clip with output path
      await storage.updateClipStatus(clipId, "ready", clipPath);
      await storage.updateClipProgress(clipId, 100);

      // Clean up temp files
      fs.unlinkSync(tempInputPath);
      fs.unlinkSync(tempOutputPath);

    } catch (error) {
      console.error("Clip processing error:", error);
      await storage.updateClipStatus(clipId, "error");
      throw error;
    }
  }

  private createClip(
    inputPath: string,
    outputPath: string,
    startTime: number,
    endTime: number,
    quality: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const duration = endTime - startTime;
      
      // Quality settings
      const qualitySettings = {
        "1080p": { width: 1920, height: 1080, videoBitrate: "5000k" },
        "720p": { width: 1280, height: 720, videoBitrate: "2500k" },
        "480p": { width: 854, height: 480, videoBitrate: "1000k" },
      };

      const settings = qualitySettings[quality as keyof typeof qualitySettings] || qualitySettings["1080p"];

      ffmpeg(inputPath)
        .seekInput(startTime)
        .duration(duration)
        .size(`${settings.width}x${settings.height}`)
        .videoBitrate(settings.videoBitrate)
        .audioCodec('aac')
        .videoCodec('libx264')
        .format('mp4')
        .on('progress', (progress) => {
          if (onProgress && progress.percent) {
            onProgress(progress.percent);
          }
        })
        .on('end', () => {
          resolve();
        })
        .on('error', (err) => {
          reject(err);
        })
        .save(outputPath);
    });
  }

  async getVideoMetadata(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata);
        }
      });
    });
  }
}
