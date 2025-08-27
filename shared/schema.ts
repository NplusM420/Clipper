import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  integer,
  real,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// Users table (updated for username/password auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique().notNull(),
  password: text("password").notNull(), // Hashed password
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  openaiApiKey: text("openai_api_key"), // Encrypted storage
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Videos table
export const videos = pgTable("videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  originalPath: text("original_path").notNull(), // Object storage path
  duration: real("duration").notNull(), // Duration in seconds
  size: integer("size").notNull(), // File size in bytes
  status: varchar("status", { length: 20 }).notNull().default("uploading"), // uploading, processing, ready, error
  transcriptionStatus: varchar("transcription_status", { length: 20 }).default("pending"), // pending, processing, completed, error
  metadata: jsonb("metadata"), // Video metadata from FFmpeg
  isChunked: boolean("is_chunked").default(false), // Whether this video was split into chunks
  totalChunks: integer("total_chunks").default(1), // Number of chunks if split
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Video parts table for chunked videos
export const videoParts = pgTable("video_parts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoId: varchar("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  partIndex: integer("part_index").notNull(), // 0-based index of this part
  startTime: real("start_time").notNull(), // Start time in seconds within the original video
  endTime: real("end_time").notNull(), // End time in seconds within the original video
  duration: real("duration").notNull(), // Duration of this part in seconds
  cloudinaryPublicId: text("cloudinary_public_id").notNull(), // Cloudinary public ID for this part
  size: integer("size").notNull(), // File size in bytes of this part
  status: varchar("status", { length: 20 }).notNull().default("uploading"), // uploading, ready, error
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Transcripts table
export const transcripts = pgTable("transcripts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoId: varchar("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  segments: jsonb("segments").notNull(), // Array of transcript segments with timestamps
  confidence: real("confidence"), // Overall confidence score
  language: varchar("language", { length: 10 }), // Detected language
  isEdited: boolean("is_edited").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Clips table
export const clips = pgTable("clips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoId: varchar("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startTime: real("start_time").notNull(), // Start time in seconds
  endTime: real("end_time").notNull(), // End time in seconds
  duration: real("duration").notNull(), // Calculated duration
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, processing, ready, error
  outputPath: text("output_path"), // Object storage path for processed clip
  quality: varchar("quality", { length: 10 }).default("1080p"), // 1080p, 720p, 480p
  processingProgress: integer("processing_progress").default(0), // 0-100
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  firstName: true,
  lastName: true,
  profileImageUrl: true,
  openaiApiKey: true,
});

export const insertVideoSchema = createInsertSchema(videos).pick({
  filename: true,
  originalPath: true,
  duration: true,
  size: true,
  metadata: true,
  isChunked: true,
  totalChunks: true,
});

export const insertVideoPartSchema = createInsertSchema(videoParts).pick({
  videoId: true,
  partIndex: true,
  startTime: true,
  endTime: true,
  duration: true,
  cloudinaryPublicId: true,
  size: true,
  status: true,
});

export const insertTranscriptSchema = createInsertSchema(transcripts).pick({
  videoId: true,
  segments: true,
  confidence: true,
  language: true,
});

export const insertClipSchema = createInsertSchema(clips).pick({
  videoId: true,
  name: true,
  startTime: true,
  endTime: true,
  quality: true,
});

// Types  
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = Partial<z.infer<typeof insertUserSchema>> & { id: string };
export type User = typeof users.$inferSelect;
export type Video = typeof videos.$inferSelect;
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type Transcript = typeof transcripts.$inferSelect;
export type InsertTranscript = z.infer<typeof insertTranscriptSchema>;
export type Clip = typeof clips.$inferSelect;
export type InsertClip = z.infer<typeof insertClipSchema>;
export type VideoPart = typeof videoParts.$inferSelect;
export type InsertVideoPart = z.infer<typeof insertVideoPartSchema>;

// Transcript segment type
export type TranscriptSegment = {
  id: string;
  start: number;
  end: number;
  text: string;
  confidence?: number;
};
