import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./auth";
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
import multer from "multer";
import fs from "fs";
import path from "path";

export async function registerRoutes(app: Express, io?: SocketServer): Promise<Server> {
  // Initialize progress service
  const progressService = initializeProgressService(io);

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
        // Run transcription in background
        transcriptionService.transcribeVideo(video.id, userId).catch(console.error);
      }

      res.json(video);
    } catch (error) {
      console.error("Error creating video:", error);
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

  // Get video parts for chunked videos
  app.get("/api/videos/:id/parts", isAuthenticated, async (req: any, res) => {
    try {
      const video = await storage.getVideo(req.params.id);
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Check if user owns the video
      if (video.userId !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!video.isChunked) {
        return res.json([]);
      }

      const parts = await storage.getVideoParts(req.params.id);
      res.json(parts);
    } catch (error) {
      console.error("Error fetching video parts:", error);
      res.status(500).json({ error: "Failed to fetch video parts" });
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
  app.put("/api/settings/openai-key", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { apiKey } = req.body;

      if (!apiKey) {
        return res.status(400).json({ error: "API key is required" });
      }

      // Test the API key
      try {
        const transcriptionService = new TranscriptionService(apiKey);
        // Simple test - this would need a small test file
        // For now, just validate the format
        if (!apiKey.startsWith('sk-')) {
          throw new Error('Invalid API key format');
        }
      } catch (error) {
        return res.status(400).json({ error: "Invalid API key" });
      }

      // Update user with encrypted API key (in production, encrypt this)
      await storage.upsertUser({
        id: userId,
        openaiApiKey: apiKey, // Should be encrypted in production
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
