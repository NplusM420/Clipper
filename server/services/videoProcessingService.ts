import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { storage } from "../storage";
import { ObjectStorageService } from "../objectStorage";
import { ObjectAclPolicy } from "../objectAcl";
import fetch from "node-fetch";
import https from "https";
import http from "http";

export class VideoProcessingService {
  private objectStorage: ObjectStorageService;
  private static readonly MAX_CLIP_SIZE = 90 * 1024 * 1024; // 90MB for Cloudinary free tier safety

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
        // SMART APPROACH: Use seamless concatenated video for clipping
        // This leverages our existing seamless video infrastructure
        console.log(`🔗 Using seamless video approach for chunked video clip`);
        
        const seamlessVideoPath = path.join(process.cwd(), 'temp', `${video.id}_seamless.mp4`);
        
        if (fs.existsSync(seamlessVideoPath)) {
          // Use existing concatenated video
          console.log(`✅ Using existing seamless video for clipping`);
          fs.copyFileSync(seamlessVideoPath, tempInputPath);
        } else {
          // Create seamless video first, then use it
          console.log(`🔄 Creating seamless video for clipping...`);
          await this.createSeamlessVideoForClipping(video.id, tempInputPath);
        }
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

      // Estimate clip size before processing
      const estimatedSize = await this.estimateClipSize(tempInputPath, clip.startTime, clip.endTime, clip.quality || "1080p");
      console.log(`📏 Estimated clip size: ${(estimatedSize / 1024 / 1024).toFixed(2)}MB`);
      
      if (estimatedSize > VideoProcessingService.MAX_CLIP_SIZE) {
        console.log(`⚠️ Clip too large (${(estimatedSize / 1024 / 1024).toFixed(2)}MB), using optimized encoding`);
        
        // Use more aggressive compression for large clips
        await this.createOptimizedClip(
          tempInputPath,
          tempOutputPath,
          clip.startTime,
          clip.endTime,
          (progress) => {
            storage.updateClipProgress(clipId, Math.round(progress));
          }
        );
      } else {
        // Process clip with normal quality
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
      }

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

  /**
   * Creates seamless video for clipping by downloading and concatenating chunks
   * This reuses the logic from our seamless video endpoint
   */
  private async createSeamlessVideoForClipping(videoId: string, outputPath: string): Promise<void> {
    console.log(`🔗 Creating seamless video for clipping: ${videoId}`);
    
    // Get video parts
    const parts = await storage.getVideoParts(videoId);
    if (parts.length === 0) {
      throw new Error('No video parts found for chunked video');
    }

    // Sort parts by partIndex to ensure correct order
    const sortedParts = parts.sort((a, b) => a.partIndex - b.partIndex);
    
    const tempDir = path.join(process.cwd(), 'temp');
    const chunkPaths: string[] = [];
    
    try {
      // Download all chunks using object storage URL generation (avoids hardcoded cloud name)
      
      for (let i = 0; i < sortedParts.length; i++) {
        const part = sortedParts[i];
        const chunkUrl = this.objectStorage.generateUrl(part.cloudinaryPublicId, { resource_type: 'video', secure: true });
        const chunkPath = path.join(tempDir, `${videoId}_clip_chunk_${part.partIndex}.mp4`);
        
        console.log(`📥 Downloading chunk ${i + 1}/${sortedParts.length} for clipping...`);
        await this.downloadFile(chunkUrl, chunkPath);
        chunkPaths.push(chunkPath);
      }

      // Create concat list file for FFmpeg
      const concatListPath = path.join(tempDir, `${videoId}_clip_concat_list.txt`);
      const concatList = chunkPaths.map(p => `file '${p}'`).join('\n');
      fs.writeFileSync(concatListPath, concatList);

      // Concatenate using FFmpeg
      console.log('🔗 Concatenating chunks for clipping...');
      await this.concatenateWithFFmpeg(concatListPath, outputPath);

      // Clean up temporary files
      chunkPaths.forEach(p => {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      });
      if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);

      console.log('✅ Seamless video created for clipping');

    } catch (error) {
      // Clean up on error
      chunkPaths.forEach(p => {
        if (fs.existsSync(p)) {
          try { fs.unlinkSync(p); } catch {}
        }
      });
      throw error;
    }
  }

  private async downloadFile(url: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(outputPath);
      
      const request = client.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve();
        });
        
        file.on('error', (err) => {
          fs.unlink(outputPath, () => {}); // Clean up on error
          reject(err);
        });
      });
      
      request.on('error', (err) => {
        reject(err);
      });
    });
  }

  private async concatenateWithFFmpeg(concatListPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('FFmpeg concatenation timeout'));
      }, 10 * 60 * 1000); // 10 minute timeout

      ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .videoCodec('copy') // Copy without re-encoding for speed
        .audioCodec('copy') // Copy without re-encoding for speed  
        .format('mp4')
        .outputOptions(['-movflags', '+faststart']) // Optimize for streaming
        .on('start', (commandLine) => {
          console.log(`🚀 FFmpeg concatenation started for clipping`);
        })
        .on('progress', (progress) => {
          if (progress.percent && progress.percent % 25 === 0) {
            console.log(`📊 Clip concatenation progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          clearTimeout(timeout);
          console.log(`✅ FFmpeg concatenation completed for clipping`);
          resolve();
        })
        .on('error', (err, stdout, stderr) => {
          clearTimeout(timeout);
          console.error(`❌ FFmpeg concatenation error:`, err.message);
          reject(err);
        })
        .save(outputPath);
    });
  }

  /**
   * Estimates the size of a clip before processing
   */
  private async estimateClipSize(inputPath: string, startTime: number, endTime: number, quality: string): Promise<number> {
    try {
      // Get input file size and duration
      const inputStats = fs.statSync(inputPath);
      const inputSize = inputStats.size;
      
      // Get video metadata
      const metadata = await this.getVideoMetadata(inputPath);
      const totalDuration = metadata.format.duration || 1;
      const clipDuration = endTime - startTime;
      
      // Estimate based on duration ratio and quality
      let sizeRatio = clipDuration / totalDuration;
      
      // Quality multipliers (rough estimates)
      const qualityMultipliers = {
        "1080p": 1.0,
        "720p": 0.6,
        "480p": 0.35
      };
      
      const qualityMultiplier = qualityMultipliers[quality as keyof typeof qualityMultipliers] || 1.0;
      
      // Conservative estimate (FFmpeg compression usually reduces size)
      const estimatedSize = Math.round(inputSize * sizeRatio * qualityMultiplier * 0.8);
      
      return estimatedSize;
    } catch (error) {
      console.warn("Failed to estimate clip size:", error);
      // Return a conservative estimate if metadata fails
      return VideoProcessingService.MAX_CLIP_SIZE + 1; // This will trigger optimized encoding
    }
  }

  /**
   * Creates an optimized clip with aggressive compression for large videos
   */
  private async createOptimizedClip(
    inputPath: string,
    outputPath: string,
    startTime: number,
    endTime: number,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    console.log(`🔧 Creating optimized clip: ${startTime}s - ${endTime}s`);
    
    const duration = endTime - startTime;
    
    return new Promise((resolve, reject) => {
      let lastProgress = 0;
      
      ffmpeg(inputPath)
        .seekInput(startTime)
        .duration(duration)
        .videoCodec('libx264')
        .audioCodec('aac')
        .format('mp4')
        .outputOptions([
          '-movflags', '+faststart',
          '-preset', 'faster',
          '-crf', '32', // Higher CRF = more compression
          '-maxrate', '1000k', // Limit bitrate
          '-bufsize', '2000k',
          '-vf', 'scale=1280:720', // Force 720p max
          '-r', '24', // Reduce frame rate
          '-ac', '2', // Stereo audio
          '-ar', '44100', // Standard audio rate
          '-b:a', '96k' // Low audio bitrate
        ])
        .on('start', (commandLine) => {
          console.log(`🚀 Optimized FFmpeg started: ${commandLine}`);
        })
        .on('progress', (progress) => {
          const currentProgress = Math.min(progress.percent || 0, 100);
          if (currentProgress - lastProgress >= 5) {
            console.log(`📊 Optimized clip progress: ${Math.round(currentProgress)}%`);
            onProgress?.(currentProgress);
            lastProgress = currentProgress;
          }
        })
        .on('end', () => {
          console.log('✅ Optimized clip creation completed');
          onProgress?.(100);
          
          // Check final size
          const stats = fs.statSync(outputPath);
          console.log(`📏 Final optimized clip size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
          
          resolve();
        })
        .on('error', (err) => {
          console.error('❌ Optimized clip creation failed:', err);
          reject(err);
        })
        .save(outputPath);
    });
  }

  /**
   * Gets video metadata using ffprobe
   */
  private async getVideoMetadata(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('FFprobe timeout'));
      }, 30000);
      
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        clearTimeout(timeout);
        
        if (err) {
          reject(err);
        } else {
          resolve(metadata);
        }
      });
    });
  }
}
