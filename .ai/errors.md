client:536 WebSocket connection to 'ws://localhost:5000/?token=w4FIZFUwX4oS' failed: 
setupWebSocket @ client:536
client:536 Uncaught (in promise) SyntaxError: Failed to construct 'WebSocket': The URL 'ws://localhost:undefined/?token=w4FIZFUwX4oS' is invalid.

✅ Using cached concatenated video
4:23:32 PM [express] GET /api/videos/607e4180-a922-47bd-9089-ddece196da6c/seamless 304 in 285ms
4:23:34 PM [express] GET /api/videos/607e4180-a922-47bd-9089-ddece196da6c/clips 304 in 226ms :: [{"i…
Client disconnected: D41JzNjzbq7S4tN_AAAB
4:23:37 PM [express] GET /api/user 304 in 138ms :: {"id":"549733e5-a2c6-4c0f-bde1-9357b3d4654e","use…
🔍 [OpenRouter Settings] Loading settings for user: 549733e5-a2c6-4c0f-bde1-9357b3d4654e
🔍 [OpenRouter] Getting settings from database for user: 549733e5-a2c6-4c0f-bde1-9357b3d4654e
🔍 [OpenRouter] Database query result: {
  found: true,
  encryptedKeyLength: 193,
  encryptedKeyStart: '45170cf167661e445c79...'
}
🔍 [OpenRouter] Decryption result: { success: true, decryptedLength: 73, startsWithSk: true }
🔍 [OpenRouter Settings] Settings result: { found: true, apiKeyLength: 73, apiKeyStart: 'sk-or-v' }
✅ [OpenRouter Settings] Valid settings found
4:23:37 PM [express] GET /api/videos 304 in 185ms :: [{"id":"607e4180-a922-47bd-9089-ddece196da6c","…
4:23:37 PM [express] GET /api/chat/user/openrouter-settings 304 in 189ms :: {"configured":true,"apiK…