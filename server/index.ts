import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { config } from "dotenv";
import { registerRoutes } from "./routes";
import { chatRoutes } from "./chatRoutes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeWebSocket } from "./services/websocketService";
import { DatabaseInitService } from "./services/databaseInitService";

// Load environment variables
config();

const app = express();
app.use(express.json({ limit: '50mb' })); // Increase limit for video uploads
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// CORS configuration for local development
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:5000',
    'http://localhost:3000',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:3000'
  ];
  
  if (allowedOrigins.includes(origin as string)) {
    res.setHeader('Access-Control-Allow-Origin', origin as string);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize database and perform startup health checks
  console.log('\n🚀 Starting Video Clipper Application...\n');
  
  try {
    // Step 1: Initialize database schema
    const dbStatus = await DatabaseInitService.initialize();
    if (!dbStatus.connected) {
      console.error('❌ Database connection failed. Server cannot start.');
      if (dbStatus.errors.length > 0) {
        console.error('Errors:', dbStatus.errors.join(', '));
      }
      process.exit(1);
    }

    // Show warnings for missing tables but allow server to start
    if (!dbStatus.tablesExist) {
      console.log('⚠️  Database schema incomplete - some features may not work correctly.');
      if (dbStatus.errors.length > 0) {
        console.log('Schema issues:', dbStatus.errors.join(', '));
      }
    }

    // Step 2: Perform startup health check
    const healthCheck = await DatabaseInitService.performStartupHealthCheck();
    if (!healthCheck.database || !healthCheck.environment) {
      console.error('❌ Critical startup health check failed. Server cannot start.');
      process.exit(1);
    }

    if (healthCheck.warnings.length > 0) {
      console.log('⚠️  Non-critical warnings detected - server will continue:');
      healthCheck.warnings.forEach(warning => console.log(`  • ${warning}`));
    }

    console.log('✅ All startup checks passed. Initializing server...\n');
    
  } catch (error) {
    console.error('❌ Startup initialization failed:', error);
    process.exit(1);
  }

  // Create HTTP server and Socket.IO
  const httpServer = createServer(app);
  const io = new SocketServer(httpServer, {
    cors: {
      origin: function(origin, callback) {
        // Allow Railway domains, localhost for development, and same origin
        const allowedOrigins = [
          'http://localhost:5000',
          'http://localhost:3000', 
          'http://127.0.0.1:5000',
          'http://127.0.0.1:3000'
        ];
        
        // Allow Railway production domains (*.railway.app and *.up.railway.app)
        const isRailwayDomain = origin?.includes('.railway.app');
        
        // Allow same-origin requests (when origin is undefined, like from same domain)
        if (!origin || allowedOrigins.includes(origin) || isRailwayDomain) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'), false);
        }
      },
      credentials: true
    }
  });

  // Initialize WebSocket service
  const webSocketService = initializeWebSocket(io);

  const server = await registerRoutes(app, io);
  
  // Add chat routes
  app.use('/api/chat', chatRoutes);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  httpServer.listen(port, "0.0.0.0", () => {
    console.log('\n🎉 Video Clipper Server Started Successfully!');
    console.log(`📡 Server running on http://localhost:${port}`);
    console.log('🔌 WebSocket support enabled');
    console.log('💾 Database ready and validated');
    console.log('\nReady to accept requests...\n');
  });
})();
