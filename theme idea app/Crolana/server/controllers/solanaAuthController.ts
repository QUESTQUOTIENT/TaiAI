

import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { solAuthLog } from '../utils/logger.js';



const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    solAuthLog.error('FATAL: JWT_SECRET not set in production — exiting', { chain: 'solana' });
    process.exit(1);
  }
  solAuthLog.warn('JWT_SECRET not set — using insecure dev default (never use in production)', { chain: 'solana' });
  return 'crolana-dev-secret-do-not-use-in-production-change-me';
})();

const NONCE_EXPIRY_MS = 5 * 60 * 1000;   
const SESSION_EXPIRY_S = 7 * 24 * 60 * 60; 


const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();


setInterval(() => {
  const now = Date.now();
  for (const [key, val] of nonceStore) {
    if (val.expiresAt < now) nonceStore.delete(key);
  }
}, 10 * 60 * 1000);



function isValidSolanaAddress(address: string): boolean {
  
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function signJWT(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_EXPIRY_S });
}


async function verifySolanaSignature(
  publicKeyBase58: string,
  messageText: string,
  signatureBase64: string,
): Promise<boolean> {
  try {
    
    const nacl = await import('tweetnacl').then((m) => m.default ?? m);
    const bs58 = await import('bs58').then((m) => m.default ?? m);

    const publicKeyBytes = bs58.decode(publicKeyBase58);
    const messageBytes = new TextEncoder().encode(messageText);
    const signatureBytes = Buffer.from(signatureBase64, 'base64');

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch (importErr) {
    solAuthLog.warn('tweetnacl or bs58 not installed — run: npm install tweetnacl bs58', {
      chain: 'solana', fallback: process.env.NODE_ENV !== 'production' ? 'dev-skip' : 'fatal',
    });
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Solana signature verification requires tweetnacl and bs58. Run: npm install tweetnacl bs58');
    }
    return true;
  }
}




export const getSolanaNonce = async (req: Request, res: Response): Promise<void> => {
  const { address } = req.query;

  if (!address || typeof address !== 'string') {
    res.status(400).json({ error: 'Solana public key address is required' });
    return;
  }
  if (!isValidSolanaAddress(address)) {
    res.status(400).json({ error: 'Invalid Solana public key format' });
    return;
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const issuedAt = new Date().toISOString();
  const expiresAt = Date.now() + NONCE_EXPIRY_MS;

  nonceStore.set(address, { nonce, expiresAt });

  const message =
    `Crolana wants you to sign in with your Solana account:\n${address}\n\n` +
    `Nonce: ${nonce}\nIssued At: ${issuedAt}\nChain: Solana`;

  solAuthLog.auth('nonce', address, 'solana');
  res.json({ nonce, message, expiresAt });
};


export const verifySolanaAuth = async (req: Request, res: Response): Promise<void> => {
  const { address, signature, message } = req.body;

  if (!address || !signature || !message) {
    res.status(400).json({ error: 'address, signature, and message are required' });
    return;
  }
  if (!isValidSolanaAddress(address)) {
    res.status(400).json({ error: 'Invalid Solana address' });
    return;
  }

  const stored = nonceStore.get(address);
  if (!stored || stored.expiresAt < Date.now()) {
    res.status(401).json({ error: 'Nonce expired or not found. Request a new nonce.' });
    return;
  }

  
  if (!message.includes(stored.nonce)) {
    res.status(401).json({ error: 'Message nonce mismatch' });
    return;
  }

  
  let valid = false;
  try {
    valid = await verifySolanaSignature(address, message, signature);
  } catch (err: any) {
    res.status(500).json({ error: `Signature verification error: ${err.message}` });
    return;
  }

  if (!valid) {
    solAuthLog.auth('verify_fail', address, 'solana');
    res.status(401).json({ error: 'Signature is invalid. Authentication failed.' });
    return;
  }

  
  nonceStore.delete(address);

  const token = signJWT({ address, chain: 'solana', walletType: 'phantom' });

  solAuthLog.auth('verify_ok', address, 'solana');
  res.json({
    token,
    address,
    chain: 'solana',
    expiresAt: Date.now() + SESSION_EXPIRY_S * 1000,
  });
};


export const getSolanaSession = (req: Request, res: Response): void => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Bearer token required' });
    return;
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as any;
    res.json({ address: payload.address, chain: payload.chain ?? 'solana', authenticated: true });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
