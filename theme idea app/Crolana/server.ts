import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import ipfsRoutes from './server/routes/ipfs.js';
import contractRoutes from './server/routes/contract.js';
import mintRoutes from './server/routes/mint.js';
import tokenRoutes from './server/routes/token.js';
import analyticsRoutes from './server/routes/analytics.js';
import dexRoutes from './server/routes/dex.js';
import authRoutes from './server/routes/auth.js';
import rpcRoutes from './server/routes/rpc.js';
import storageRoutes from './server/routes/storage.js';
import nftRoutes from './server/routes/nft.js';
import poolRoutes from './server/routes/pool.js';
import solanaRoutes from './server/routes/solana.js';
import chainRoutes from './server/routes/chain.js';
import transactionsRoutes from './server/routes/transactions.js';
import aiRoutes from './server/routes/ai.js';
import metadataRoutes from './server/routes/metadata.js';
import { logChainConfig } from './server/utils/chainConfig.js';
import { logger, requestLogger } from './server/utils/logger.js';

const serverLog = logger('server');

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const IS_PROD = process.env.NODE_ENV === 'production';

  
  
  
  
  app.set('trust proxy', 1);


  app.use(compression());


  
  if (process.env.SENTRY_DSN) {
    try {
      const Sentry = await import('@sentry/node');
      Sentry.init({
        dsn:              process.env.SENTRY_DSN,
        environment:      process.env.NODE_ENV ?? 'production',
        tracesSampleRate: 0.1,
      });
      serverLog.info('Sentry backend monitoring initialised');
    } catch { serverLog.warn('Sentry init failed — continuing without monitoring'); }
  }

  
  try {
    const helmet = (await import('helmet')).default;
    app.use(helmet({
      
      
      
      
      contentSecurityPolicy: false,
      
      crossOriginEmbedderPolicy: false,
    }));
  } catch { serverLog.warn('helmet not installed — skipping (run: npm install)'); }

  
  
  
  
  function normaliseOrigin(raw: string): string[] {
    const o = raw.trim();
    if (!o) return [];
    if (o.startsWith('http://') || o.startsWith('https://')) return [o];
    
    return [`https://${o}`, `http://${o}`];
  }

  const allowedOrigins: string[] = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').flatMap(normaliseOrigin)
    : ['http://localhost:3000', 'http://localhost:5173'];

  
  if (process.env.NODE_ENV !== 'production') {
    if (!allowedOrigins.includes('http://localhost:3000'))  allowedOrigins.push('http://localhost:3000');
    if (!allowedOrigins.includes('http://localhost:5173'))  allowedOrigins.push('http://localhost:5173');
  }

  serverLog.info('CORS origins configured', { origins: allowedOrigins });

  app.use(cors({
    origin: (origin, callback) => {
      
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) return callback(null, true);
      
      
      if (origin.endsWith('.railway.app') || origin.endsWith('.up.railway.app')) {
        return callback(null, true);
      }
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    credentials: true,
  }));

  
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  
  app.use(requestLogger);

  
  try {
    const { rateLimit } = await import('express-rate-limit');
    const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
    const compileLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many compile/deploy requests.' } });
    
    const rpcLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false, message: { error: 'RPC rate limit reached. Please slow down.' } });
    app.use('/api/', apiLimiter);
    app.use('/api/rpc', rpcLimiter);
    app.use('/api/solana', rpcLimiter);   
    app.use('/api/contract/compile', compileLimiter);
    app.use('/api/contract/deploy', compileLimiter);
    app.use('/api/token/compile', compileLimiter);
    app.use('/api/token/deploy', compileLimiter);
  } catch { serverLog.warn('express-rate-limit not installed — skipping (run: npm install)'); }

  
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  
  app.use('/api/ipfs', ipfsRoutes);
  app.use('/api/storage', storageRoutes);
  app.use('/api/contract', contractRoutes);
  app.use('/api/mint', mintRoutes);
  app.use('/api/token', tokenRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/transactions', transactionsRoutes);
  app.use('/api/dex', dexRoutes);
  app.use('/api/nft', nftRoutes);
  app.use('/api/pool', poolRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/solana', solanaRoutes);
  app.use('/api/rpc', rpcRoutes);
  
  app.use('/api/ai', aiRoutes);
  
  
  app.use('/api/metadata', metadataRoutes);
  
  
  
  app.use('/api', chainRoutes);

  
  
  
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '7.1.0',
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development',
      uptime: Math.floor(process.uptime()),
    });
  });

  
  
  
  const distPath = path.join(process.cwd(), 'dist');
  const distExists = fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'));

  if (distExists) {
    
    serverLog.info('Serving pre-built frontend from dist/');
    app.use(express.static(distPath, {
      maxAge: '1y',
      immutable: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    }));
    
    app.get('*', (_req, res) => {
      if (_req.path.startsWith('/api/')) return;
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else if (!IS_PROD) {
    
    serverLog.info('Starting Vite dev server...');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    serverLog.error('dist/ not found in production — build may have failed');
    
    app.get('*', (_req, res) => {
      if (_req.path.startsWith('/api/')) return;
      res.status(503).send('Frontend not built. Run npm run build.');
    });
  }

  
  app.use((_req: Request, res: Response) => {
    if (_req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'API route not found' });
    } else {
      res.status(404).send('Not Found');
    }
  });

  
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as any).status || 500;
    const message = IS_PROD && status === 500 ? 'Internal server error' : err.message;
    serverLog.error('Unhandled request error', { statusCode: status, error: err.message, stack: IS_PROD ? undefined : err.stack });
    res.status(status).json({ error: message });
  });

  
  app.listen(PORT, '0.0.0.0', () => {
    serverLog.info(`Crolana v7 running at http://localhost:${PORT}`, {
      env: process.env.NODE_ENV || 'development',
      port: PORT,
      uploads: uploadsDir,
    });
    logChainConfig();
  });
}


process.on('SIGTERM', () => {
  serverLog.info('SIGTERM received — shutting down gracefully');
  process.exit(0);
});
process.on('SIGINT', () => {
  serverLog.info('SIGINT received — shutting down');
  process.exit(0);
});
process.on('unhandledRejection', (reason) => {
  serverLog.error('Unhandled promise rejection', { error: String(reason) });
});

startServer().catch((err) => {
  serverLog.error('Server failed to start', { error: err?.message ?? String(err), stack: err?.stack });
  process.exit(1);
});
