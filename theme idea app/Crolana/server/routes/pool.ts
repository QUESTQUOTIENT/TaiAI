

import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import {
  getServerPoolInfo,
  getServerLiquidityPosition,
} from '../services/engines/liquidityEngineAdapter.js';

const router = Router();



const poolInfoCache = new Map<string, { data: object; ts: number }>();
const POOL_CACHE_TTL = 30_000; 

router.get('/info', async (req: Request, res: Response) => {
  const { tokenA, tokenB, chainId = '25' } = req.query as Record<string, string>;

  if (!tokenA || !tokenB) {
    return res.status(400).json({ error: 'tokenA and tokenB are required' });
  }

  const cid = parseInt(chainId, 10);
  const cacheKey = `${cid}:${tokenA.toLowerCase()}:${tokenB.toLowerCase()}`;

  
  const cached = poolInfoCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < POOL_CACHE_TTL) {
    res.set('X-Cache', 'HIT');
    return res.json(cached.data);
  }

  try {
    const info = await getServerPoolInfo(tokenA, tokenB, cid);

    const result = {
      exists:       info.exists,
      pairAddress:  info.exists ? info.pairAddress : null,
      token0:       info.token0,
      token1:       info.token1,
      reserve0:     info.reserve0.toString(),
      reserve1:     info.reserve1.toString(),
      totalSupply:  info.totalSupply.toString(),
      chainId:      cid,
    };

    poolInfoCache.set(cacheKey, { data: result, ts: Date.now() });
    res.set('X-Cache', 'MISS');
    res.json(result);
  } catch (err: any) {
    res.status(503).json({ error: err.message ?? 'Pool info lookup failed' });
  }
});


router.get('/position', async (req: Request, res: Response) => {
  const { pair, wallet, chainId = '25' } = req.query as Record<string, string>;

  if (!pair || !wallet) {
    return res.status(400).json({ error: 'pair and wallet are required' });
  }

  if (!ethers.isAddress(pair))   return res.status(400).json({ error: 'Invalid pair address' });
  if (!ethers.isAddress(wallet)) return res.status(400).json({ error: 'Invalid wallet address' });

  const cid = parseInt(chainId, 10);

  try {
    const position = await getServerLiquidityPosition(pair, wallet, cid);

    if (!position) {
      return res.json({ lpBalance: '0', share: 0, token0Amount: '0', token1Amount: '0' });
    }

    res.json({
      pairAddress:  position.pairAddress,
      lpBalance:    position.lpBalance.toString(),
      share:        position.share,
      sharePercent: (position.share * 100).toFixed(4),
      token0Amount: position.token0Amount.toString(),
      token1Amount: position.token1Amount.toString(),
    });
  } catch (err: any) {
    res.status(503).json({ error: err.message ?? 'Position lookup failed' });
  }
});

export default router;
