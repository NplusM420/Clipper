import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

export interface VideoChunk {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  filePath: string;
  fileSize: number;
}

export class VideoChunkingService {
  private static readonly MAX_CHUNK_SIZE = 85 * 1024 * 1024; // 85MB to stay well under Cloudinary's 100MB limit
  private static readonly TARGET_BITRATE = 2000; // 2Mbps target bitrate for estimation
  private static readonly MAX_CHUNK_DURATION = 300; // 5 minutes max per chunk for faster processing

  constructor(private tempDir: string = path.join(process.cwd(), 'temp')) {
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Analyzes a video file and determines how to chunk it
   */
  async analyzeVideo(inputPath: string): Promise<{
    needsChunking: boolean;
    totalDuration: number;
    fileSize: number;
    estimatedChunks: number;
    suggestedChunkDuration: number;
  }> {
    const stats = fs.statSync(inputPath);
    const fileSize = stats.size;

    if (fileSize <= VideoChunkingService.MAX_CHUNK_SIZE) {
      return {
        needsChunking: false,
        totalDuration: 0,
        fileSize,
        estimatedChunks: 1,
        suggestedChunkDuration: 0
      };
    }

    // Get video metadata
    const metadata = await this.getVideoMetadata(inputPath);
    const duration = metadata.format.duration || 0;

    // Calculate how many chunks we need based on both size and duration constraints
    const sizeBasedChunks = Math.ceil(fileSize / VideoChunkingService.MAX_CHUNK_SIZE);
    const durationBasedChunks = Math.ceil(duration / VideoChunkingService.MAX_CHUNK_DURATION);
    
    // Use the larger number to ensure we stay under both limits
    const estimatedChunks = Math.max(sizeBasedChunks, durationBasedChunks);
    const suggestedChunkDuration = Math.min(duration / estimatedChunks, VideoChunkingService.MAX_CHUNK_DURATION);

    return {
      needsChunking: true,
      totalDuration: duration,
      fileSize,
      estimatedChunks,
      suggestedChunkDuration
    };
  }

  /**
   * Splits a video file into chunks based on size constraints
   */
  async chunkVideo(inputPath: string, videoId: string, progressSession?: any): Promise<VideoChunk[]> {
    console.log(`🔍 Starting chunkVideo for ${inputPath}`);
    
    const analysis = await this.analyzeVideo(inputPath);
    
    if (!analysis.needsChunking) {
      // Return single chunk
      const stats = fs.statSync(inputPath);
      return [{
        index: 0,
        startTime: 0,
        endTime: analysis.totalDuration,
        duration: analysis.totalDuration,
        filePath: inputPath,
        fileSize: stats.size
      }];
    }

    const chunks: VideoChunk[] = [];
    const chunkDuration = analysis.suggestedChunkDuration;

    console.log(`📦 Creating ${analysis.estimatedChunks} chunks with duration ${chunkDuration.toFixed(2)}s each`);

    for (let i = 0; i < analysis.estimatedChunks; i++) {
      const startTime = i * chunkDuration;
      const endTime = Math.min((i + 1) * chunkDuration, analysis.totalDuration);
      const duration = endTime - startTime;
      
      const chunkPath = path.join(this.tempDir, `${videoId}_chunk_${i}.mp4`);
      
      console.log(`⚡ Creating chunk ${i + 1}/${analysis.estimatedChunks}: ${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s`);
      
      // Emit FFmpeg progress if we have a progress session
      if (progressSession) {
        progressSession.emitChunkProgress(i, analysis.estimatedChunks, 0, 'Processing with FFmpeg');
      }
      
      try {
        // Try FFmpeg chunking first
        try {
          await this.createChunk(inputPath, chunkPath, startTime, duration);
        } catch (ffmpegError: any) {
          console.warn(`⚠️ FFmpeg failed for chunk ${i}, trying simple file split:`, ffmpegError.message);
          
          // Fallback: Simple file byte splitting (not ideal but works)
          await this.createSimpleChunk(inputPath, chunkPath, i, analysis.estimatedChunks);
        }

        // Emit chunk completion
        if (progressSession) {
          progressSession.emitChunkProgress(i, analysis.estimatedChunks, 100, 'FFmpeg processing complete');
        }
        
        const stats = fs.statSync(chunkPath);
        console.log(`✅ Chunk ${i} created: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
        
        chunks.push({
          index: i,
          startTime,
          endTime,
          duration,
          filePath: chunkPath,
          fileSize: stats.size
        });

        // Verify chunk size - if still too large, we need to reduce quality
        if (stats.size > VideoChunkingService.MAX_CHUNK_SIZE) {
          console.warn(`⚠️ Chunk ${i} is still ${(stats.size / 1024 / 1024).toFixed(2)}MB, reducing quality...`);
          fs.unlinkSync(chunkPath); // Remove oversized chunk
          
          // Retry with lower quality
          try {
            await this.createChunk(inputPath, chunkPath, startTime, duration, true);
          } catch (ffmpegError: any) {
            // If FFmpeg fails again, use simple splitting
            await this.createSimpleChunk(inputPath, chunkPath, i, analysis.estimatedChunks);
          }
          const newStats = fs.statSync(chunkPath);
          chunks[chunks.length - 1].fileSize = newStats.size;
          console.log(`✅ Chunk ${i} recreated with lower quality: ${(newStats.size / 1024 / 1024).toFixed(2)}MB`);
        }
      } catch (error) {
        console.error(`❌ Failed to create chunk ${i}:`, error);
        throw error;
      }
    }

    console.log(`✅ All ${chunks.length} chunks created successfully`);
    return chunks;
  }

  /**
   * Creates a single chunk from the input video
   */
  private async createChunk(
    inputPath: string, 
    outputPath: string, 
    startTime: number, 
    duration: number,
    lowerQuality: boolean = false
  ): Promise<void> {
    console.log(`🎬 FFmpeg processing chunk: ${path.basename(outputPath)} (${startTime.toFixed(2)}s for ${duration.toFixed(2)}s)`);
    console.log(`📁 Input path: ${inputPath}`);
    console.log(`📁 Output path: ${outputPath}`);
    
    // Verify input file exists
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file does not exist: ${inputPath}`);
    }
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error(`⏰ FFmpeg timeout after 3 minutes for chunk: ${outputPath}`);
        reject(new Error(`FFmpeg timeout after 3 minutes`));
      }, 3 * 60 * 1000); // 3 minute timeout per chunk

      let command = ffmpeg(inputPath)
        .seekInput(startTime)
        .duration(duration)
        .videoCodec('libx264')
        .audioCodec('aac')
        .format('mp4')
        .outputOptions([
          '-movflags', '+faststart', // Optimize for streaming
          '-preset', 'superfast', // Faster encoding than ultrafast but better quality
          '-avoid_negative_ts', 'make_zero', // Handle timestamp issues
          '-threads', '0', // Use all available CPU threads
          '-tune', 'fastdecode' // Optimize for fast decoding
        ]);

      if (lowerQuality) {
        // Aggressive compression for oversized chunks
        command = command
          .outputOptions(['-crf', '30']) // Higher CRF = lower quality but smaller file
          .size('1280x720') // Force 720p
          .videoBitrate('800k') // Very low bitrate
          .audioBitrate('96k'); // Low audio bitrate
      } else {
        // Balanced quality for initial chunks
        command = command
          .outputOptions(['-crf', '26']) // Slightly lower quality for speed
          .videoBitrate('1500k') // Reasonable bitrate
          .audioBitrate('128k');
      }

      command
        .on('start', (commandLine) => {
          console.log(`🚀 FFmpeg started: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            const percent = Math.round(progress.percent);
            const timemark = progress.timemark || 'unknown';
            if (percent % 10 === 0) { // Report every 10%
              console.log(`📊 FFmpeg progress: ${percent}% (${timemark})`);
            }
          }
        })
        .on('end', () => {
          clearTimeout(timeout);
          console.log(`✅ FFmpeg completed: ${path.basename(outputPath)}`);
          resolve();
        })
        .on('error', (err, stdout, stderr) => {
          clearTimeout(timeout);
          console.error(`❌ FFmpeg error:`, err.message);
          console.error(`📝 FFmpeg stderr:`, stderr);
          reject(err);
        })
        .save(outputPath);
    });
  }

  /**
   * Creates a simple chunk by splitting the file by bytes (fallback method)
   * This doesn't preserve video structure but works for upload purposes
   */
  private async createSimpleChunk(
    inputPath: string,
    outputPath: string,
    chunkIndex: number,
    totalChunks: number
  ): Promise<void> {
    console.log(`📂 Creating simple byte-split chunk ${chunkIndex + 1}/${totalChunks}`);
    
    const stats = fs.statSync(inputPath);
    const fileSize = stats.size;
    const chunkSize = Math.ceil(fileSize / totalChunks);
    
    const startByte = chunkIndex * chunkSize;
    const endByte = Math.min((chunkIndex + 1) * chunkSize, fileSize);
    
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(inputPath, {
        start: startByte,
        end: endByte - 1
      });
      
      const writeStream = fs.createWriteStream(outputPath);
      
      readStream.pipe(writeStream);
      
      writeStream.on('finish', () => {
        console.log(`✅ Simple chunk created: ${((endByte - startByte) / 1024 / 1024).toFixed(2)}MB`);
        resolve();
      });
      
      writeStream.on('error', reject);
      readStream.on('error', reject);
    });
  }

  /**
   * Gets video metadata using ffprobe
   */
  private async getVideoMetadata(filePath: string): Promise<any> {
    console.log(`🔍 Getting metadata for: ${filePath}`);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error(`⏰ FFprobe timeout for: ${filePath}`);
        reject(new Error('FFprobe timeout after 30 seconds'));
      }, 30000);
      
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        clearTimeout(timeout);
        
        if (err) {
          console.error(`❌ FFprobe error:`, err);
          reject(err);
        } else {
          console.log(`✅ FFprobe success: duration=${metadata.format.duration}s, size=${metadata.format.size} bytes`);
          resolve(metadata);
        }
      });
    });
  }

  /**
   * Cleans up temporary chunk files
   */
  async cleanupChunks(chunks: VideoChunk[]): Promise<void> {
    for (const chunk of chunks) {
      try {
        if (fs.existsSync(chunk.filePath)) {
          fs.unlinkSync(chunk.filePath);
        }
      } catch (error) {
        console.warn(`Failed to cleanup chunk ${chunk.filePath}:`, error);
      }
    }
  }

  /**
   * Estimates chunk duration based on target file size and bitrate
   */
  static estimateChunkDuration(totalDuration: number, fileSize: number): number {
    const estimatedBitrate = (fileSize * 8) / totalDuration; // bits per second
    const targetDuration = (VideoChunkingService.MAX_CHUNK_SIZE * 8) / estimatedBitrate;
    return Math.min(targetDuration, totalDuration);
  }

  /**
   * SMART SOLUTION: Concatenates video chunks back into a single seamless video for playback
   * This eliminates all chunking complexity from the client-side
   */
  async concatenateChunksForPlayback(videoId: string, chunks: VideoChunk[]): Promise<string> {
    console.log(`🔧 Concatenating ${chunks.length} chunks for seamless playback`);
    
    if (chunks.length === 0) {
      throw new Error('No chunks to concatenate');
    }

    if (chunks.length === 1) {
      console.log('📹 Single chunk - returning original file');
      return chunks[0].filePath;
    }

    // Sort chunks by index to ensure correct order
    const sortedChunks = chunks.sort((a, b) => a.index - b.index);
    
    const outputPath = path.join(this.tempDir, `${videoId}_concatenated.mp4`);
    
    // Check if concatenated file already exists (caching)
    if (fs.existsSync(outputPath)) {
      console.log('✅ Using cached concatenated file');
      return outputPath;
    }

    console.log(`🔗 Creating concatenated video: ${outputPath}`);

    // Create a text file listing all chunks for FFmpeg concat
    const concatListPath = path.join(this.tempDir, `${videoId}_concat_list.txt`);
    const concatList = sortedChunks.map(chunk => `file '${chunk.filePath}'`).join('\n');
    fs.writeFileSync(concatListPath, concatList);

    try {
      await this.concatenateWithFFmpeg(concatListPath, outputPath);
      
      // Clean up the concat list file
      fs.unlinkSync(concatListPath);
      
      console.log(`✅ Successfully concatenated ${chunks.length} chunks into seamless video`);
      return outputPath;
    } catch (error) {
      // Clean up on error
      if (fs.existsSync(concatListPath)) {
        fs.unlinkSync(concatListPath);
      }
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      throw error;
    }
  }

  /**
   * Uses FFmpeg to concatenate video files seamlessly
   */
  private async concatenateWithFFmpeg(concatListPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error(`⏰ FFmpeg concatenation timeout`);
        reject(new Error('FFmpeg concatenation timeout'));
      }, 5 * 60 * 1000); // 5 minute timeout

      ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .videoCodec('copy') // Copy without re-encoding for speed
        .audioCodec('copy') // Copy without re-encoding for speed
        .format('mp4')
        .outputOptions(['-movflags', '+faststart']) // Optimize for streaming
        .on('start', (commandLine) => {
          console.log(`🚀 FFmpeg concatenation started: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent && progress.percent % 20 === 0) { // Report every 20%
            console.log(`📊 Concatenation progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          clearTimeout(timeout);
          console.log(`✅ FFmpeg concatenation completed`);
          resolve();
        })
        .on('error', (err, stdout, stderr) => {
          clearTimeout(timeout);
          console.error(`❌ FFmpeg concatenation error:`, err.message);
          console.error(`📝 FFmpeg stderr:`, stderr);
          reject(err);
        })
        .save(outputPath);
    });
  }
}