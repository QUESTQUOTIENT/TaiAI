import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';

const router = Router();


const recordTransactionSchema = z.object({
  walletAddress: z.string().min(1),
  chainId: z.number().int(),
  txHash: z.string().min(1),
  type: z.enum(['swap', 'mint', 'deploy', 'liquidity_add', 'liquidity_remove', 'approval']),
  status: z.enum(['CONFIRMED', 'FAILED']).default('CONFIRMED'),
  blockNumber: z.number().int().optional(),
  
  metadata: z.record(z.any()).optional(),
  executedAt: z.date().optional().default(() => new Date()),
});


router.get('/', async (req, res) => {
  try {
    const { walletAddress, chainId, limit } = req.query;
    if (!walletAddress || typeof walletAddress !== 'string') {
      return res.status(400).json({ error: 'walletAddress is required' });
    }
    const chainFilter = chainId ? parseInt(chainId as string) : undefined;
    const limitVal = limit ? Math.min(parseInt(limit as string), 100) : 50;

    const where: any = {
      walletAddress: walletAddress.toLowerCase(),
    };
    if (chainFilter) {
      const chainMap: Record<number, 'CRONOS' | 'SOLANA'> = { 25: 'CRONOS', 338: 'CRONOS', 0: 'SOLANA' };
      where.chain = chainMap[chainFilter];
    }

    const records = await db.getTransactions(walletAddress, chainFilter, limitVal);
    return res.json({ transactions: records });
  } catch (error: any) {
    console.error('Failed to fetch transactions:', error);
    return res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});


router.post('/', async (req, res) => {
  try {
    const data = recordTransactionSchema.parse(req.body);
    const chainMap: Record<string, 'CRONOS' | 'SOLANA'> = { '25': 'CRONOS', '338': 'CRONOS', '0': 'SOLANA' };
    const chain = chainMap[data.chainId.toString()] || 'CRONOS';

    const record = await db.recordTransaction({
      walletAddress: data.walletAddress,
      chainId: data.chainId,
      txHash: data.txHash,
      type: data.type,
      status: data.status,
      blockNumber: data.blockNumber,
      metadata: data.metadata,
      executedAt: data.executedAt,
    });

    return res.status(200).json({ success: true, transaction: record });
  } catch (error: any) {
    console.error('Failed to record transaction:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    return res.status(500).json({ error: 'Failed to record transaction' });
  }
});

export default router;
