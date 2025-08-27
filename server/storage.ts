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
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(userData: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
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
    const [user] = await db
      .update(users)
      .set({
        ...userData,
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
    return await db
      .select()
      .from(videoParts)
      .where(eq(videoParts.videoId, videoId))
      .orderBy(videoParts.partIndex);
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
