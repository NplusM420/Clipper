import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { storage } from "../storage";
import { ObjectStorageService } from "../objectStorage";
import { ObjectAclPolicy } from "../objectAcl";
import fetch from "node-fetch";

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

      // Create temp directory
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempInputPath = path.join(tempDir, `input_${clipId}.mp4`);
      const tempOutputPath = path.join(tempDir, `output_${clipId}.mp4`);

      if (video.isChunked) {
        // Handle chunked video: download and concatenate relevant parts
        await this.prepareChunkedVideoForClip(video.id, clip.startTime, clip.endTime, tempInputPath);
      } else {
        // Handle regular video: download directly
        const publicId = this.extractPublicIdFromPath(video.originalPath);
        const videoUrl = this.objectStorage.generateUrl(publicId, {
          resource_type: 'video',
          secure: true
        });

        const response = await fetch(videoUrl);
        if (!response.ok) {
          throw new Error(`Failed to download video: ${response.statusText}`);
        }
        
        const buffer = await response.buffer();
        fs.writeFileSync(tempInputPath, buffer);
      }

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

      // Upload processed clip to Cloudinary
      const clipResult = await this.objectStorage.uploadClip(tempOutputPath, {
        public_id: `clip_${clipId}`,
        quality: clip.quality || "auto"
      });

      // Update clip with Cloudinary public ID as output path
      await storage.updateClipStatus(clipId, "ready", clipResult.public_id);
      await storage.updateClipProgress(clipId, 100);

      // Clean up temp files
      if (fs.existsSync(tempInputPath)) {
        fs.unlinkSync(tempInputPath);
      }
      if (fs.existsSync(tempOutputPath)) {
        fs.unlinkSync(tempOutputPath);
      }

    } catch (error) {
      console.error("Clip processing error:", error);
      await storage.updateClipStatus(clipId, "error");
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

  /**
   * Prepares a chunked video for clip creation by downloading and concatenating relevant parts
   */
  private async prepareChunkedVideoForClip(
    videoId: string,
    clipStartTime: number,
    clipEndTime: number,
    outputPath: string
  ): Promise<void> {
    console.log(`📦 Preparing chunked video for clip: ${clipStartTime}s - ${clipEndTime}s`);
    
    // Get video parts from database
    const parts = await storage.getVideoParts(videoId);
    if (parts.length === 0) {
      throw new Error("No video parts found for chunked video");
    }

    // Find parts that contain the clip timeframe
    const relevantParts = parts.filter(part => 
      part.startTime < clipEndTime && part.endTime > clipStartTime
    );

    if (relevantParts.length === 0) {
      throw new Error("No video parts contain the requested clip timeframe");
    }

    console.log(`📝 Found ${relevantParts.length} relevant parts for clip`);

    const tempDir = path.dirname(outputPath);
    const partPaths: string[] = [];

    try {
      // Download all relevant parts
      for (let i = 0; i < relevantParts.length; i++) {
        const part = relevantParts[i];
        const partPath = path.join(tempDir, `part_${part.partIndex}_${Date.now()}.mp4`);
        
        console.log(`⬇️ Downloading part ${part.partIndex} (${part.startTime}s - ${part.endTime}s)`);
        
        // Generate Cloudinary URL for this part
        const partUrl = this.objectStorage.generateUrl(part.cloudinaryPublicId, {
          resource_type: 'video',
          secure: true
        });

        // Download part
        const response = await fetch(partUrl);
        if (!response.ok) {
          throw new Error(`Failed to download video part ${part.partIndex}: ${response.statusText}`);
        }
        
        const buffer = await response.buffer();
        fs.writeFileSync(partPath, buffer);
        partPaths.push(partPath);
      }

      if (relevantParts.length === 1) {
        // Single part - just copy it
        fs.copyFileSync(partPaths[0], outputPath);
      } else {
        // Multiple parts - concatenate them
        console.log(`🔗 Concatenating ${relevantParts.length} parts`);
        await this.concatenateVideoParts(partPaths, outputPath);
      }

      console.log(`✅ Successfully prepared chunked video input`);

    } finally {
      // Clean up temporary part files
      for (const partPath of partPaths) {
        try {
          if (fs.existsSync(partPath)) {
            fs.unlinkSync(partPath);
          }
        } catch (error) {
          console.warn(`Failed to cleanup part file ${partPath}:`, error);
        }
      }
    }
  }

  /**
   * Concatenates multiple video parts into a single file
   */
  private async concatenateVideoParts(partPaths: string[], outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create a concat file for ffmpeg
      const concatFilePath = path.join(path.dirname(outputPath), `concat_${Date.now()}.txt`);
      const concatContent = partPaths.map(p => `file '${p}'`).join('\n');
      fs.writeFileSync(concatFilePath, concatContent);

      try {
        ffmpeg()
          .input(concatFilePath)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions(['-c', 'copy']) // Copy without re-encoding for speed
          .on('end', () => {
            // Clean up concat file
            try {
              fs.unlinkSync(concatFilePath);
            } catch (error) {
              console.warn(`Failed to cleanup concat file:`, error);
            }
            resolve();
          })
          .on('error', (err) => {
            // Clean up concat file
            try {
              fs.unlinkSync(concatFilePath);
            } catch (error) {
              console.warn(`Failed to cleanup concat file:`, error);
            }
            reject(err);
          })
          .save(outputPath);
      } catch (error) {
        // Clean up concat file
        try {
          fs.unlinkSync(concatFilePath);
        } catch (err) {
          console.warn(`Failed to cleanup concat file:`, err);
        }
        reject(error);
      }
    });
  }
}
