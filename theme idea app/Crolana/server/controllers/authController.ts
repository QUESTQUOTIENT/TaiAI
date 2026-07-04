import { Request, Response } from 'express';
import { ethers } from 'ethers';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { authLog } from '../utils/logger.js';


const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();




const revokedTokens = new Map<string, number>(); 


setInterval(() => {
  const now = Date.now();
  for (const [jti, exp] of revokedTokens.entries()) {
    if (exp < now) revokedTokens.delete(jti);
  }
}, 60 * 60 * 1000); 

export function isTokenRevoked(jti: string): boolean {
  const exp = revokedTokens.get(jti);
  if (exp === undefined) return false;
  if (exp < Date.now()) { revokedTokens.delete(jti); return false; }
  return true;
}



const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    authLog.error('FATAL: JWT_SECRET not set in production — session tokens will be invalid on restart', { chain: 'cronos' });
    process.exit(1);
  }
  authLog.warn('JWT_SECRET not set — using insecure dev default (never use in production)', { chain: 'cronos' });
  return 'crolana-dev-secret-do-not-use-in-production-change-me';
})();

const NONCE_EXPIRY_MS  = 5 * 60 * 1000;
const SESSION_EXPIRY_S = 7 * 24 * 60 * 60;


setInterval(() => {
  const now = Date.now();
  for (const [key, val] of nonceStore.entries()) {
    if (val.expiresAt < now) nonceStore.delete(key);
  }
}, 10 * 60 * 1000);

function signJWT(payload: object): string {
  
  const jti = crypto.randomBytes(16).toString('hex');
  return jwt.sign({ ...payload, jti }, JWT_SECRET, { expiresIn: SESSION_EXPIRY_S });
}

function verifyJWT(token: string): { address: string; chainId: number } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    
    if (payload.jti && isTokenRevoked(payload.jti)) return null;
    return { address: payload.address, chainId: payload.chainId };
  } catch {
    return null;
  }
}


export const getNonce = async (req: Request, res: Response) => {
  const { address } = req.query;
  if (!address || typeof address !== 'string' || !ethers.isAddress(address)) {
    return res.status(400).json({ error: 'Valid Ethereum address required' });
  }
  const checksummed = ethers.getAddress(address);
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + NONCE_EXPIRY_MS;
  nonceStore.set(checksummed.toLowerCase(), { nonce, expiresAt });
  const message =
    `Crolana wants you to sign in with your Ethereum account:\n${checksummed}\n\n` +
    `Nonce: ${nonce}\nIssued At: ${new Date().toISOString()}\nChain ID: 25`;
  authLog.auth('nonce', checksummed, 'cronos');
  res.json({ nonce, message, expiresAt });
};


export const verifySignature = async (req: Request, res: Response) => {
  const { address, signature, message, chainId = 25 } = req.body;
  if (!address || !signature || !message) {
    return res.status(400).json({ error: 'address, signature, and message are required' });
  }
  let checksummed: string;
  try { checksummed = ethers.getAddress(address); }
  catch { return res.status(400).json({ error: 'Invalid address' }); }

  const stored = nonceStore.get(checksummed.toLowerCase());
  if (!stored || stored.expiresAt < Date.now()) {
    return res.status(401).json({ error: 'Nonce expired or not found. Request a new nonce.' });
  }
  let recovered: string;
  try { recovered = ethers.verifyMessage(message, signature); }
  catch { return res.status(401).json({ error: 'Failed to recover signer from signature' }); }

  if (recovered.toLowerCase() !== checksummed.toLowerCase()) {
    authLog.auth('verify_fail', checksummed, 'cronos', { reason: 'signature_mismatch' });
    return res.status(401).json({ error: 'Signature mismatch' });
  }
  nonceStore.delete(checksummed.toLowerCase());
  const token = signJWT({ address: checksummed, chainId });
  authLog.auth('verify_ok', checksummed, 'cronos', { chainId });
  res.json({ token, address: checksummed, chainId, expiresAt: Date.now() + SESSION_EXPIRY_S * 1000 });
};


export const getSession = async (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Bearer token required' });
  }
  const payload = verifyJWT(auth.slice(7));
  if (!payload) return res.status(401).json({ error: 'Invalid or expired session' });
  res.json({ address: payload.address, chainId: payload.chainId, authenticated: true });
};


export const logout = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.decode(token) as any;
      if (payload?.jti && payload?.exp) {
        
        revokedTokens.set(payload.jti, payload.exp * 1000);
        authLog.auth('logout', payload.address ?? 'unknown', 'cronos');
      }
    } catch {  }
  }
  res.json({ success: true, message: 'Logged out successfully.' });
};

export { verifyJWT };
