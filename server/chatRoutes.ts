import express from 'express';
import { db } from './db';
import { openRouterSettings, chatSessions, chatMessages, aiDiscoveredClips, clips, aiModelCalls, cloudinarySettings } from '@shared/schema';
import { eq, and, desc, count, sum } from 'drizzle-orm';
import { openRouterService } from './services/openRouterService';
import { cloudinaryService } from './services/cloudinaryService';
import { DatabaseInitService } from './services/databaseInitService';
import { isAuthenticated } from './auth';

const router = express.Router();

// System health check endpoint
router.get('/system/health', async (req, res) => {
  try {
    const healthCheck = await DatabaseInitService.performStartupHealthCheck();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      ...healthCheck
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

// Setup guide endpoint for new installations
router.get('/system/setup', async (req, res) => {
  try {
    const dbStatus = await DatabaseInitService.initialize();
    const healthCheck = await DatabaseInitService.performStartupHealthCheck();
    
    const setupSteps = [];
    
    // Database setup
    if (!dbStatus.tablesExist) {
      setupSteps.push({
        step: 1,
        title: 'Deploy Database Schema',
        description: 'Create required database tables',
        command: 'npm run db:push',
        status: 'required',
        details: `Missing tables: ${dbStatus.missingTables.join(', ')}`
      });
    } else {
      setupSteps.push({
        step: 1,
        title: 'Database Schema',
        description: 'All required tables exist',
        status: 'complete'
      });
    }
    
    // Environment setup
    if (!healthCheck.environment) {
      setupSteps.push({
        step: 2,
        title: 'Environment Variables',
        description: 'Configure required environment variables',
        status: 'required',
        details: 'Check .env.example for required variables'
      });
    } else {
      setupSteps.push({
        step: 2,
        title: 'Environment Variables',
        description: 'All required environment variables configured',
        status: 'complete'
      });
    }
    
    // Service setup
    const serviceSteps = [];
    if (!healthCheck.services.cloudinary) {
      serviceSteps.push('Cloudinary: Add CLOUDINARY_* environment variables');
    }
    if (!healthCheck.services.openai) {
      serviceSteps.push('OpenAI: Configure OPENAI_API_KEY or user settings');
    }
    
    if (serviceSteps.length > 0) {
      setupSteps.push({
        step: 3,
        title: 'External Services',
        description: 'Configure external service credentials',
        status: 'optional',
        details: serviceSteps
      });
    }
    
    res.json({
      status: dbStatus.tablesExist && healthCheck.environment ? 'ready' : 'setup-required',
      setupRequired: !dbStatus.tablesExist || !healthCheck.environment,
      steps: setupSteps,
      health: healthCheck
    });
    
  } catch (error) {
    console.error('Setup check error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to check setup status'
    });
  }
});

// Get or create OpenRouter settings for user
router.get('/user/openrouter-settings', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const settings = await openRouterService.getUserSettings(userId);
    
    if (!settings) {
      return res.json({ configured: false });
    }

    res.json({ 
      configured: true,
      apiKey: '***' + settings.apiKey.slice(-4) // Only show last 4 characters
    });
  } catch (error) {
    console.error('Error getting OpenRouter settings:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Save OpenRouter settings for user
router.post('/user/openrouter-settings', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({ error: 'API key is required' });
    }

    if (!apiKey.startsWith('sk-or-')) {
      return res.status(400).json({ error: 'Invalid OpenRouter API key format' });
    }

    // Test the API key
    const isValid = await openRouterService.testApiKey(apiKey);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid or non-working API key' });
    }

    // Save the settings
    await openRouterService.saveUserSettings(userId, apiKey);

    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    console.error('Error saving OpenRouter settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Get Cloudinary settings for user
router.get('/user/cloudinary-settings', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    console.log('Loading Cloudinary settings for user:', userId);
    
    const settings = await cloudinaryService.getUserSettings(userId);
    console.log('Cloudinary settings found:', !!settings);
    
    if (!settings) {
      console.log('No Cloudinary settings found for user');
      return res.json({ configured: false });
    }

    console.log('Returning configured Cloudinary settings');
    res.json({ 
      configured: true,
      cloudName: '***' + settings.cloudName.slice(-4), // Only show last 4 characters
      apiKey: '***' + settings.apiKey.slice(-4),
      // Never expose API secret
    });
  } catch (error) {
    console.error('Error getting Cloudinary settings:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Save Cloudinary settings for user
router.post('/user/cloudinary-settings', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { cloudName, apiKey, apiSecret } = req.body;

    console.log('Cloudinary save request for user:', userId, 'cloud:', cloudName);

    // Validate required fields
    if (!cloudName || !apiKey || !apiSecret) {
      console.log('Missing required fields:', { hasCloudName: !!cloudName, hasApiKey: !!apiKey, hasApiSecret: !!apiSecret });
      return res.status(400).json({ error: 'All Cloudinary credentials are required' });
    }

    // Test the credentials
    console.log('Testing Cloudinary credentials...');
    const isValid = await cloudinaryService.testCredentials(cloudName, apiKey, apiSecret);
    console.log('Cloudinary test result:', isValid);
    
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid Cloudinary credentials' });
    }

    // Save the settings
    console.log('Saving Cloudinary settings to database...');
    await cloudinaryService.saveUserSettings(userId, cloudName, apiKey, apiSecret);
    console.log('Cloudinary settings saved successfully');

    res.json({ success: true, message: 'Cloudinary settings saved successfully' });
  } catch (error) {
    console.error('Error saving Cloudinary settings:', error);
    res.status(500).json({ error: 'Failed to save Cloudinary settings' });
  }
});

// Get chat sessions for user
router.get('/chat/sessions', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const sessions = await db
      .select({
        id: chatSessions.id,
        videoId: chatSessions.videoId,
        title: chatSessions.title,
        createdAt: chatSessions.createdAt,
        updatedAt: chatSessions.updatedAt,
      })
      .from(chatSessions)
      .where(eq(chatSessions.userId, userId))
      .orderBy(desc(chatSessions.updatedAt));

    res.json(sessions);
  } catch (error) {
    console.error('Error getting chat sessions:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// Get chat messages for a session
router.get('/chat/session/:sessionId/messages', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { sessionId } = req.params;

    // Verify user owns this session
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(and(
        eq(chatSessions.id, sessionId),
        eq(chatSessions.userId, userId)
      ))
      .limit(1);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.createdAt);

    // Get clip suggestions for clip_suggestion messages
    const messagesWithClips = await Promise.all(
      messages.map(async (message) => {
        if (message.messageType === 'clip_suggestion') {
          const clips = await db
            .select()
            .from(aiDiscoveredClips)
            .where(eq(aiDiscoveredClips.messageId, message.id));

          return {
            ...message,
            metadata: {
              ...(message.metadata as any || {}),
              clips: clips.map(clip => ({
                id: clip.id,
                title: clip.title,
                description: clip.description,
                startTime: clip.startTime,
                endTime: clip.endTime,
                confidence: clip.confidence,
                platform: clip.platform,
                reasoning: clip.reasoning,
                created: clip.created,
              }))
            }
          };
        }
        return message;
      })
    );

    res.json(messagesWithClips);
  } catch (error) {
    console.error('Error getting chat messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Delete a chat session
router.delete('/chat/session/:sessionId', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { sessionId } = req.params;

    // Verify user owns this session
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(and(
        eq(chatSessions.id, sessionId),
        eq(chatSessions.userId, userId)
      ))
      .limit(1);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Delete session (cascade will handle messages and related data)
    await db
      .delete(chatSessions)
      .where(eq(chatSessions.id, sessionId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting chat session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// Create clips from AI suggestions
router.post('/chat/create-clips', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { clipIds } = req.body;

    if (!Array.isArray(clipIds)) {
      return res.status(400).json({ error: 'clipIds must be an array' });
    }

    const results = [];

    for (const clipId of clipIds) {
      try {
        // Get the discovered clip
        const [discoveredClip] = await db
          .select()
          .from(aiDiscoveredClips)
          .where(eq(aiDiscoveredClips.id, clipId))
          .limit(1);

        if (!discoveredClip) {
          results.push({ clipId, success: false, error: 'Clip not found' });
          continue;
        }

        // Verify user has access to this video (through session ownership)
        const [session] = await db
          .select()
          .from(chatSessions)
          .innerJoin(chatMessages, eq(chatMessages.sessionId, chatSessions.id))
          .where(and(
            eq(chatMessages.id, discoveredClip.messageId),
            eq(chatSessions.userId, userId)
          ))
          .limit(1);

        if (!session) {
          results.push({ clipId, success: false, error: 'Access denied' });
          continue;
        }

        // Create actual clip record
        const [createdClip] = await db
          .insert(clips)
          .values({
            videoId: discoveredClip.videoId,
            userId: userId,
            name: discoveredClip.title,
            startTime: discoveredClip.startTime,
            endTime: discoveredClip.endTime,
            duration: discoveredClip.endTime - discoveredClip.startTime,
            status: 'pending',
          })
          .returning();

        // Mark discovered clip as created
        await db
          .update(aiDiscoveredClips)
          .set({ created: true })
          .where(eq(aiDiscoveredClips.id, clipId));

        results.push({
          clipId,
          success: true,
          createdClipId: createdClip.id,
          title: discoveredClip.title,
        });

      } catch (error) {
        console.error(`Error creating clip ${clipId}:`, error);
        results.push({
          clipId,
          success: false,
          error: 'Failed to create clip'
        });
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('Error creating clips:', error);
    res.status(500).json({ error: 'Failed to create clips' });
  }
});

// Get AI usage statistics for user
router.get('/chat/usage-stats', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    // Get usage statistics
    const stats = await db
      .select({
        totalCalls: count(),
        totalTokens: sum(aiModelCalls.tokensUsed),
        totalCostCents: sum(aiModelCalls.costCents),
      })
      .from(aiModelCalls)
      .where(eq(aiModelCalls.userId, userId));

    const sessionsCount = await db
      .select({ count: count() })
      .from(chatSessions)
      .where(eq(chatSessions.userId, userId));

    const clipsCreated = await db
      .select({ count: count() })
      .from(aiDiscoveredClips)
      .where(eq(aiDiscoveredClips.created, true));

    res.json({
      totalAiCalls: stats[0]?.totalCalls || 0,
      totalTokensUsed: stats[0]?.totalTokens || 0,
      totalCostCents: stats[0]?.totalCostCents || 0,
      totalSessions: sessionsCount[0]?.count || 0,
      totalClipsCreated: clipsCreated[0]?.count || 0,
    });
  } catch (error) {
    console.error('Error getting usage stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export { router as chatRoutes };