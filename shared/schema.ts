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

// OpenRouter user settings
export const openRouterSettings = pgTable("openrouter_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  apiKey: text("api_key").notNull(), // Encrypted OpenRouter API key
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Cloudinary user settings
export const cloudinarySettings = pgTable("cloudinary_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  cloudName: text("cloud_name").notNull(), // Encrypted Cloudinary cloud name
  apiKey: text("api_key").notNull(), // Encrypted Cloudinary API key
  apiSecret: text("api_secret").notNull(), // Encrypted Cloudinary API secret
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Chat sessions
export const chatSessions = pgTable("chat_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  videoId: varchar("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  metadata: jsonb("metadata"), // Additional session data
});

// Chat messages
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  sender: varchar("sender", { length: 10 }).notNull(), // 'user' or 'ai'
  content: text("content").notNull(),
  messageType: varchar("message_type", { length: 20 }).notNull().default("text"), // text, clip_suggestion, analysis
  metadata: jsonb("metadata"), // Clip suggestions, processing info, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

// AI model calls tracking
export const aiModelCalls = pgTable("ai_model_calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => chatMessages.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  modelUsed: varchar("model_used", { length: 100 }).notNull(), // 'gemma-27b', 'glm-4.5', 'llama-4-maverick'
  tokensUsed: integer("tokens_used").notNull(),
  costCents: integer("cost_cents"), // Cost in cents
  processingTimeMs: integer("processing_time_ms"),
  success: boolean("success").notNull().default(true),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

// AI discovered clips (before creation)
export const aiDiscoveredClips = pgTable("ai_discovered_clips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => chatMessages.id, { onDelete: "cascade" }),
  videoId: varchar("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  startTime: real("start_time").notNull(),
  endTime: real("end_time").notNull(),
  confidence: integer("confidence").notNull(), // 0-100
  platform: varchar("platform", { length: 20 }), // 'tiktok', 'youtube', 'linkedin', etc.
  reasoning: text("reasoning"), // AI's explanation for why this is a good clip
  created: boolean("created").default(false), // Whether user created this clip
  createdAt: timestamp("created_at").defaultNow(),
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

export const insertOpenRouterSettingsSchema = createInsertSchema(openRouterSettings).pick({
  userId: true,
  apiKey: true,
});

export const insertCloudinarySettingsSchema = createInsertSchema(cloudinarySettings).pick({
  userId: true,
  cloudName: true,
  apiKey: true,
  apiSecret: true,
});

export const insertChatSessionSchema = createInsertSchema(chatSessions).pick({
  userId: true,
  videoId: true,
  title: true,
  metadata: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).pick({
  sessionId: true,
  sender: true,
  content: true,
  messageType: true,
  metadata: true,
});

export const insertAiModelCallSchema = createInsertSchema(aiModelCalls).pick({
  messageId: true,
  userId: true,
  modelUsed: true,
  tokensUsed: true,
  costCents: true,
  processingTimeMs: true,
  success: true,
  errorMessage: true,
});

export const insertAiDiscoveredClipSchema = createInsertSchema(aiDiscoveredClips).pick({
  messageId: true,
  videoId: true,
  title: true,
  description: true,
  startTime: true,
  endTime: true,
  confidence: true,
  platform: true,
  reasoning: true,
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
export type OpenRouterSettings = typeof openRouterSettings.$inferSelect;
export type InsertOpenRouterSettings = z.infer<typeof insertOpenRouterSettingsSchema>;
export type CloudinarySettings = typeof cloudinarySettings.$inferSelect;
export type InsertCloudinarySettings = z.infer<typeof insertCloudinarySettingsSchema>;
export type ChatSession = typeof chatSessions.$inferSelect;
export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type AiModelCall = typeof aiModelCalls.$inferSelect;
export type InsertAiModelCall = z.infer<typeof insertAiModelCallSchema>;
export type AiDiscoveredClip = typeof aiDiscoveredClips.$inferSelect;
export type InsertAiDiscoveredClip = z.infer<typeof insertAiDiscoveredClipSchema>;

// Transcript segment type
export type TranscriptSegment = {
  id: string;
  start: number;
  end: number;
  text: string;
  confidence?: number;
};
