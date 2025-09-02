-- Add new tables for chat functionality

-- OpenRouter user settings
CREATE TABLE IF NOT EXISTS "openrouter_settings" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "api_key" text NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Chat sessions
CREATE TABLE IF NOT EXISTS "chat_sessions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "video_id" varchar NOT NULL REFERENCES "videos"("id") ON DELETE cascade,
  "title" varchar(255),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "metadata" jsonb
);

-- Chat messages
CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" varchar NOT NULL REFERENCES "chat_sessions"("id") ON DELETE cascade,
  "sender" varchar(10) NOT NULL,
  "content" text NOT NULL,
  "message_type" varchar(20) NOT NULL DEFAULT 'text',
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now()
);

-- AI model calls tracking
CREATE TABLE IF NOT EXISTS "ai_model_calls" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" varchar NOT NULL REFERENCES "chat_messages"("id") ON DELETE cascade,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "model_used" varchar(100) NOT NULL,
  "tokens_used" integer NOT NULL,
  "cost_cents" integer,
  "processing_time_ms" integer,
  "success" boolean NOT NULL DEFAULT true,
  "error_message" text,
  "created_at" timestamp DEFAULT now()
);

-- AI discovered clips (before creation)
CREATE TABLE IF NOT EXISTS "ai_discovered_clips" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" varchar NOT NULL REFERENCES "chat_messages"("id") ON DELETE cascade,
  "video_id" varchar NOT NULL REFERENCES "videos"("id") ON DELETE cascade,
  "title" varchar(255) NOT NULL,
  "description" text,
  "start_time" real NOT NULL,
  "end_time" real NOT NULL,
  "confidence" integer NOT NULL,
  "platform" varchar(20),
  "reasoning" text,
  "created" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now()
);

-- Create unique constraint on openrouter_settings user_id
CREATE UNIQUE INDEX IF NOT EXISTS "openrouter_settings_user_id_unique" ON "openrouter_settings" ("user_id");