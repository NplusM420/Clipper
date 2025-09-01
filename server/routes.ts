import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./auth";
import { sql } from "drizzle-orm";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { TranscriptionService } from "./services/transcriptionService";
import { VideoProcessingService } from "./services/videoProcessingService";
import { VideoChunkingService } from "./services/videoChunkingService";
import { initializeProgressService } from "./services/progressService";
import { insertVideoSchema, insertClipSchema } from "@shared/schema";
import { LIMITS } from "@shared/constants";
import { validateBody, validateParams, validationSchemas, validateVideoFile, sanitizeFilename } from "./services/validationService";
import multer from "multer";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import https from "https";
import http from "http";

// Helper functions for seamless video concatenation
async function downloadFile(url: string, outputPath: string): Promise<void> {
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

async function concatenateWithFFmpeg(concatListPath: string, outputPath: string): Promise<void> {
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
        console.log(`🚀 FFmpeg concatenation started: ${commandLine}`);
      })
      .on('progress', (progress) => {
        if (progress.percent && progress.percent % 25 === 0) {
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

export async function registerRoutes(app: Express, io?: SocketServer): Promise<Server> {
  // Initialize progress service
  const progressService = initializeProgressService(io);

  // Health check endpoint (no auth required)
  app.get("/health", async (req, res) => {
    try {
      // Test database connection with a simple query
      const { db } = await import("./db");
      await db.execute(sql`SELECT 1`);

      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        services: {
          database: "connected",
          application: "running"
        }
      });
    } catch (error) {
      console.error("Health check failed:", error);
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "Database connection failed"
      });
    }
  });

  // Auth middleware
  await setupAuth(app);

  // Current user route is handled by auth.ts

  // Object storage routes for private files
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.id;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        return res.sendStatus(401);
      }
      objectStorageService.downloadObjectEntity(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Video streaming endpoint for authenticated video playback
  app.get("/api/videos/:videoId/stream", isAuthenticated, async (req: any, res) => {
    try {
      const video = await storage.getVideo(req.params.videoId);
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Check if user owns the video
      if (video.userId !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Extract the Cloudinary public ID from originalPath
      const objectFile = video.originalPath?.replace('/objects/', '') || '';
      if (!objectFile) {
        return res.status(404).json({ error: "Video file not found" });
      }

      // Use object storage to stream the video
      const objectStorageService = new ObjectStorageService();
      objectStorageService.downloadObjectEntity(objectFile, res);
    } catch (error) {
      console.error("Error streaming video:", error);
      res.status(500).json({ error: "Failed to stream video" });
    }
  });

  // Server-side video upload endpoint with automatic chunking support
  app.post("/api/videos/upload", isAuthenticated, async (req: any, res) => {
    try {
      console.log("🚀 Direct server upload for user:", req.user?.id);
      
      const objectStorageService = new ObjectStorageService();
      const videoChunkingService = new VideoChunkingService();
      
      // Use multer to handle the file upload
      const upload = multer({
        limits: { fileSize: LIMITS.MAX_VIDEO_SIZE },
        storage: multer.memoryStorage(),
        fileFilter: (req, file, cb) => {
          // Only allow MP4 files
          if (file.mimetype !== 'video/mp4') {
            return cb(new Error('Only MP4 files are allowed'));
          }
          cb(null, true);
        }
      }).single('file');
      
      upload(req, res, async (err) => {
        if (err) {
          console.error("❌ Multer error:", err);
          return res.status(400).json({ error: "File upload error" });
        }
        
        if (!req.file) {
          return res.status(400).json({ error: "No file uploaded" });
        }

        // Create unique upload ID for progress tracking
        const uploadId = `upload_${Date.now()}_${req.user?.id}`;
        const progressSession = progressService.createUploadSession(uploadId);
        
        console.log("📁 File received:", {
          originalName: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype
        });

        // Emit initial upload complete event
        progressSession.emitPhase('upload', 'File uploaded successfully', 100);

        // Save file temporarily for processing
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        const tempFilePath = path.join(tempDir, `upload_${Date.now()}.mp4`);
        fs.writeFileSync(tempFilePath, req.file.buffer);
        
        try {
          // Emit analysis phase
          progressSession.emitPhase('analysis', 'Analyzing video...', 10);

          // Analyze if chunking is needed
          const analysis = await videoChunkingService.analyzeVideo(tempFilePath);
          console.log("📊 Video analysis:", analysis);

          progressSession.emitPhase('analysis', 'Video analysis complete', 20);

          if (!analysis.needsChunking) {
            // File is small enough, upload directly
            console.log("📤 Uploading directly (no chunking needed)");
            progressSession.emitPhase('cloudinary', 'Uploading video to Cloudinary...', 40);

            const result = await objectStorageService.uploadVideo(req.file.buffer, {
              folder: 'video-clipper/uploads',
              public_id: `video_${Date.now()}`,
              resource_type: 'video'
            });
            
            // Clean up temp file
            fs.unlinkSync(tempFilePath);

            progressSession.emitPhase('complete', 'Upload complete!', 100);
            
            res.json({
              uploadId,
              secure_url: result.secure_url,
              public_id: result.public_id,
              resource_type: result.resource_type,
              bytes: result.bytes,
              duration: result.duration,
              isChunked: false,
              totalChunks: 1
            });
            
          } else {
            // File needs chunking
            console.log("✂️ Chunking video into", analysis.estimatedChunks, "parts");
            progressSession.emitPhase('chunking', `Creating ${analysis.estimatedChunks} video chunks...`, 30);

            const videoId = `video_${Date.now()}`;
            
            // We'll need to modify videoChunkingService to emit progress
            const chunks = await videoChunkingService.chunkVideo(tempFilePath, videoId, progressSession);
            
            console.log(`📦 Created ${chunks.length} chunks, uploading to Cloudinary...`);
            progressSession.emitPhase('cloudinary', 'Starting chunk uploads to Cloudinary...', 60);
            
            // Upload each chunk to Cloudinary
            const uploadedParts = [];
            for (let i = 0; i < chunks.length; i++) {
              const chunk = chunks[i];
              console.log(`📤 Uploading chunk ${i + 1}/${chunks.length} (${chunk.fileSize} bytes)`);
              
              // Emit chunk upload progress
              progressSession.emitChunkProgress(i, chunks.length, 0, 'Uploading to Cloudinary');
              
              const chunkBuffer = fs.readFileSync(chunk.filePath);
              const chunkResult = await objectStorageService.uploadVideo(chunkBuffer, {
                folder: 'video-clipper/uploads',
                public_id: `${videoId}_part_${chunk.index}`,
                resource_type: 'video'
              });
              
              // Emit chunk upload complete
              progressSession.emitChunkProgress(i, chunks.length, 100, 'Uploaded to Cloudinary');
              
              uploadedParts.push({
                index: chunk.index,
                startTime: chunk.startTime,
                endTime: chunk.endTime,
                duration: chunk.duration,
                cloudinaryPublicId: chunkResult.public_id,
                size: chunk.fileSize,
                secure_url: chunkResult.secure_url
              });
            }
            
            // Clean up temp files
            progressSession.emitPhase('database', 'Cleaning up temporary files...', 90);
            await videoChunkingService.cleanupChunks(chunks);
            fs.unlinkSync(tempFilePath);
            
            console.log("✅ All chunks uploaded successfully");
            progressSession.emitPhase('complete', 'Video processing complete!', 100);
            
            res.json({
              uploadId,
              secure_url: uploadedParts[0].secure_url, // First part URL for compatibility
              public_id: videoId, // Master video ID
              resource_type: 'video',
              bytes: analysis.fileSize,
              duration: analysis.totalDuration,
              isChunked: true,
              totalChunks: chunks.length,
              parts: uploadedParts
            });
          }
          
        } catch (uploadError: any) {
          console.error("❌ Upload/chunking error:", uploadError);
          
          // Clean up temp file on error
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
          
          const errorMessage = uploadError.message || "Failed to process video upload";
          res.status(500).json({ error: errorMessage });
        }
      });
      
    } catch (error) {
      console.error("❌ Error in server upload:", error);
      res.status(500).json({ error: "Failed to process upload" });
    }
  });

  app.post("/api/videos", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const videoData = insertVideoSchema.parse(req.body);

      // Validate video duration (max 1 hour)
      if (videoData.duration > 3600) {
        return res.status(400).json({ error: "Video duration exceeds 1 hour limit" });
      }

      // Set ACL policy for uploaded video
      const objectStorageService = new ObjectStorageService();
      const videoPath = await objectStorageService.trySetObjectEntityAclPolicy(
        videoData.originalPath,
        {
          owner: userId,
          read: [],
          write: [],
        }
      );

      // Create video record
      const video = await storage.createVideo(userId, {
        ...videoData,
        originalPath: videoPath,
      });

      // If this is a chunked video, create video parts records
      if (videoData.isChunked && req.body.parts) {
        console.log(`📝 Creating ${req.body.parts.length} video part records`);
        for (const part of req.body.parts) {
          await storage.createVideoPart({
            videoId: video.id,
            partIndex: part.index,
            startTime: part.startTime,
            endTime: part.endTime,
            duration: part.duration,
            cloudinaryPublicId: part.cloudinaryPublicId,
            size: part.size,
            status: 'ready'
          });
        }
      }

      // Update video status to ready
      await storage.updateVideoStatus(video.id, "ready");

      // Start transcription process
      const user = await storage.getUser(userId);
      if (user?.openaiApiKey) {
        const transcriptionService = new TranscriptionService(user.openaiApiKey);
        
        // Set up real-time progress tracking
        if (io) {
          transcriptionService.setProgressCallback((videoId, progress) => {
            io.to(`user:${userId}`).emit('transcription_progress', {
              videoId,
              ...progress
            });
          });
        }
        
        // Run transcription in background
        transcriptionService.transcribeVideo(video.id, userId).catch(console.error);
      }

      res.json(video);
    } catch (error) {
      console.error("❌ Error creating video:", error);
      
      // If it's a Zod validation error, provide detailed info
      if ((error as any).name === 'ZodError') {
        console.error("🚨 Zod validation failed:", (error as any).errors);
        return res.status(400).json({ 
          error: "Invalid video data", 
          details: (error as any).errors 
        });
      }
      
      res.status(500).json({ error: "Failed to create video" });
    }
  });

  // Video management endpoints
  app.get("/api/videos", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const videos = await storage.getUserVideos(userId);
      res.json(videos);
    } catch (error) {
      console.error("Error fetching videos:", error);
      res.status(500).json({ error: "Failed to fetch videos" });
    }
  });

  app.get("/api/videos/:id", isAuthenticated, async (req: any, res) => {
    try {
      const video = await storage.getVideo(req.params.id);
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Check if user owns the video
      if (video.userId !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(video);
    } catch (error) {
      console.error("Error fetching video:", error);
      res.status(500).json({ error: "Failed to fetch video" });
    }
  });

  // Delete a video
  app.delete("/api/videos/:id", isAuthenticated, async (req: any, res) => {
    try {
      const video = await storage.getVideo(req.params.id);
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Check if user owns the video
      if (video.userId !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      console.log(`🗑️ Starting deletion of video: ${video.filename} (${req.params.id})`);

      // Get all clips for this video before deletion
      const clips = await storage.getVideoClips(req.params.id);
      console.log(`📄 Found ${clips.length} clips to delete`);

      // Get all video parts for chunked videos before deletion
      const videoParts = video.isChunked ? await storage.getVideoParts(req.params.id) : [];
      console.log(`📦 Found ${videoParts.length} video parts to delete`);

      const objectStorage = new ObjectStorageService();
      const deletionResults: string[] = [];

      // Delete clips from Cloudinary
      for (const clip of clips) {
        if (clip.outputPath) {
          try {
            const publicId = objectStorage.extractPublicId(clip.outputPath);
            await objectStorage.deleteFile(publicId, 'video');
            deletionResults.push(`✅ Deleted clip: ${publicId}`);
            console.log(`✅ Deleted clip from Cloudinary: ${publicId}`);
          } catch (error) {
            console.error(`❌ Failed to delete clip ${clip.id} from Cloudinary:`, error);
            deletionResults.push(`❌ Failed to delete clip: ${clip.name}`);
          }
        }
      }

      // Delete video parts from Cloudinary (for chunked videos)
      for (const part of videoParts) {
        try {
          await objectStorage.deleteFile(part.cloudinaryPublicId, 'video');
          deletionResults.push(`✅ Deleted video part: ${part.cloudinaryPublicId}`);
          console.log(`✅ Deleted video part from Cloudinary: ${part.cloudinaryPublicId}`);
        } catch (error) {
          console.error(`❌ Failed to delete video part ${part.id} from Cloudinary:`, error);
          deletionResults.push(`❌ Failed to delete video part: ${part.cloudinaryPublicId}`);
        }
      }

      // Delete main video from Cloudinary
      if (video.originalPath && !video.isChunked) {
        try {
          const publicId = objectStorage.extractPublicId(video.originalPath);
          await objectStorage.deleteFile(publicId, 'video');
          deletionResults.push(`✅ Deleted main video: ${publicId}`);
          console.log(`✅ Deleted main video from Cloudinary: ${publicId}`);
        } catch (error) {
          console.error(`❌ Failed to delete main video from Cloudinary:`, error);
          deletionResults.push(`❌ Failed to delete main video: ${video.filename}`);
        }
      }

      // Delete from database (this will cascade delete all related records)
      await storage.deleteVideo(req.params.id);
      console.log(`✅ Deleted video from database: ${req.params.id}`);
      
      res.json({ 
        message: "Video deleted successfully",
        cloudinaryResults: deletionResults,
        deletedItems: {
          video: video.filename,
          clips: clips.length,
          videoParts: videoParts.length
        }
      });
    } catch (error) {
      console.error("Error deleting video:", error);
      res.status(500).json({ error: "Failed to delete video" });
    }
  });

  // Debug endpoint to test database queries
  app.get("/api/debug/video-parts/:id", isAuthenticated, async (req: any, res) => {
    try {
      console.log("🔧 DEBUG: Testing video parts query for ID:", req.params.id);
      
      // Test the storage method directly
      const parts = await storage.getVideoParts(req.params.id);
      console.log("🔧 DEBUG: Direct storage query result:", parts);
      
      // Test raw database query
      const { videoParts } = require('../shared/schema');
      const { eq } = require('drizzle-orm');
      const db = require('./db').db;
      
      const rawParts = await db
        .select()
        .from(videoParts)
        .where(eq(videoParts.videoId, req.params.id));
      
      console.log("🔧 DEBUG: Raw database query result:", rawParts);
      
      res.json({
        storageMethod: parts,
        rawQuery: rawParts,
        videoId: req.params.id
      });
    } catch (error) {
      console.error("🔧 DEBUG: Error in debug endpoint:", error);
      res.status(500).json({ error: (error as any).message });
    }
  });

  // Sync video data - fix mismatches between database and storage
  app.post("/api/videos/:id/sync", isAuthenticated, async (req: any, res) => {
    try {
      const video = await storage.getVideo(req.params.id);
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Check if user owns the video
      if (video.userId !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      let syncedData: { fixed: any[], issues: any[] } = { fixed: [], issues: [] };

      if (video.isChunked) {
        // Check if video parts exist
        const parts = await storage.getVideoParts(req.params.id);
        
        if (parts.length === 0 && video.totalChunks && video.totalChunks > 0) {
          // Video is marked as chunked but has no parts
          // For now, mark it as non-chunked so it uses originalPath
          await storage.updateVideo(req.params.id, { 
            isChunked: false, 
            totalChunks: 1 
          });
          
          syncedData.fixed.push({
            type: 'chunk_mismatch',
            action: 'marked_as_non_chunked',
            reason: 'No video parts found for chunked video'
          });
        }
      }

      const updatedVideo = await storage.getVideo(req.params.id);
      res.json({ 
        video: updatedVideo, 
        syncResults: syncedData 
      });
      
    } catch (error) {
      console.error("Error syncing video:", error);
      res.status(500).json({ error: "Failed to sync video data" });
    }
  });

  // Get video parts for chunked videos
  app.get("/api/videos/:id/parts", isAuthenticated, async (req: any, res) => {
    try {
      console.log(`🎬 GET /api/videos/${req.params.id}/parts - User: ${req.user.id}`);
      
      const video = await storage.getVideo(req.params.id);
      if (!video) {
        console.log("❌ Video not found");
        return res.status(404).json({ error: "Video not found" });
      }

      // Check if user owns the video
      if (video.userId !== req.user.id) {
        console.log(`🚫 Access denied - Video owner: ${video.userId}, Request user: ${req.user.id}`);
        return res.status(403).json({ error: "Access denied" });
      }

      console.log(`📹 Video found: ${video.filename}, isChunked: ${video.isChunked}, totalChunks: ${video.totalChunks}`);

      if (!video.isChunked) {
        console.log("📄 Video is not chunked, returning empty array");
        return res.json([]);
      }

      const parts = await storage.getVideoParts(req.params.id);
      console.log(`📦 Returning ${parts.length} video parts`);
      res.json(parts);
    } catch (error) {
      console.error("❌ Error fetching video parts:", error);
      res.status(500).json({ error: "Failed to fetch video parts" });
    }
  });

  // SMART SOLUTION: Seamless video playback endpoint
  app.get("/api/videos/:id/playback", isAuthenticated, async (req: any, res) => {
    try {
      console.log(`🎬 GET /api/videos/${req.params.id}/playback - User: ${req.user.id}`);
      
      const video = await storage.getVideo(req.params.id);
      if (!video || video.userId !== req.user.id) {
        return res.status(404).json({ error: "Video not found" });
      }

      // For non-chunked videos, return the original path
      if (!video.isChunked) {
        return res.json({ playbackUrl: video.originalPath, isSeamless: false });
      }

      // For chunked videos, provide seamless playback URL
      console.log(`📹 Chunked video detected, providing seamless playback`);
      const seamlessUrl = `/api/videos/${req.params.id}/seamless`;
      res.json({ 
        playbackUrl: seamlessUrl,
        isSeamless: true,
        message: "Using seamless concatenated playback"
      });

    } catch (error) {
      console.error("❌ Error getting video playback:", error);
      res.status(500).json({ error: "Failed to get video playback" });
    }
  });

  // Serve seamless concatenated video
  app.get("/api/videos/:id/seamless", isAuthenticated, async (req: any, res) => {
    try {
      const video = await storage.getVideo(req.params.id);
      if (!video || video.userId !== req.user.id) {
        return res.status(404).json({ error: "Video not found" });
      }

      if (!video.isChunked) {
        // Redirect to original for non-chunked videos
        return res.redirect(video.originalPath || '');
      }

      // For chunked videos: concatenate chunks to create seamless video
      console.log(`🔗 Creating seamless video from ${video.totalChunks} chunks`);
      
      const parts = await storage.getVideoParts(req.params.id);
      if (parts.length === 0) {
        return res.status(404).json({ error: "No video parts found" });
      }

      // Import video chunking service
      const { VideoChunkingService } = await import('./services/videoChunkingService');
      const chunkingService = new VideoChunkingService();
      
      // Download and concatenate chunks
      const tempDir = path.join(process.cwd(), 'temp');
      
      // Ensure temp directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const concatenatedPath = path.join(tempDir, `${req.params.id}_seamless.mp4`);
      
      // Check if concatenated video already exists (caching)
      if (fs.existsSync(concatenatedPath)) {
        console.log('✅ Using cached concatenated video');
        return res.sendFile(concatenatedPath);
      }

      console.log('🔄 Downloading and concatenating chunks...');
      
      // Sort parts by partIndex to ensure correct order
      const sortedParts = parts.sort((a, b) => a.partIndex - b.partIndex);
      
      // Download all chunks from Cloudinary
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'dapernzun';
      const chunkPaths: string[] = [];
      
      for (let i = 0; i < sortedParts.length; i++) {
        const part = sortedParts[i];
        const chunkUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${part.cloudinaryPublicId}`;
        const chunkPath = path.join(tempDir, `${req.params.id}_chunk_${part.partIndex}.mp4`);
        
        console.log(`📥 Downloading chunk ${i + 1}/${sortedParts.length}: ${part.cloudinaryPublicId}`);
        await downloadFile(chunkUrl, chunkPath);
        chunkPaths.push(chunkPath);
      }

      // Create concat list file for FFmpeg
      const concatListPath = path.join(tempDir, `${req.params.id}_concat_list.txt`);
      const concatList = chunkPaths.map(p => `file '${p}'`).join('\n');
      fs.writeFileSync(concatListPath, concatList);

      // Concatenate using FFmpeg
      console.log('🔗 Concatenating chunks with FFmpeg...');
      await concatenateWithFFmpeg(concatListPath, concatenatedPath);

      // Clean up temporary files
      chunkPaths.forEach(p => {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      });
      if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);

      console.log('✅ Seamless video created, serving file');
      res.sendFile(concatenatedPath);

    } catch (error) {
      console.error("❌ Error creating seamless video:", error);
      res.status(500).json({ error: "Failed to create seamless video" });
    }
  });

  // Transcript endpoints
  app.get("/api/videos/:id/transcript", isAuthenticated, async (req: any, res) => {
    try {
      const video = await storage.getVideo(req.params.id);
      if (!video || video.userId !== req.user.id) {
        return res.status(404).json({ error: "Video not found" });
      }

      const transcript = await storage.getTranscriptByVideoId(req.params.id);
      res.json(transcript);
    } catch (error) {
      console.error("Error fetching transcript:", error);
      res.status(500).json({ error: "Failed to fetch transcript" });
    }
  });

  app.put("/api/transcripts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { segments } = req.body;
      await storage.updateTranscript(req.params.id, segments, true);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating transcript:", error);
      res.status(500).json({ error: "Failed to update transcript" });
    }
  });

  // Manual transcription trigger endpoint
  app.post("/api/videos/:id/transcribe", isAuthenticated, async (req: any, res) => {
    try {
      const videoId = req.params.id;
      const userId = req.user.id;
      
      // Verify user owns the video
      const video = await storage.getVideo(videoId);
      if (!video || video.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get user to check for OpenAI API key
      const user = await storage.getUser(userId);
      if (!user?.openaiApiKey) {
        return res.status(400).json({ error: "OpenAI API key not configured. Please add your API key in Settings." });
      }

      // Check if already processing
      if (video.transcriptionStatus === "processing") {
        return res.status(400).json({ error: "Transcription already in progress" });
      }

      // Start transcription process
      const transcriptionService = new TranscriptionService(user.openaiApiKey);
      
      // Set up real-time progress tracking
      if (io) {
        transcriptionService.setProgressCallback((videoId, progress) => {
          io.to(`user:${userId}`).emit('transcription_progress', {
            videoId,
            ...progress
          });
        });
      }
      
      // Run transcription in background and immediately return
      transcriptionService.transcribeVideo(videoId, userId).catch(console.error);
      
      // Update status to processing
      await storage.updateVideoTranscriptionStatus(videoId, "processing");
      
      res.json({ 
        success: true, 
        message: "Transcription started. This may take a few minutes to complete." 
      });
    } catch (error) {
      console.error("Error starting transcription:", error);
      res.status(500).json({ error: "Failed to start transcription" });
    }
  });

  // Clip endpoints
  app.post("/api/clips", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const clipData = insertClipSchema.parse(req.body);

      // Verify user owns the video
      const video = await storage.getVideo(clipData.videoId);
      if (!video || video.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Create clip
      const clip = await storage.createClip(userId, clipData);

      // Start processing
      const videoProcessingService = new VideoProcessingService();
      videoProcessingService.processClip(clip.id).catch(console.error);

      res.json(clip);
    } catch (error) {
      console.error("Error creating clip:", error);
      res.status(500).json({ error: "Failed to create clip" });
    }
  });

  app.get("/api/videos/:id/clips", isAuthenticated, async (req: any, res) => {
    try {
      const video = await storage.getVideo(req.params.id);
      if (!video || video.userId !== req.user.id) {
        return res.status(404).json({ error: "Video not found" });
      }

      const clips = await storage.getVideoClips(req.params.id);
      res.json(clips);
    } catch (error) {
      console.error("Error fetching clips:", error);
      res.status(500).json({ error: "Failed to fetch clips" });
    }
  });

  app.get("/api/clips", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const clips = await storage.getUserClips(userId);
      res.json(clips);
    } catch (error) {
      console.error("Error fetching clips:", error);
      res.status(500).json({ error: "Failed to fetch clips" });
    }
  });

  // Download clip endpoint
  app.get("/api/clips/:id/download", isAuthenticated, async (req: any, res) => {
    try {
      const clip = await storage.getClip(req.params.id);
      if (!clip || clip.userId !== req.user.id) {
        return res.status(404).json({ error: "Clip not found" });
      }

      if (clip.status !== "ready" || !clip.outputPath) {
        return res.status(404).json({ error: "Clip not ready for download" });
      }

      // Generate Cloudinary URL from the public_id stored in outputPath
      const objectStorage = new ObjectStorageService();
      const downloadUrl = objectStorage.generateUrl(clip.outputPath, {
        resource_type: 'video',
        secure: true
      });

      console.log(`📥 Clip download: ${clip.name} (${clip.id}) -> ${downloadUrl}`);
      
      // Set proper download headers and redirect
      res.setHeader('Content-Disposition', `attachment; filename="${clip.name}.mp4"`);
      res.redirect(downloadUrl);
    } catch (error) {
      console.error("Error downloading clip:", error);
      res.status(500).json({ error: "Failed to download clip" });
    }
  });

  app.delete("/api/clips/:id", isAuthenticated, async (req: any, res) => {
    try {
      const clip = await storage.getClip(req.params.id);
      if (!clip || clip.userId !== req.user.id) {
        return res.status(404).json({ error: "Clip not found" });
      }

      await storage.deleteClip(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting clip:", error);
      res.status(500).json({ error: "Failed to delete clip" });
    }
  });

  // Settings endpoints
  app.put("/api/settings/openai-key", isAuthenticated, validateBody(validationSchemas.updateApiKey), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { apiKey } = req.validatedBody;

      // Test the API key format (additional validation is already done by validation middleware)
      try {
        const transcriptionService = new TranscriptionService(apiKey);
        // API key format is already validated by the validation middleware
      } catch (error) {
        return res.status(400).json({ error: "Invalid API key" });
      }

      // Update user with encrypted API key
      await storage.upsertUser({
        id: userId,
        openaiApiKey: apiKey, // Automatically encrypted by storage layer
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error saving API key:", error);
      res.status(500).json({ error: "Failed to save API key" });
    }
  });

  // HTTP server setup (WebSocket removed to avoid conflict with Vite)
  const httpServer = createServer(app);
  return httpServer;
}
