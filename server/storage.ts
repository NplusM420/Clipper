import {
  users,
  videos,
  transcripts,
  clips,
  videoParts,
  type User,
  type InsertUser,
  type UpsertUser,
  type Video,
  type InsertVideo,
  type Transcript,
  type InsertTranscript,
  type Clip,
  type InsertClip,
  type VideoPart,
  type InsertVideoPart,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";
import { EncryptionService } from "./services/encryptionService";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, userData: Partial<InsertUser>): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Video operations
  createVideo(userId: string, video: InsertVideo): Promise<Video>;
  getVideo(id: string): Promise<Video | undefined>;
  getUserVideos(userId: string): Promise<Video[]>;
  updateVideoStatus(id: string, status: string): Promise<void>;
  updateVideoTranscriptionStatus(id: string, status: string): Promise<void>;
  updateVideo(id: string, data: Partial<InsertVideo>): Promise<void>;
  deleteVideo(id: string): Promise<void>;
  
  // Transcript operations
  createTranscript(transcript: InsertTranscript): Promise<Transcript>;
  getTranscriptByVideoId(videoId: string): Promise<Transcript | undefined>;
  updateTranscript(id: string, segments: any, isEdited?: boolean): Promise<void>;
  
  // Clip operations
  createClip(userId: string, clip: InsertClip): Promise<Clip>;
  getClip(id: string): Promise<Clip | undefined>;
  getVideoClips(videoId: string): Promise<Clip[]>;
  getUserClips(userId: string): Promise<Clip[]>;
  updateClipStatus(id: string, status: string, outputPath?: string): Promise<void>;
  updateClipProgress(id: string, progress: number): Promise<void>;
  deleteClip(id: string): Promise<void>;

  // Video parts operations (for chunked videos)
  createVideoPart(videoPart: InsertVideoPart): Promise<VideoPart>;
  getVideoParts(videoId: string): Promise<VideoPart[]>;
  updateVideoPartStatus(id: string, status: string): Promise<void>;
  deleteVideoParts(videoId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      if (user && user.openaiApiKey) {
        try {
          // Decrypt API key transparently
          user.openaiApiKey = EncryptionService.decrypt(user.openaiApiKey);
        } catch (error) {
          console.warn('Failed to decrypt API key for user:', id);
          user.openaiApiKey = null;
        }
      }
      return user;
    } catch (error) {
      console.error('Database error getting user:', error);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.username, username));
      if (user && user.openaiApiKey) {
        try {
          // Decrypt API key transparently
          user.openaiApiKey = EncryptionService.decrypt(user.openaiApiKey);
        } catch (error) {
          console.warn('Failed to decrypt API key for user:', username);
          user.openaiApiKey = null;
        }
      }
      return user;
    } catch (error) {
      console.error('Database error getting user by username:', error);
      return undefined;
    }
  }

  async createUser(userData: InsertUser): Promise<User> {
    // Encrypt API key if provided
    const createData = { ...userData };
    if (createData.openaiApiKey) {
      try {
        createData.openaiApiKey = EncryptionService.encrypt(createData.openaiApiKey);
      } catch (error) {
        console.error('Failed to encrypt API key:', error);
        throw new Error('Failed to secure API key');
      }
    }
    
    const [user] = await db.insert(users).values(createData).returning();
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // For updates (when id exists), just update specific fields
    if (userData.id) {
      return this.updateUser(userData.id, userData);
    }
    // For inserts, we need all required fields
    const [user] = await db
      .insert(users)
      .values(userData as InsertUser)
      .returning();
    return user;
  }

  async updateUser(id: string, userData: Partial<InsertUser>): Promise<User> {
    // Encrypt API key if provided
    const updateData = { ...userData };
    if (updateData.openaiApiKey) {
      try {
        updateData.openaiApiKey = EncryptionService.encrypt(updateData.openaiApiKey);
      } catch (error) {
        console.error('Failed to encrypt API key:', error);
        throw new Error('Failed to secure API key');
      }
    }
    
    const [user] = await db
      .update(users)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Video operations
  async createVideo(userId: string, video: InsertVideo): Promise<Video> {
    const [newVideo] = await db
      .insert(videos)
      .values({ ...video, userId })
      .returning();
    return newVideo;
  }

  async getVideo(id: string): Promise<Video | undefined> {
    const [video] = await db.select().from(videos).where(eq(videos.id, id));
    return video;
  }

  async getUserVideos(userId: string): Promise<Video[]> {
    return db
      .select()
      .from(videos)
      .where(eq(videos.userId, userId))
      .orderBy(desc(videos.createdAt));
  }

  async updateVideoStatus(id: string, status: string): Promise<void> {
    await db
      .update(videos)
      .set({ status, updatedAt: new Date() })
      .where(eq(videos.id, id));
  }

  async updateVideoTranscriptionStatus(id: string, status: string): Promise<void> {
    await db
      .update(videos)
      .set({ transcriptionStatus: status, updatedAt: new Date() })
      .where(eq(videos.id, id));
  }

  async updateVideo(id: string, data: Partial<InsertVideo>): Promise<void> {
    await db
      .update(videos)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(videos.id, id));
  }

  async deleteVideo(id: string): Promise<void> {
    await db.delete(videos).where(eq(videos.id, id));
    // Note: Cascade deletes will handle video_parts, transcripts, and clips automatically
  }

  // Transcript operations
  async createTranscript(transcript: InsertTranscript): Promise<Transcript> {
    const [newTranscript] = await db
      .insert(transcripts)
      .values(transcript)
      .returning();
    return newTranscript;
  }

  async getTranscriptByVideoId(videoId: string): Promise<Transcript | undefined> {
    const [transcript] = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.videoId, videoId));
    return transcript;
  }

  async updateTranscript(id: string, segments: any, isEdited = false): Promise<void> {
    await db
      .update(transcripts)
      .set({ segments, isEdited, updatedAt: new Date() })
      .where(eq(transcripts.id, id));
  }

  // Clip operations
  async createClip(userId: string, clip: InsertClip): Promise<Clip> {
    const duration = clip.endTime - clip.startTime;
    const [newClip] = await db
      .insert(clips)
      .values({ ...clip, userId, duration })
      .returning();
    return newClip;
  }

  async getClip(id: string): Promise<Clip | undefined> {
    const [clip] = await db.select().from(clips).where(eq(clips.id, id));
    return clip;
  }

  async getVideoClips(videoId: string): Promise<Clip[]> {
    return db
      .select()
      .from(clips)
      .where(eq(clips.videoId, videoId))
      .orderBy(clips.startTime);
  }

  async getUserClips(userId: string): Promise<Clip[]> {
    return db
      .select()
      .from(clips)
      .where(eq(clips.userId, userId))
      .orderBy(desc(clips.createdAt));
  }

  async updateClipStatus(id: string, status: string, outputPath?: string): Promise<void> {
    const updateData: any = { status, updatedAt: new Date() };
    if (outputPath) {
      updateData.outputPath = outputPath;
    }
    await db.update(clips).set(updateData).where(eq(clips.id, id));
  }

  async updateClipProgress(id: string, progress: number): Promise<void> {
    await db
      .update(clips)
      .set({ processingProgress: progress, updatedAt: new Date() })
      .where(eq(clips.id, id));
  }

  async deleteClip(id: string): Promise<void> {
    await db.delete(clips).where(eq(clips.id, id));
  }

  // Video parts operations (for chunked videos)
  async createVideoPart(videoPart: InsertVideoPart): Promise<VideoPart> {
    const [newVideoPart] = await db
      .insert(videoParts)
      .values(videoPart)
      .returning();
    return newVideoPart;
  }

  async getVideoParts(videoId: string): Promise<VideoPart[]> {
    console.log('🔍 Querying video parts for videoId:', videoId);
    
    // First, let's see what video IDs exist in video_parts table
    const allParts = await db.select().from(videoParts).limit(10);
    console.log('🔍 All video parts in DB (first 10):', allParts.map(p => ({ id: p.id, videoId: p.videoId, partIndex: p.partIndex })));
    
    const parts = await db
      .select()
      .from(videoParts)
      .where(eq(videoParts.videoId, videoId))
      .orderBy(videoParts.partIndex);
    console.log('📦 Found video parts:', parts.length, 'parts for videoId:', videoId);
    return parts;
  }

  async updateVideoPartStatus(id: string, status: string): Promise<void> {
    await db
      .update(videoParts)
      .set({ status, updatedAt: new Date() })
      .where(eq(videoParts.id, id));
  }

  async deleteVideoParts(videoId: string): Promise<void> {
    await db.delete(videoParts).where(eq(videoParts.videoId, videoId));
  }
}

export const storage = new DatabaseStorage();
