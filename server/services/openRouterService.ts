import { db } from "../db";
import { openRouterSettings, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

// AI Model configurations
export const AI_MODELS = {
  SMALL: {
    id: process.env.OPENROUTER_SMALL_MODEL || 'google/gemma-3-27b-it',
    name: 'Gemma 3 27B',
    contextWindow: 96000,
    role: 'Conversational Coordinator',
    costPer1MTokens: 0.27,
  },
  MEDIUM: {
    id: process.env.OPENROUTER_MEDIUM_MODEL || 'z-ai/glm-4.5',
    name: 'GLM 4.5',
    contextWindow: 256000,
    role: 'Clip Analysis Specialist',
    costPer1MTokens: 0.14,
  },
  LARGE: {
    id: process.env.OPENROUTER_LARGE_MODEL || 'meta-llama/llama-4-maverick',
    name: 'Llama 4 Maverick',
    contextWindow: 1000000,
    role: 'Deep Content Processor',
    costPer1MTokens: 2.7,
  },
} as const;

type ModelType = keyof typeof AI_MODELS;

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

export interface ModelCallResult {
  content: string;
  tokensUsed: number;
  costCents: number;
  processingTimeMs: number;
  model: string;
  success: boolean;
  error?: string;
}

export class OpenRouterService {
  private readonly baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  private readonly encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';

  // Encrypt API key for storage
  private encryptApiKey(apiKey: string): string {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(this.encryptionKey, 'hex');
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  // Decrypt API key for use
  private decryptApiKey(encryptedKey: string): string {
    try {
      const parts = encryptedKey.split(':');
      
      // Handle legacy format (old encryption method)
      if (parts.length === 1) {
        try {
          const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
          let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          return decrypted;
        } catch (legacyError) {
          console.warn('Failed to decrypt legacy OpenRouter key, treating as plain text');
          return encryptedKey;
        }
      }
      
      // New format with IV
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted data format');
      }
      
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      const key = Buffer.from(this.encryptionKey, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('OpenRouter decryption error:', error);
      return '';
    }
  }

  // Save user's OpenRouter settings
  async saveUserSettings(userId: string, apiKey: string): Promise<void> {
    const encryptedKey = this.encryptApiKey(apiKey);
    
    await db
      .insert(openRouterSettings)
      .values({
        userId,
        apiKey: encryptedKey,
      })
      .onConflictDoUpdate({
        target: openRouterSettings.userId,
        set: {
          apiKey: encryptedKey,
          updatedAt: new Date(),
        },
      });
  }

  // Get user's OpenRouter settings
  async getUserSettings(userId: string): Promise<{ apiKey: string } | null> {
    console.log(`🔍 [OpenRouter] Getting settings from database for user: ${userId}`);
    const settings = await db
      .select()
      .from(openRouterSettings)
      .where(eq(openRouterSettings.userId, userId))
      .limit(1);

    console.log(`🔍 [OpenRouter] Database query result:`, {
      found: settings.length > 0,
      encryptedKeyLength: settings[0]?.apiKey?.length,
      encryptedKeyStart: settings[0]?.apiKey?.substring(0, 20) + '...'
    });

    if (settings.length === 0) {
      return null;
    }

    try {
      const decryptedKey = this.decryptApiKey(settings[0].apiKey);
      console.log(`🔍 [OpenRouter] Decryption result:`, {
        success: !!decryptedKey,
        decryptedLength: decryptedKey?.length,
        startsWithSk: decryptedKey?.startsWith('sk-or-')
      });
      
      if (!decryptedKey || decryptedKey.length < 10) {
        console.error(`❌ [OpenRouter] Invalid decrypted key`);
        return null;
      }
      
      return { apiKey: decryptedKey };
    } catch (error) {
      console.error(`❌ [OpenRouter] Decryption error:`, error);
      return null;
    }
  }

  // Test OpenRouter API key
  async testApiKey(apiKey: string): Promise<boolean> {
    try {
      const response = await this.callModel(
        'SMALL',
        'Test message. Please respond with "API key is working".',
        [],
        apiKey
      );
      return response.success;
    } catch (error) {
      return false;
    }
  }

  // Make API call to OpenRouter
  async callModel(
    modelType: ModelType,
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    apiKey?: string,
    userId?: string
  ): Promise<ModelCallResult> {
    const startTime = Date.now();
    
    try {
      // Get API key if not provided
      if (!apiKey && userId) {
        console.log(`🔑 [OpenRouter] Getting API key for user ${userId}`);
        const settings = await this.getUserSettings(userId);
        if (!settings) {
          console.error(`❌ [OpenRouter] No API key configured for user ${userId}`);
          throw new Error('OpenRouter API key not configured. Please add your API key in Settings.');
        }
        apiKey = settings.apiKey;
        console.log(`✅ [OpenRouter] API key found for user ${userId}`);
      }

      if (!apiKey) {
        throw new Error('No API key provided');
      }

      const model = AI_MODELS[modelType];
      console.log(`🚀 [OpenRouter] Making API call to model ${model.name} (${model.id})`);
      
      const messages = [
        ...conversationHistory,
        { role: 'user', content: userMessage }
      ];

      console.log(`📊 [OpenRouter] Request details:`, {
        model: model.id,
        messagesCount: messages.length,
        userMessageLength: userMessage.length
      });

      const requestBody = {
        model: model.id,
        messages,
        max_tokens: 4096,
        temperature: 0.7,
      };

      console.log(`🌐 [OpenRouter] === MAKING API CALL ===`);
      console.log(`🌐 [OpenRouter] URL: ${this.baseUrl}`);
      console.log(`🌐 [OpenRouter] Headers:`, {
        'Authorization': `Bearer ${apiKey.substring(0, 10)}...${apiKey.slice(-4)}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.BASE_URL || 'http://localhost:5000',
        'X-Title': 'Video Clipper AI Assistant'
      });
      console.log(`🌐 [OpenRouter] Request body:`, JSON.stringify(requestBody, null, 2));

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.BASE_URL || 'http://localhost:5000',
          'X-Title': 'Video Clipper AI Assistant',
        },
        body: JSON.stringify(requestBody),
      });

      console.log(`🌐 [OpenRouter] Response status: ${response.status} ${response.statusText}`);
      console.log(`🌐 [OpenRouter] Response headers:`, Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [OpenRouter] API error details:`, {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          url: this.baseUrl,
          model: model.id,
          apiKeyPrefix: apiKey?.substring(0, 10)
        });
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
      }

      const data: OpenRouterResponse = await response.json();
      console.log(`✅ [OpenRouter] API response received successfully:`, {
        choices: data.choices?.length,
        totalTokens: data.usage?.total_tokens,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        model: data.model,
        finishReason: data.choices?.[0]?.finish_reason
      });
      console.log(`✅ [OpenRouter] Response content preview:`, data.choices?.[0]?.message?.content?.substring(0, 200) + '...');
      const processingTime = Date.now() - startTime;

      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response from model');
      }

      const tokensUsed = data.usage.total_tokens;
      const costCents = Math.ceil((tokensUsed / 1000000) * model.costPer1MTokens * 100);

      return {
        content: data.choices[0].message.content,
        tokensUsed,
        costCents,
        processingTimeMs: processingTime,
        model: model.name,
        success: true,
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        content: '',
        tokensUsed: 0,
        costCents: 0,
        processingTimeMs: processingTime,
        model: AI_MODELS[modelType].name,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Intelligent model orchestration for different intents
  async processConversationalRequest(
    userMessage: string,
    transcriptContent: string,
    conversationHistory: Array<{ role: string; content: string }>,
    userId: string
  ): Promise<{
    response: string;
    modelCalls: Array<{ model: ModelType; result: ModelCallResult }>;
    intent: string;
  }> {
    console.log(`🚀 [OpenRouter] === STARTING CONVERSATIONAL REQUEST ===`);
    console.log(`📝 [OpenRouter] User Message: "${userMessage}"`);
    console.log(`👤 [OpenRouter] User ID: ${userId}`);
    console.log(`📄 [OpenRouter] Transcript Length: ${transcriptContent.length} characters`);
    console.log(`💬 [OpenRouter] Conversation History Length: ${conversationHistory.length} messages`);
    
    const modelCalls: Array<{ model: ModelType; result: ModelCallResult }> = [];
    
    // First, verify user has API key configured
    console.log(`🔑 [OpenRouter] Checking API key configuration for user ${userId}...`);
    const userSettings = await this.getUserSettings(userId);
    if (!userSettings || !userSettings.apiKey) {
      console.error(`❌ [OpenRouter] No API key found for user ${userId}`);
      return {
        response: "Please configure your OpenRouter API key in Settings to use AI features. I can't process your request without valid API credentials.",
        modelCalls: [],
        intent: 'NO_API_KEY',
      };
    }
    console.log(`✅ [OpenRouter] API key confirmed for user ${userId} (length: ${userSettings.apiKey.length})`);
    
    // Step 1: Analyze intent with Small model (Coordinator)
    const intentPrompt = `You are the Intent Analysis Coordinator for a professional video clipping platform. Your role is to analyze user requests and route them to the appropriate specialist AI models.

USER REQUEST: "${userMessage}"

CONTEXT: Video transcript available (${Math.floor(transcriptContent.length / 1000)}k characters)

CLASSIFICATION RULES:
- CLIP_REQUEST: User wants to create clips, highlights, viral moments, social media content, or extract specific segments
- DEEP_ANALYSIS: User requests comprehensive analysis, detailed insights, full content breakdown, or complex understanding
- CONTENT_QUESTION: User asks about specific content, topics, speakers, or factual information from the video
- KEYWORD_SEARCH: User looks for specific words, phrases, moments, or time-based queries
- GENERAL_CHAT: Greetings, help requests, platform questions, or conversational queries

RESPONSE FORMAT:
Intent: [EXACT_INTENT_TYPE]
Reasoning: [Brief explanation of why this intent was chosen]

Analyze the user's request and respond with the appropriate classification.`;

    console.log(`🧠 [OpenRouter] === STEP 1: INTENT ANALYSIS ===`);
    console.log(`🧠 [OpenRouter] Starting intent analysis for user ${userId}`);
    console.log(`🧠 [OpenRouter] Intent prompt length: ${intentPrompt.length} characters`);
    
    const intentResult = await this.callModel('SMALL', intentPrompt, [], undefined, userId);
    modelCalls.push({ model: 'SMALL', result: intentResult });

    console.log(`🧠 [OpenRouter] Intent analysis completed:`, {
      success: intentResult.success,
      model: intentResult.model,
      tokensUsed: intentResult.tokensUsed,
      costCents: intentResult.costCents,
      processingTimeMs: intentResult.processingTimeMs,
      contentLength: intentResult.content?.length,
      error: intentResult.error
    });

    if (!intentResult.success) {
      console.error(`❌ [OpenRouter] Intent analysis FAILED with error:`, intentResult.error);
      return {
        response: `I'm having trouble connecting to the AI service. Error: ${intentResult.error}. Please check your OpenRouter API key in settings and try again.`,
        modelCalls,
        intent: 'ERROR',
      };
    }

    console.log(`🧠 [OpenRouter] Intent analysis response content:`, intentResult.content?.substring(0, 200) + '...');
    const intent = this.extractIntent(intentResult.content);
    console.log(`🧠 [OpenRouter] Extracted intent: ${intent}`);

    // Step 2: Route to appropriate specialist model if needed
    let finalResponse = '';

    console.log(`🎯 [OpenRouter] === STEP 2: ROUTING TO SPECIALIST ===`);
    
    switch (intent) {
      case 'CLIP_REQUEST':
        console.log(`🎬 [OpenRouter] CLIP_REQUEST detected - routing to Medium model for clip analysis`);
        
        // Call Medium model for clip analysis
        const clipPrompt = `You are the Clip Analysis Specialist for a professional video content platform. Your expertise is identifying viral moments and creating optimized social media clips.

USER REQUEST: "${userMessage}"

VIDEO TRANSCRIPT:
${transcriptContent.substring(0, 12000)}${transcriptContent.length > 12000 ? '...\n[TRANSCRIPT CONTINUES]' : ''}

ANALYSIS REQUIREMENTS:
1. Identify 3-5 high-potential clip segments
2. Each clip must have exact timestamps in MM:SS format
3. Optimal clip length: 15-90 seconds for maximum engagement
4. Focus on: emotional peaks, key insights, actionable content, memorable quotes

OUTPUT FORMAT (CRITICAL - Follow exactly):
CLIP 1: "Compelling Title Here"
Time: MM:SS-MM:SS
Platform: [tiktok/youtube/linkedin/instagram/twitter]
Confidence: XX%
Reasoning: Why this moment will perform well on social media

CLIP 2: [Continue same format]

SELECTION CRITERIA:
- Hook within first 3 seconds
- Clear value proposition
- Emotional resonance or surprise factor  
- Standalone context (doesn't require full video)
- Platform-specific optimization

Analyze the transcript and provide viral clip recommendations with precise timestamps.`;

        console.log(`🎬 [OpenRouter] Starting clip analysis for user ${userId}`);
        console.log(`🎬 [OpenRouter] Clip prompt length: ${clipPrompt.length} characters`);
        console.log(`🎬 [OpenRouter] Transcript excerpt: "${transcriptContent.substring(0, 100)}..."`);
        
        const clipResult = await this.callModel('MEDIUM', clipPrompt, [], undefined, userId);
        modelCalls.push({ model: 'MEDIUM', result: clipResult });
        
        console.log(`🎬 [OpenRouter] Clip analysis COMPLETED:`, {
          success: clipResult.success,
          model: clipResult.model,
          tokensUsed: clipResult.tokensUsed,
          costCents: clipResult.costCents,
          contentLength: clipResult.content?.length,
          processingTimeMs: clipResult.processingTimeMs,
          error: clipResult.error
        });

        if (!clipResult.success) {
          console.error(`❌ [OpenRouter] Clip analysis FAILED:`, clipResult.error);
          finalResponse = `I couldn't analyze your video for clips right now. Error: ${clipResult.error}. Please check your OpenRouter API key and try again.`;
          break;
        }

        console.log(`🎬 [OpenRouter] Clip analysis response preview:`, clipResult.content?.substring(0, 300) + '...');

        // Small model formats the response conversationally
        const formatPrompt = `You are the User Interface Coordinator. Transform this technical clip analysis into a friendly, professional response for our video clipping platform users.

ORIGINAL USER REQUEST: "${userMessage}"

TECHNICAL ANALYSIS FROM SPECIALIST:
${clipResult.content}

FORMATTING INSTRUCTIONS:
1. Start with a brief acknowledgment of their request
2. Present each clip recommendation clearly with:
   - Engaging title in quotes
   - Exact timestamp (MM:SS-MM:SS format)
   - Platform recommendation
   - Confidence percentage
   - Brief explanation of why it will perform well
3. Use conversational tone but maintain professionalism
4. End with next steps (they can create these clips with one click)
5. Preserve all timestamp accuracy and technical details

TONE: Helpful AI assistant who understands social media and content creation
STYLE: Clear, actionable, enthusiastic about their content's potential

Transform the analysis into a user-friendly response.`;

        console.log(`🎨 [OpenRouter] Starting response formatting with Small model`);
        const formatResult = await this.callModel('SMALL', formatPrompt, conversationHistory, undefined, userId);
        modelCalls.push({ model: 'SMALL', result: formatResult });

        console.log(`🎨 [OpenRouter] Response formatting result:`, {
          success: formatResult.success,
          model: formatResult.model,
          tokensUsed: formatResult.tokensUsed,
          contentLength: formatResult.content?.length,
          error: formatResult.error
        });

        finalResponse = formatResult.success ? formatResult.content : clipResult.content;
        console.log(`🎬 [OpenRouter] Final clip response length: ${finalResponse.length} characters`);
        break;

      case 'DEEP_ANALYSIS':
        // Call Large model for comprehensive analysis
        const analysisPrompt = `You are the Deep Content Processor, specializing in comprehensive video content analysis for professional content creators and marketers.

USER REQUEST: "${userMessage}"

COMPLETE VIDEO TRANSCRIPT:
${transcriptContent}

COMPREHENSIVE ANALYSIS FRAMEWORK:

1. CONTENT STRUCTURE ANALYSIS:
   - Opening hook effectiveness and engagement strategy
   - Main content pillars and how they're developed
   - Transitions between topics and pacing
   - Conclusion strength and call-to-action effectiveness

2. THEMATIC BREAKDOWN:
   - Primary themes and key messages
   - Supporting arguments and evidence presented
   - Unique insights or perspectives offered
   - Knowledge gaps or areas that could be expanded

3. AUDIENCE ENGAGEMENT ASSESSMENT:
   - Emotional peaks and valleys throughout content
   - Storytelling elements and narrative techniques
   - Educational vs. entertainment value balance
   - Accessibility of complex concepts

4. SPEAKER/CONTENT CREATOR ANALYSIS:
   - Communication style and personality traits
   - Expertise demonstration and credibility markers
   - Audience connection techniques used
   - Areas for improvement in delivery or content

5. CONTENT OPTIMIZATION OPPORTUNITIES:
   - Strongest segments for repurposing
   - Areas that could be expanded into standalone content
   - Cross-platform adaptation potential
   - SEO and discoverability factors

6. STRATEGIC RECOMMENDATIONS:
   - Content series potential based on this material
   - Audience development strategies
   - Collaboration opportunities suggested by content
   - Long-term content strategy insights

Provide a thorough, professional analysis that serves content creators, marketers, and media professionals.`;

        const analysisResult = await this.callModel('LARGE', analysisPrompt, [], undefined, userId);
        modelCalls.push({ model: 'LARGE', result: analysisResult });

        // Format through Small model
        const analysisFormatPrompt = `You are the User Interface Coordinator. Transform this comprehensive content analysis into an engaging, digestible response for our video platform users.

ORIGINAL USER REQUEST: "${userMessage}"

COMPREHENSIVE ANALYSIS FROM SPECIALIST:
${analysisResult.content}

FORMATTING INSTRUCTIONS:
1. Open with acknowledgment of their request for deep analysis
2. Structure insights into clear, scannable sections with headers
3. Use bullet points and short paragraphs for readability
4. Highlight the most actionable insights and opportunities
5. Translate technical analysis into practical, actionable advice
6. Include specific examples from their content when relevant
7. End with concrete next steps they can take

TONE: Professional content strategist who makes complex insights accessible
STYLE: Organized, actionable, empowering - help them see their content's potential

Transform the technical analysis into user-friendly strategic guidance.`;

        const analysisFormatResult = await this.callModel('SMALL', analysisFormatPrompt, conversationHistory, undefined, userId);
        modelCalls.push({ model: 'SMALL', result: analysisFormatResult });

        finalResponse = analysisFormatResult.success ? analysisFormatResult.content : analysisResult.content;
        break;

      default:
        // Small model handles directly (CONTENT_QUESTION, KEYWORD_SEARCH, GENERAL_CHAT)
        const directPrompt = `You are the Video Content Assistant for a professional video clipping platform. You help users understand, search, and interact with their video content.

USER REQUEST: "${userMessage}"

VIDEO CONTEXT:
${transcriptContent.substring(0, 8000)}${transcriptContent.length > 8000 ? '...\n[TRANSCRIPT CONTINUES - Additional context available if needed]' : ''}

CONVERSATION HISTORY:
${conversationHistory.slice(-3).map(msg => `${msg.role}: ${msg.content}`).join('\n')}

RESPONSE GUIDELINES:
- For CONTENT_QUESTIONS: Provide specific, accurate answers with timestamps when relevant
- For KEYWORD_SEARCH: Find exact moments and provide precise timestamps (MM:SS format)
- For GENERAL_CHAT: Be helpful and professional while staying focused on video content

CAPABILITIES YOU CAN MENTION:
- Ask me specific questions about any topic discussed in your video
- Search for keywords, phrases, or specific moments  
- Request viral clip recommendations from your content
- Get comprehensive content analysis and strategic insights
- Create clips with precise timing from any segment

Be conversational, specific, and always reference the actual video content when possible. Include timestamps in MM:SS format when discussing specific moments.`;

        const directResult = await this.callModel('SMALL', directPrompt, conversationHistory, undefined, userId);
        modelCalls.push({ model: 'SMALL', result: directResult });

        finalResponse = directResult.success ? directResult.content : "I couldn't process that request. Please try again.";
        break;
    }

    console.log(`🏁 [OpenRouter] === PROCESS COMPLETE ===`);
    console.log(`🏁 [OpenRouter] Final response length: ${finalResponse.length} characters`);
    console.log(`🏁 [OpenRouter] Total model calls made: ${modelCalls.length}`);
    console.log(`🏁 [OpenRouter] Final intent: ${intent}`);
    console.log(`🏁 [OpenRouter] Model call summary:`, modelCalls.map(call => ({
      model: call.model,
      success: call.result.success,
      tokens: call.result.tokensUsed,
      cost: call.result.costCents,
      error: call.result.error
    })));
    console.log(`🏁 [OpenRouter] Final response preview: "${finalResponse.substring(0, 200)}..."`);

    return {
      response: finalResponse,
      modelCalls,
      intent,
    };
  }

  private extractIntent(response: string): string {
    // Look for exact intent format: "Intent: [INTENT_TYPE]"
    const intentMatch = response.match(/Intent:\s*([A-Z_]+)/i);
    if (intentMatch) {
      return intentMatch[1].toUpperCase();
    }
    
    // Fallback to the old method if no structured format found
    const upperResponse = response.toUpperCase();
    
    if (upperResponse.includes('CLIP_REQUEST')) {
      return 'CLIP_REQUEST';
    }
    if (upperResponse.includes('DEEP_ANALYSIS')) {
      return 'DEEP_ANALYSIS';
    }
    if (upperResponse.includes('KEYWORD_SEARCH')) {
      return 'KEYWORD_SEARCH';
    }
    if (upperResponse.includes('CONTENT_QUESTION')) {
      return 'CONTENT_QUESTION';
    }
    
    return 'GENERAL_CHAT';
  }
}

export const openRouterService = new OpenRouterService();