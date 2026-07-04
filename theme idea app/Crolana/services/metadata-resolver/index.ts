import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import NodeCache from 'node-cache';
import { URL } from 'url';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';



const cache = new NodeCache({
  stdTTL: 300,
  checkperiod: 120,
  useClones: false,
});


const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173'];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (origin.endsWith('.railway.app') || origin.endsWith('.up.railway.app')) return cb(null, true);
    cb(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
}));


try {
  const helmet = (await import('helmet')).default;
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
} catch {
  console.warn('helmet not installed — skipping');
}


app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));


interface RateLimitEntry {
  count: number;
  resetTime: number;
}
const rateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;

function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimits.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimits.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    res.status(429).json({
      error: 'RATE_LIMITED',
      message: `Too many requests. Try again in ${Math.ceil((entry.resetTime - now) / 1000)}s`,
    });
    return;
  }

  entry.count++;
  next();
}
app.use('/api/', rateLimitMiddleware);




function normalizeDriveLink(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('drive.google.com')) return url;

    
    const fileIdMatch = url.match(/\/d\/([^\/]+)/) || url.match(/id=([^&]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
      return `https://drive.google.com/uc?id=${fileIdMatch[1]}`;
    }
    return url;
  } catch {
    return url;
  }
}


async function validateUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}


async function fetchExternalMetadata(url: string): Promise<any> {
  const normalizedUrl = normalizeDriveLink(url);

  
  const cacheKey = `external:${normalizedUrl}`;
  const cached = cache.get<any>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Number(process.env.FETCH_TIMEOUT) || 10000);

    const response = await fetch(normalizedUrl, {
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let data;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      
      data = {
        name: 'External Resource',
        description: 'Metadata fetched from external URL',
        externalUrl: normalizedUrl,
        rawContent: await response.text().catch(() => null),
      };
    }

    
    cache.set(cacheKey, data, 600);
    return data;
  } catch (error: any) {
    console.error('Failed to fetch external metadata:', error.message);
    throw error;
  }
}


function resolveIpfsUri(ipfsUri: string): string {
  if (!ipfsUri.startsWith('ipfs://')) {
    return ipfsUri;
  }

  const cid = ipfsUri.replace('ipfs://', '');
  
  const gateways = [
    `https://cloudflare-ipfs.com/ipfs/${cid}`,
    `https://ipfs.io/ipfs/${cid}`,
    `https://dweb.link/ipfs/${cid}`,
  ];

  
  return gateways[0];
}


async function fetchIpfsMetadata(ipfsUri: string): Promise<any> {
  const gatewayUrl = resolveIpfsUri(ipfsUri);

  
  const cacheKey = `ipfs:${ipfsUri}`;
  const cached = cache.get<any>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Number(process.env.FETCH_TIMEOUT) || 10000);

    const response = await fetch(gatewayUrl, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    
    cache.set(cacheKey, data, 3600);
    return data;
  } catch (error: any) {
    console.error('Failed to fetch IPFS metadata:', error.message);
    throw error;
  }
}




app.get('/api/health', (req: Request, res: Response) => {
  const stats = cache.getStats();
  res.json({
    status: 'ok',
    service: 'metadata-resolver',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    cache: {
      keys: stats.keys,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.keys > 0 ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2) + '%' : 'N/A',
    },
  });
});


app.get('/api/metadata/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fallback } = req.query;

    
    const decodedId = decodeURIComponent(id);

    
    let metadata: any = null;
    let source: 'ipfs' | 'external' | 'fallback' | 'none' = 'none';

    
    if (decodedId.startsWith('http://') || decodedId.startsWith('https://') || decodedId.includes('drive.google.com') || decodedId.includes('dropbox.com')) {
      try {
        metadata = await fetchExternalMetadata(decodedId);
        source = 'external';
      } catch (error) {
        console.warn('External fetch failed, trying fallback:', error);
        metadata = null;
      }
    }

    
    if (!metadata && (decodedId.startsWith('ipfs://') || decodedId.includes('Qm') || decodedId.includes('bafy'))) {
      try {
        metadata = await fetchIpfsMetadata(decodedId);
        source = 'ipfs';
      } catch (error) {
        console.warn('IPFS fetch failed, trying fallback:', error);
        metadata = null;
      }
    }

    
    if (!metadata && fallback) {
      try {
        const fallbackStr = String(fallback);
        if (fallbackStr.startsWith('http')) {
          metadata = await fetchExternalMetadata(fallbackStr);
          source = 'fallback:external';
        } else {
          metadata = await fetchIpfsMetadata(fallbackStr);
          source = 'fallback:ipfs';
        }
      } catch (error) {
        console.warn('Fallback also failed:', error);
      }
    }

    
    if (!metadata) {
      res.status(200).json({
        success: true,
        source: 'placeholder',
        data: {
          name: 'NFT Metadata',
          description: 'Metadata unavailable',
          image: null,
          attributes: [],
        },
        cached: false,
      });
      return;
    }

    
    const normalized = {
      success: true,
      source,
      data: {
        name: metadata.name || 'Unnamed',
        description: metadata.description || metadata.properties?.description || '',
        image: metadata.image || null,
        
        imageUrl: metadata.image?.startsWith('http') ? metadata.image : null,
        attributes: metadata.attributes || metadata.traits || [],
        external_url: metadata.external_url || metadata.externalUrl || null,
      },
      cached: false, 
      resolved: {
        original: decodedId,
        resolvedVia: source,
        timestamp: new Date().toISOString(),
      },
    };

    res.json(normalized);
  } catch (error: any) {
    console.error('Metadata resolution error:', error);
    res.status(500).json({
      success: false,
      error: 'METADATA_RESOLUTION_FAILED',
      message: error.message,
    });
  }
});


app.post('/api/metadata/batch', async (req: Request, res: Response) => {
  try {
    const { ids, fallback } = req.body;

    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: 'ids must be an array' });
    }

    if (ids.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 IDs per batch' });
    }

    const results = await Promise.allSettled(
      ids.map(async (id: string) => {
        try {
          const url = `${req.protocol}://${req.get('host')}/api/metadata/${encodeURIComponent(id)}${fallback ? `?fallback=${encodeURIComponent(fallback)}` : ''}`;
          const response = await fetch(url);
          return { id, success: true, data: await response.json() };
        } catch (error) {
          return { id, success: false, error: error instanceof Error ? error.message : String(error) };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;

    res.json({
      success: true,
      total: ids.length,
      successful,
      failed,
      results: results.map(r => r.status === 'fulfilled' ? r.value : { id: 'unknown', success: false, error: 'Batch processing error' }),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'BATCH_RESOLUTION_FAILED',
      message: error.message,
    });
  }
});


app.get('/api/metadata/validate', async (req: Request, res: Response) => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url parameter is required' });
    }

    const normalized = normalizeDriveLink(url);

    
    const isValid = await validateUrl(normalized);

    
    let contentType: string | null = null;
    try {
      const response = await fetch(normalized, { method: 'HEAD' });
      contentType = response.headers.get('content-type');
    } catch {
      
    }

    res.json({
      success: true,
      data: {
        original: url,
        normalized,
        valid: isValid,
        contentType,
        is likelyImage: contentType?.includes('image/') || false,
        is likelyJson: contentType?.includes('application/json') || false,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'VALIDATION_FAILED',
      message: error.message,
    });
  }
});


app.get('/api/metadata/convert', (req: Request, res: Response) => {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url parameter is required' });
  }

  const converted = normalizeDriveLink(url);
  const isDrive = url.includes('drive.google.com');
  const isDropbox = url.includes('dropbox.com');

  res.json({
    success: true,
    data: {
      original: url,
      converted,
      type: isDrive ? 'google-drive' : isDropbox ? 'dropbox' : 'generic',
      requiresConversion: isDrive || isDropbox,
    },
  });
});


app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Metadata resolver error:', err);
  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: IS_PROD ? 'Internal server error' : err.message,
  });
});


app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: 'Endpoint not found',
  });
});


app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎯 Metadata Resolver v1.0 running on http://localhost:${PORT}`);
  console.log(`   Environment: ${IS_PROD ? 'production' : 'development'}`);
  console.log(`   Cache enabled: Yes (TTL: 5min default)`);
  console.log(`   Rate limit: ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW_MS}ms`);
});


process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('SIGINT received — shutting down');
  process.exit(0);
});
