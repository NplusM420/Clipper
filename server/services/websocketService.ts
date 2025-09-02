import { Server as SocketServer, Socket } from 'socket.io';
import { db } from '../db';
import { chatSessions, chatMessages, aiModelCalls, aiDiscoveredClips, clips } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { openRouterService } from './openRouterService';
import { getTranscriptByVideoId } from './transcriptionService';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

interface ChatMessageData {
  sessionId: string;
  content: string;
  videoId: string;
}

interface JoinSessionData {
  videoId: string;
}

export interface ProcessedClipSuggestion {
  id: string;
  title: string;
  description?: string;
  startTime: number;
  endTime: number;
  confidence: number;
  platform?: string;
  reasoning?: string;
}

export class WebSocketService {
  private io: SocketServer;

  constructor(io: SocketServer) {
    this.io = io;
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log('Client connected:', socket.id);

      // Authentication middleware
      socket.on('authenticate', (data: { userId: string; username: string }) => {
        socket.userId = data.userId;
        socket.username = data.username;
        socket.join(`user_${data.userId}`);
        socket.emit('authenticated', { success: true });
      });

      // Join a chat session
      socket.on('join_session', async (data: JoinSessionData) => {
        if (!socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        try {
          // Find or create chat session
          const session = await this.findOrCreateSession(socket.userId, data.videoId);
          socket.join(`session_${session.id}`);
          
          // Load chat history
          const messages = await this.loadChatHistory(session.id);
          
          socket.emit('session_joined', {
            sessionId: session.id,
            messages,
          });
        } catch (error) {
          console.error('Error joining session:', error);
          socket.emit('error', { message: 'Failed to join session' });
        }
      });

      // Handle chat messages
      socket.on('chat_message', async (data: ChatMessageData) => {
        if (!socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        try {
          await this.handleChatMessage(socket, data);
        } catch (error) {
          console.error('Error handling chat message:', error);
          socket.emit('error', { message: 'Failed to process message' });
        }
      });

      // Create clips from AI suggestions
      socket.on('create_clips', async (data: { clipIds: string[] }) => {
        if (!socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        try {
          await this.handleClipCreation(socket, data.clipIds);
        } catch (error) {
          console.error('Error creating clips:', error);
          socket.emit('error', { message: 'Failed to create clips' });
        }
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  }

  private async findOrCreateSession(userId: string, videoId: string) {
    // Try to find existing session
    const existingSessions = await db
      .select()
      .from(chatSessions)
      .where(and(
        eq(chatSessions.userId, userId),
        eq(chatSessions.videoId, videoId)
      ))
      .orderBy(desc(chatSessions.updatedAt))
      .limit(1);

    if (existingSessions.length > 0) {
      return existingSessions[0];
    }

    // Create new session
    const [newSession] = await db
      .insert(chatSessions)
      .values({
        userId,
        videoId,
        title: `Chat Session - ${new Date().toLocaleDateString()}`,
      })
      .returning();

    return newSession;
  }

  private async loadChatHistory(sessionId: string) {
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.createdAt);

    return messages.map(msg => ({
      id: msg.id,
      sender: msg.sender as 'user' | 'ai',
      content: msg.content,
      messageType: msg.messageType,
      metadata: msg.metadata,
      timestamp: msg.createdAt,
    }));
  }

  private async handleChatMessage(socket: AuthenticatedSocket, data: ChatMessageData) {
    const { sessionId, content, videoId } = data;

    // Save user message
    const [userMessage] = await db
      .insert(chatMessages)
      .values({
        sessionId,
        sender: 'user',
        content,
        messageType: 'text',
      })
      .returning();

    // Broadcast user message to session
    this.io.to(`session_${sessionId}`).emit('message_received', {
      id: userMessage.id,
      sender: 'user',
      content,
      messageType: 'text',
      timestamp: userMessage.createdAt,
    });

    // Show typing indicator
    socket.to(`session_${sessionId}`).emit('ai_typing', { isTyping: true });

    try {
      // Get video transcript for context
      const transcript = await getTranscriptByVideoId(videoId);
      if (!transcript) {
        throw new Error('Video transcript not found');
      }

      const transcriptText = transcript.segments
        .map((seg: any) => seg.text)
        .join(' ');

      // Get conversation history
      const recentMessages = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(10);

      const conversationHistory = recentMessages
        .reverse()
        .slice(0, -1) // Exclude the current message
        .map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.content,
        }));

      // Process with AI
      const aiResponse = await openRouterService.processConversationalRequest(
        content,
        transcriptText,
        conversationHistory,
        socket.userId!
      );

      // Save AI response message
      const messageType = aiResponse.intent === 'CLIP_REQUEST' ? 'clip_suggestion' : 
                         aiResponse.intent === 'DEEP_ANALYSIS' ? 'analysis' : 'text';

      const [aiMessage] = await db
        .insert(chatMessages)
        .values({
          sessionId,
          sender: 'ai',
          content: aiResponse.response,
          messageType,
        })
        .returning();

      // Process clip suggestions if this is a clip request
      let clipSuggestions: ProcessedClipSuggestion[] = [];
      if (aiResponse.intent === 'CLIP_REQUEST') {
        clipSuggestions = await this.extractAndSaveClipSuggestions(
          aiMessage.id,
          videoId,
          aiResponse.response
        );
      }

      // Save model call tracking
      for (const call of aiResponse.modelCalls) {
        await db.insert(aiModelCalls).values({
          messageId: aiMessage.id,
          userId: socket.userId!,
          modelUsed: call.model,
          tokensUsed: call.result.tokensUsed,
          costCents: call.result.costCents,
          processingTimeMs: call.result.processingTimeMs,
          success: call.result.success,
          errorMessage: call.result.error,
        });
      }

      // Stop typing indicator
      socket.to(`session_${sessionId}`).emit('ai_typing', { isTyping: false });

      // Broadcast AI response
      this.io.to(`session_${sessionId}`).emit('message_received', {
        id: aiMessage.id,
        sender: 'ai',
        content: aiResponse.response,
        messageType,
        metadata: clipSuggestions.length > 0 ? { clips: clipSuggestions } : undefined,
        timestamp: aiMessage.createdAt,
      });

      // Update session timestamp
      await db
        .update(chatSessions)
        .set({ updatedAt: new Date() })
        .where(eq(chatSessions.id, sessionId));

    } catch (error) {
      console.error('AI processing error:', error);
      
      socket.to(`session_${sessionId}`).emit('ai_typing', { isTyping: false });

      // Get more specific error message
      let errorContent = "I'm having trouble processing that request. Please try again.";
      
      if (error instanceof Error) {
        if (error.message.includes('OpenRouter API key not configured')) {
          errorContent = "Please configure your OpenRouter API key in Settings to use AI features.";
        } else if (error.message.includes('OpenRouter API error')) {
          errorContent = `API Error: ${error.message}. Please check your OpenRouter API key and try again.`;
        } else if (error.message.includes('No API key provided')) {
          errorContent = "OpenRouter API key is missing. Please add your API key in Settings.";
        } else {
          errorContent = `Error: ${error.message}`;
        }
      }

      // Send error response
      const [errorMessage] = await db
        .insert(chatMessages)
        .values({
          sessionId,
          sender: 'ai',
          content: errorContent,
          messageType: 'text',
        })
        .returning();

      this.io.to(`session_${sessionId}`).emit('message_received', {
        id: errorMessage.id,
        sender: 'ai',
        content: errorMessage.content,
        messageType: 'text',
        timestamp: errorMessage.createdAt,
      });
    }
  }

  private async extractAndSaveClipSuggestions(
    messageId: string,
    videoId: string,
    aiResponse: string
  ): Promise<ProcessedClipSuggestion[]> {
    // Extract clip suggestions from AI response using pattern matching
    const clipSuggestions: ProcessedClipSuggestion[] = [];
    
    // Look for timestamp patterns and titles in the AI response
    const timestampRegex = /(\d{1,2}):(\d{2})(?::(\d{2}))?[-–](\d{1,2}):(\d{2})(?::(\d{2}))?/g;
    const matches = Array.from(aiResponse.matchAll(timestampRegex));

    for (const match of matches) {
      const startMin = parseInt(match[1]);
      const startSec = parseInt(match[2]);
      const endMin = parseInt(match[4]);
      const endSec = parseInt(match[5]);

      const startTime = startMin * 60 + startSec;
      const endTime = endMin * 60 + endSec;

      // Extract title and details from surrounding text
      const matchIndex = match.index || 0;
      const beforeMatch = aiResponse.substring(Math.max(0, matchIndex - 200), matchIndex);
      const afterMatch = aiResponse.substring(matchIndex, matchIndex + 200);

      // Look for titles in quotes or bold text
      const titleMatch = beforeMatch.match(/["']([^"']+)["']|[*"](.*?)[*"]/) || 
                        afterMatch.match(/["']([^"']+)["']|[*"](.*?)[*"]/);
      
      const title = titleMatch?.[1] || titleMatch?.[2] || `Clip ${startMin}:${startSec.toString().padStart(2, '0')}-${endMin}:${endSec.toString().padStart(2, '0')}`;

      // Extract confidence if mentioned
      const confidenceMatch = aiResponse.match(/(\d{1,3})%/);
      const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 85;

      // Save to database
      const [savedClip] = await db
        .insert(aiDiscoveredClips)
        .values({
          messageId,
          videoId,
          title: title.substring(0, 255),
          startTime,
          endTime,
          confidence,
          platform: this.extractPlatform(aiResponse),
          reasoning: this.extractReasoning(aiResponse, matchIndex),
        })
        .returning();

      clipSuggestions.push({
        id: savedClip.id,
        title: savedClip.title,
        description: savedClip.description || undefined,
        startTime: savedClip.startTime,
        endTime: savedClip.endTime,
        confidence: savedClip.confidence,
        platform: savedClip.platform || undefined,
        reasoning: savedClip.reasoning || undefined,
      });
    }

    return clipSuggestions;
  }

  private extractPlatform(text: string): string {
    if (text.toLowerCase().includes('tiktok')) return 'tiktok';
    if (text.toLowerCase().includes('youtube')) return 'youtube';
    if (text.toLowerCase().includes('instagram')) return 'instagram';
    if (text.toLowerCase().includes('linkedin')) return 'linkedin';
    if (text.toLowerCase().includes('twitter')) return 'twitter';
    return 'general';
  }

  private extractReasoning(text: string, nearIndex: number): string {
    // Extract reasoning from text near the timestamp
    const start = Math.max(0, nearIndex - 100);
    const end = Math.min(text.length, nearIndex + 300);
    const snippet = text.substring(start, end);
    
    // Look for explanatory text
    const reasoningMatch = snippet.match(/(?:because|since|due to|reason)[^.!?]*[.!?]/i);
    return reasoningMatch?.[0] || 'AI identified this as an engaging moment';
  }

  private async handleClipCreation(socket: AuthenticatedSocket, clipIds: string[]) {
    for (const clipId of clipIds) {
      try {
        // Get clip details
        const [clip] = await db
          .select()
          .from(aiDiscoveredClips)
          .where(eq(aiDiscoveredClips.id, clipId))
          .limit(1);

        if (!clip) continue;

        // Create actual clip record
        const [createdClip] = await db
          .insert(clips)
          .values({
            videoId: clip.videoId,
            userId: socket.userId!,
            name: clip.title,
            startTime: clip.startTime,
            endTime: clip.endTime,
            duration: clip.endTime - clip.startTime,
            status: 'pending',
          })
          .returning();

        // Mark discovered clip as created
        await db
          .update(aiDiscoveredClips)
          .set({ created: true })
          .where(eq(aiDiscoveredClips.id, clipId));

        socket.emit('clip_created', {
          clipId,
          createdClipId: createdClip.id,
          title: clip.title,
          success: true,
        });
      } catch (error) {
        socket.emit('clip_creation_error', {
          clipId,
          error: 'Failed to create clip',
        });
      }
    }
  }

  // Utility method to send updates to specific users
  public sendToUser(userId: string, event: string, data: any) {
    this.io.to(`user_${userId}`).emit(event, data);
  }

  // Utility method to send updates to specific sessions
  public sendToSession(sessionId: string, event: string, data: any) {
    this.io.to(`session_${sessionId}`).emit(event, data);
  }
}

export let webSocketService: WebSocketService;

export function initializeWebSocket(io: SocketServer) {
  webSocketService = new WebSocketService(io);
  return webSocketService;
}