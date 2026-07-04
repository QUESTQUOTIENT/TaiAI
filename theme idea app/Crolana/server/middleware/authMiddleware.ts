

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';

const authMiddlewareLog = logger('authMiddleware');



export interface AuthPayload {
  address: string;
  chain: 'cronos' | 'solana';
  chainId?: number;
  walletType?: string;
}


declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}



const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    authMiddlewareLog.error('FATAL: JWT_SECRET not set in production — exiting');
    process.exit(1);
  }
  return 'crolana-dev-secret-do-not-use-in-production-change-me';
})();




export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const payload = extractPayload(req);
  if (!payload) {
    authMiddlewareLog.auth('reject', 'unknown', 'cronos', { path: req.path, method: req.method });
    res.status(401).json({
      error: 'Authentication required. Sign in with your wallet to access this endpoint.',
      hint: 'POST /api/auth/verify (EVM) or POST /api/auth/solana/verify (Solana) to get a JWT.',
    });
    return;
  }
  req.auth = payload;
  next();
}


export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const payload = extractPayload(req);
  if (payload) req.auth = payload;
  next();
}


export function requireChain(chain: 'cronos' | 'solana') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const payload = extractPayload(req);
    if (!payload) {
      authMiddlewareLog.auth('reject', 'unknown', chain, { path: req.path, reason: 'no_token' });
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (payload.chain !== chain) {
      authMiddlewareLog.auth('reject', payload.address, chain, {
        path: req.path, reason: 'wrong_chain', provided: payload.chain, required: chain,
      });
      res.status(403).json({
        error: `This endpoint requires a ${chain} wallet token. You provided a ${payload.chain} token.`,
      });
      return;
    }
    req.auth = payload;
    next();
  };
}



function extractPayload(req: Request): AuthPayload | null {
  const authHeader = req.headers.authorization;
  let token: string | null = null;

  
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  
  else if (typeof req.headers['x-auth-token'] === 'string') {
    token = req.headers['x-auth-token'];
  }

  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return {
      address:    decoded.address,
      chain:      decoded.chain ?? 'cronos',   
      chainId:    decoded.chainId,
      walletType: decoded.walletType,
    };
  } catch {
    return null;
  }
}




export function assertOwnership(req: Request, ownerAddress: string): void {
  const auth = req.auth;
  if (!auth) throw new Error('Not authenticated');
  if (auth.address.toLowerCase() !== ownerAddress.toLowerCase()) {
    const err = new Error('Forbidden: you do not own this resource') as any;
    err.status = 403;
    throw err;
  }
}
