

import crypto from 'crypto';
import { txLog } from '../utils/logger.js';



export type TxChain = 'cronos' | 'solana';
export type TxStatus = 'pending' | 'confirmed' | 'failed';

export interface TxRecord {
  id: string;
  chain: TxChain;
  txHash: string;
  walletAddress: string;
  status: TxStatus;
  blockNumber?: number;
  slot?: number;           
  fee?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>; 
  createdAt: number;       
  updatedAt: number;       
  confirmedAt?: number;    
  explorerUrl: string;
}

interface TrackOptions {
  chain: TxChain;
  txHash: string;
  walletAddress: string;
  metadata?: Record<string, unknown>;
  onConfirmed?: (record: TxRecord) => void;
  onFailed?: (record: TxRecord) => void;
}



const CRONOS_RPC = process.env.CRONOS_MAINNET_RPC ?? 'https://evm.cronos.org';
const SOLANA_RPCS = [
  process.env.SOLANA_MAINNET_RPC,
  'https://rpc.ankr.com/solana',
  'https://solana-rpc.publicnode.com',
  'https://api.mainnet-beta.solana.com',
].filter(Boolean) as string[];

async function fetchWithTimeout(url: string, opts: RequestInit, ms = 12_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function evmRpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetchWithTimeout(CRONOS_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json: any = await res.json();
  if (json.error) throw new Error(json.error.message ?? String(json.error));
  return json.result;
}

async function solanaRpc(method: string, params: unknown[]): Promise<unknown> {
  for (const rpc of SOLANA_RPCS) {
    try {
      const res = await fetchWithTimeout(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const json: any = await res.json();
      if (json.error) throw new Error(json.error.message);
      return json.result;
    } catch {  }
  }
  throw new Error('All Solana RPCs unavailable');
}



export class TxTracker {
  private static _instance: TxTracker;
  private store = new Map<string, TxRecord>();
  private pollers = new Map<string, NodeJS.Timeout>();

  static getInstance(): TxTracker {
    if (!TxTracker._instance) TxTracker._instance = new TxTracker();
    return TxTracker._instance;
  }

  

  
  track(opts: TrackOptions): TxRecord {
    const id = crypto.randomUUID();
    const now = Date.now();
    const record: TxRecord = {
      id,
      chain: opts.chain,
      txHash: opts.txHash,
      walletAddress: opts.walletAddress,
      status: 'pending',
      metadata: opts.metadata,
      createdAt: now,
      updatedAt: now,
      explorerUrl: this.explorerUrl(opts.chain, opts.txHash),
    };
    this.store.set(id, record);
    this.startPolling(id, opts.onConfirmed, opts.onFailed);
    txLog.info('Tracking started', { chain: opts.chain as any, txHash: opts.txHash, requestId: id });
    return record;
  }

  
  getStatus(id: string): TxRecord | null {
    return this.store.get(id) ?? null;
  }

  
  getByWallet(walletAddress: string): TxRecord[] {
    const walletLower = walletAddress.toLowerCase();
    return Array.from(this.store.values())
      .filter((r) => r.walletAddress.toLowerCase() === walletLower)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  
  getByHash(txHash: string): TxRecord | null {
    const norm = txHash.toLowerCase();
    return Array.from(this.store.values())
      .filter((r) => r.txHash.toLowerCase() === norm)
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  }

  

  private startPolling(
    id: string,
    onConfirmed?: (r: TxRecord) => void,
    onFailed?: (r: TxRecord) => void,
  ): void {
    const record = this.store.get(id);
    if (!record) return;

    let attempts = 0;
    const maxAttempts = record.chain === 'solana' ? 60 : 40; 
    const intervalMs = record.chain === 'solana' ? 3_000 : 5_000;

    const poll = async () => {
      attempts++;
      const current = this.store.get(id);
      if (!current || current.status !== 'pending') {
        this.clearPoller(id);
        return;
      }

      if (attempts > maxAttempts) {
        this.update(id, { status: 'failed', errorMessage: 'Timeout: transaction not confirmed' });
        this.clearPoller(id);
        onFailed?.(this.store.get(id)!);
        return;
      }

      try {
        const result = record.chain === 'solana'
          ? await this.pollSolana(current.txHash)
          : await this.pollEVM(current.txHash);

        if (result.status !== 'pending') {
          this.update(id, {
            status: result.status,
            blockNumber: result.blockNumber,
            slot: result.slot,
            fee: result.fee,
            errorMessage: result.errorMessage,
            confirmedAt: result.status === 'confirmed' ? Date.now() : undefined,
          });
          this.clearPoller(id);
          
          this.updateDbStatus(id).catch(() => {});

          const updated = this.store.get(id)!;
          if (result.status === 'confirmed') onConfirmed?.(updated);
          else onFailed?.(updated);

          txLog.tx(record.txHash, result.status, {
            chain: record.chain as any, blockNumber: result.blockNumber, slot: result.slot, attempts,
          });
        }
      } catch (err: any) {
        txLog.warn(`Poll error attempt ${attempts}`, { chain: record.chain as any, txHash: record.txHash, error: err.message });
      }
    };

    const timer = setInterval(poll, intervalMs);
    this.pollers.set(id, timer);
    
    poll().catch(() => {});
  }

  private async pollEVM(txHash: string): Promise<{
    status: TxStatus;
    blockNumber?: number;
    fee?: string;
    errorMessage?: string;
  }> {
    const receipt: any = await evmRpc('eth_getTransactionReceipt', [txHash]);
    if (!receipt) return { status: 'pending' };

    const blockNumber = parseInt(receipt.blockNumber, 16);
    const gasUsed = parseInt(receipt.gasUsed, 16);
    const effectiveGasPrice = parseInt(receipt.effectiveGasPrice ?? '0', 16);
    const fee = String(BigInt(gasUsed) * BigInt(effectiveGasPrice));

    if (receipt.status === '0x1') {
      return { status: 'confirmed', blockNumber, fee };
    } else {
      return { status: 'failed', blockNumber, fee, errorMessage: 'Transaction reverted' };
    }
  }

  private async pollSolana(signature: string): Promise<{
    status: TxStatus;
    slot?: number;
    fee?: string;
    errorMessage?: string;
  }> {
    const result: any = await solanaRpc('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
    const statusInfo = result?.value?.[0];

    if (!statusInfo) return { status: 'pending' };

    const confirmationStatus = statusInfo.confirmationStatus;
    if (statusInfo.err) {
      return { status: 'failed', slot: statusInfo.slot, errorMessage: JSON.stringify(statusInfo.err) };
    }
    if (confirmationStatus === 'confirmed' || confirmationStatus === 'finalized') {
      return { status: 'confirmed', slot: statusInfo.slot };
    }
    return { status: 'pending' };
  }

  private update(id: string, updates: Partial<TxRecord>): void {
    const record = this.store.get(id);
    if (record) this.store.set(id, { ...record, ...updates, updatedAt: Date.now() });
  }

  private clearPoller(id: string): void {
    const timer = this.pollers.get(id);
    if (timer) { clearInterval(timer); this.pollers.delete(id); }
  }

  private explorerUrl(chain: TxChain, hash: string): string {
    return chain === 'solana'
      ? `https://solscan.io/tx/${hash}`
      : `https://explorer.cronos.org/tx/${hash}`;
  }

  
  purgeOld(maxAgeMs = 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [id, record] of this.store) {
      if (record.status !== 'pending' && record.updatedAt < cutoff) {
        this.store.delete(id);
      }
    }
  }

  

  
  async persistToDb(record: TxRecord): Promise<void> {
    try {
      const { PrismaClient } = await import('@prisma/client').catch(() => ({ PrismaClient: null }));
      if (!PrismaClient) return;
      const prisma = new (PrismaClient as any)();
      await prisma.trackedTransaction.upsert({
        where: { id: record.id },
        create: {
          id:            record.id,
          chain:         record.chain === 'solana' ? 'SOLANA' : 'CRONOS',
          txHash:        record.txHash,
          walletAddress: record.walletAddress,
          status:        record.status.toUpperCase() as any,
          blockNumber:   record.blockNumber ?? null,
          slot:          record.slot ?? null,
          fee:           record.fee ?? null,
          errorMessage:  record.errorMessage ?? null,
          metadata:      record.metadata ?? null,
          confirmedAt:   record.confirmedAt ? new Date(record.confirmedAt) : null,
        },
        update: {
          status:        record.status.toUpperCase() as any,
          blockNumber:   record.blockNumber ?? null,
          slot:          record.slot ?? null,
          fee:           record.fee ?? null,
          errorMessage:  record.errorMessage ?? null,
          confirmedAt:   record.confirmedAt ? new Date(record.confirmedAt) : null,
        },
      });
      await prisma.$disconnect();
    } catch {
      
    }
  }

  
  async updateDbStatus(id: string): Promise<void> {
    const record = this.store.get(id);
    if (record && record.status !== 'pending') {
      await this.persistToDb(record).catch(() => {});
    }
  }
}


setInterval(() => TxTracker.getInstance().purgeOld(), 60 * 60 * 1000);
