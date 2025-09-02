#!/usr/bin/env node

/**
 * OpenRouter API Test Script
 * This script tests direct connectivity to OpenRouter API using stored credentials
 */

import { config } from 'dotenv';
import { db } from './server/db.ts';
import { openRouterSettings } from './shared/schema.ts';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

// Load environment variables
config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';

// Decrypt function (matches openRouterService)
function decryptApiKey(encryptedKey) {
  try {
    const parts = encryptedKey.split(':');
    
    // Handle legacy format (old encryption method)
    if (parts.length === 1) {
      try {
        const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
        let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch (legacyError) {
        console.warn('Failed to decrypt legacy key, treating as plain text');
        return encryptedKey;
      }
    }
    
    // New format with IV
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return '';
  }
}

async function testOpenRouterAPI() {
  console.log('🧪 === OPENROUTER API TEST SCRIPT ===\n');

  try {
    // Step 1: Get API key from database
    console.log('1️⃣ Fetching OpenRouter API key from database...');
    const settings = await db
      .select()
      .from(openRouterSettings)
      .limit(1);

    if (settings.length === 0) {
      console.error('❌ No OpenRouter settings found in database');
      console.log('💡 Please configure your OpenRouter API key in the application settings first');
      process.exit(1);
    }

    console.log(`✅ Found OpenRouter settings for user: ${settings[0].userId}`);
    console.log(`   Encrypted key length: ${settings[0].apiKey.length} chars`);

    // Step 2: Decrypt API key
    console.log('\n2️⃣ Decrypting API key...');
    const decryptedKey = decryptApiKey(settings[0].apiKey);
    
    if (!decryptedKey || decryptedKey.length < 10) {
      console.error('❌ Failed to decrypt API key or invalid key');
      process.exit(1);
    }

    console.log(`✅ API key decrypted successfully`);
    console.log(`   Key length: ${decryptedKey.length} chars`);
    console.log(`   Key prefix: ${decryptedKey.substring(0, 10)}...`);
    console.log(`   Key suffix: ...${decryptedKey.slice(-4)}`);
    console.log(`   Starts with sk-or-: ${decryptedKey.startsWith('sk-or-')}`);

    // Step 3: Test OpenRouter API call
    console.log('\n3️⃣ Testing OpenRouter API connection...');
    
    const testPayload = {
      model: 'google/gemma-3-27b-it',
      messages: [
        { role: 'user', content: 'Hello! Please respond with "API test successful" if you can see this message.' }
      ],
      max_tokens: 50,
      temperature: 0.7
    };

    const headers = {
      'Authorization': `Bearer ${decryptedKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.BASE_URL || 'http://localhost:5000',
      'X-Title': 'Video Clipper AI Assistant - API Test'
    };

    console.log(`   API URL: https://openrouter.ai/api/v1/chat/completions`);
    console.log(`   Model: ${testPayload.model}`);
    console.log(`   Headers:`, {
      ...headers,
      'Authorization': `Bearer ${decryptedKey.substring(0, 10)}...${decryptedKey.slice(-4)}`
    });

    const startTime = Date.now();
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(testPayload)
    });

    const responseTime = Date.now() - startTime;
    console.log(`   Response time: ${responseTime}ms`);
    console.log(`   Status: ${response.status} ${response.statusText}`);

    // Step 4: Process response
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API call failed with status ${response.status}`);
      console.error(`   Error response: ${errorText}`);
      
      // Analyze common errors
      if (response.status === 401) {
        console.log('💡 This indicates an authentication error. Your API key might be invalid or expired.');
      } else if (response.status === 429) {
        console.log('💡 Rate limit exceeded. Wait a moment and try again.');
      } else if (response.status === 400) {
        console.log('💡 Bad request. Check if the model name or parameters are correct.');
      }
      
      process.exit(1);
    }

    const data = await response.json();
    console.log(`✅ API call successful!`);
    console.log(`   Model used: ${data.model}`);
    console.log(`   Tokens used: ${data.usage?.total_tokens || 'N/A'}`);
    console.log(`   Prompt tokens: ${data.usage?.prompt_tokens || 'N/A'}`);
    console.log(`   Completion tokens: ${data.usage?.completion_tokens || 'N/A'}`);
    
    if (data.choices && data.choices.length > 0) {
      console.log(`   AI Response: "${data.choices[0].message.content}"`);
    }

    console.log('\n🎉 === TEST COMPLETED SUCCESSFULLY ===');
    console.log('✅ OpenRouter API is working correctly');
    console.log('✅ Your API key is valid and active');
    console.log('✅ The issue must be in the WebSocket or frontend flow');

  } catch (error) {
    console.error('\n❌ === TEST FAILED ===');
    console.error(`Error: ${error.message}`);
    console.error('Stack trace:', error.stack);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Network connection failed. Check your internet connection.');
    } else if (error.name === 'FetchError') {
      console.log('💡 Network request failed. Check your internet connection and firewall settings.');
    }
    
    process.exit(1);
  }
}

// Run the test
testOpenRouterAPI().catch(console.error);