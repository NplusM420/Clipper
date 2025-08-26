import type { Express } from "express";
import { createServer, type Server } from "http";
// WebSocket imports removed to avoid conflict with Vite dev server
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { TranscriptionService } from "./services/transcriptionService";
import { VideoProcessingService } from "./services/videoProcessingService";
import { insertVideoSchema, insertClipSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Object storage routes for private files
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
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
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Video upload endpoints
  app.post("/api/videos/upload-url", isAuthenticated, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.post("/api/videos", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
          visibility: "private",
        }
      );

      // Create video record
      const video = await storage.createVideo(userId, {
        ...videoData,
        originalPath: videoPath,
      });

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
      const userId = req.user.claims.sub;
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
      if (video.userId !== req.user.claims.sub) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(video);
    } catch (error) {
      console.error("Error fetching video:", error);
      res.status(500).json({ error: "Failed to fetch video" });
    }
  });

  // Transcript endpoints
  app.get("/api/videos/:id/transcript", isAuthenticated, async (req: any, res) => {
    try {
      const video = await storage.getVideo(req.params.id);
      if (!video || video.userId !== req.user.claims.sub) {
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
      const userId = req.user.claims.sub;
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
      if (!video || video.userId !== req.user.claims.sub) {
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
      const userId = req.user.claims.sub;
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
      if (!clip || clip.userId !== req.user.claims.sub) {
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
      const userId = req.user.claims.sub;
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
