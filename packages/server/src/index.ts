import http from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { config } from './config';
import { getDb } from './db/database';
import { docsRouter } from './routes/docs';
import { createHealthRouter } from './routes/health';
import { WsSyncServer } from './sync/WsSyncServer';
import { securityHeadersMiddleware, createRateLimiter } from './middleware/security';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getClientDistPath(): string | null {
  const candidatePaths = [
    path.resolve(process.cwd(), 'packages/client/dist'),
    path.resolve(process.cwd(), '../client/dist'),
    path.resolve(__dirname, '../../client/dist'),
    path.resolve(__dirname, '../../../client/dist'),
    path.resolve(process.cwd(), 'dist'),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(path.join(p, 'index.html'))) {
      return p;
    }
  }
  return null;
}

async function bootstrap() {
  console.log('---------------------------------------------------------');
  console.log(' SyncForge — Real-Time CRDT Document Synchronization Engine');
  console.log('---------------------------------------------------------');

  // Initialize storage layer
  await getDb();

  const app = express();

  // Parse CORS origins (support production origin, wildcard, onrender.com subdomains, and localhost)
  const allowedOrigins = config.corsOrigin.split(',').map((o) => o.trim());
  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      if (
        !origin ||
        config.corsOrigin === '*' ||
        allowedOrigins.includes(origin) ||
        allowedOrigins.includes('*') ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin === 'https://syncforge-frontend.onrender.com' ||
        origin.endsWith('.onrender.com') ||
        origin.includes('onrender.com')
      ) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  };

  // Security headers & body limit (prevents JSON body bomb DoS)
  app.use(securityHeadersMiddleware);
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // Global rate limiter on API: 300 requests per minute per IP
  const globalApiLimiter = createRateLimiter({
    windowMs: 60000,
    maxRequests: 300,
    message: 'Global API request rate limit reached. Please retry shortly.',
  });
  app.use('/api', globalApiLimiter);

  const server = http.createServer(app);
  const wss = new WebSocketServer({
    server,
    maxPayload: 5 * 1024 * 1024, // 5 MB max payload
  });
  const wsSyncServer = new WsSyncServer(wss);

  // Mount Health Routes (both /health for Render load balancers and /api/health)
  const healthRouter = createHealthRouter(wsSyncServer);
  app.use('/health', healthRouter);
  app.use('/api/health', healthRouter);
  app.use('/api', healthRouter);

  // Mount Document API endpoints
  app.use('/api/docs', docsRouter);

  // Serve static production React client if dist exists
  const clientDist = getClientDistPath();
  if (clientDist) {
    console.log(`[SyncForge Server] Serving static production frontend from: ${clientDist}`);
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/ws')) {
        return next();
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    // Root endpoint fallback in dev/headless
    app.get('/', (req, res) => {
      res.json({
        name: 'SyncForge Server',
        version: '1.0.0',
        description: 'Real-time CRDT collaborative document editing server',
        wsEndpoint: `ws://${req.headers.host || 'localhost:' + config.port}/ws/:docId`,
        docsApi: '/api/docs',
        health: '/health',
      });
    });
  }

  server.listen(config.port, config.host, () => {
    console.log(`[SyncForge Server] HTTP & WebSocket server listening on http://${config.host}:${config.port}`);
    console.log(`[SyncForge Server] WebSocket endpoint available at ws://${config.host}:${config.port}/ws/:docId`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[SyncForge Server] Shutting down gracefully...');
    wsSyncServer.close();
    wss.close();
    server.close(async () => {
      const db = await getDb();
      await db.close();
      console.log('[SyncForge Server] Server and DB connections closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[SyncForge Server] Fatal startup error:', err);
  process.exit(1);
});
