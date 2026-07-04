

import { Router, Request, Response } from 'express';
import { networkManager } from '../blockchain/networkManager.js';

const router = Router();




const READ_METHOD_TTLS: Record<string, number> = {
  eth_chainId: 60000,           
  eth_blockNumber: 5000,        
  eth_getBalance: 10000,        
  eth_getTransactionCount: 10000, 
  eth_getTransactionReceipt: 60000, 
  eth_call: 5000,               
  eth_estimateGas: 5000,        
  eth_gasPrice: 5000,           
  eth_maxPriorityFeePerGas: 10000, 
  eth_feeHistory: 10000,        
  eth_getBlockByNumber: 5000,   
  eth_getBlockByHash: 5000,     
  eth_getCode: 10000,           
  eth_getStorageAt: 10000,      
  eth_syncing: 10000,           
  net_version: 60000,           
};

const DEFAULT_TTL = 5000;

type CacheEntry = {
  expiresAt: number;
  data: any;
  status: number;
};

const rpcCache = new Map<string, CacheEntry>();

function getCacheKey(method: string, params: any[]): string {
  
  
  return `${method}::${JSON.stringify(params)}`;
}

function getTtl(method: string): number {
  return READ_METHOD_TTLS[method] ?? DEFAULT_TTL;
}


let cleanupStarted = false;
function startCacheCleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rpcCache.entries()) {
      if (now >= entry.expiresAt) {
        rpcCache.delete(key);
      }
    }
  }, 60_000).unref?.();
}
startCacheCleanup();





const MAINNET_RPCS = [
  process.env.CRONOS_MAINNET_RPC,          
  'https://evm.cronos.org',
  'https://cronos.blockpi.network/v1/rpc/public',
  'https://1rpc.io/cro',
  'https://cronos-evm-rpc.publicnode.com',
  'https://rpc.ankr.com/cronos',
].filter(Boolean) as string[];

const TESTNET_RPCS = [
  process.env.CRONOS_TESTNET_RPC,                                    
  'https://cronos-testnet.drpc.org',                                 
  'https://evm-t3.cronos.org',                                       
  'https://cronos-testnet.blockpi.network/v1/rpc/public',            
  'https://cronos-testnet-rpc.publicnode.com',                       
  'https://rpc.ankr.com/cronos_testnet',                             
].filter(Boolean) as string[];

function getEndpoints(chainId: string): string[] {
  return chainId === '338' ? TESTNET_RPCS : MAINNET_RPCS;
}



const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; Crolana/1.0; +https://crolana.app)',
  'Origin': 'https://app.ebisusbay.com',   
  'Referer': 'https://app.ebisusbay.com/',
});


async function proxyRpc(
  endpoints: string[],
  body: unknown,
  timeoutMs = 15_000,
): Promise<{ data: unknown; status: number }> {
  
  const reqId = (body as any)?.id ?? null;
  const method = (body as any)?.method;
  if (method && READ_METHOD_TTLS[method] !== undefined) {
    const cacheKey = getCacheKey(method, (body as any)?.params || []);
    const cached = rpcCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return { data: cached.data, status: cached.status };
    }
  }

  let lastErr = 'All endpoints failed';

  for (const url of endpoints) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        
        if (method && READ_METHOD_TTLS[method] !== undefined) {
          const ttl = getTtl(method);
          const expiresAt = Date.now() + ttl;
          const cacheKey = getCacheKey(method, (body as any)?.params || []);
          rpcCache.set(cacheKey, { expiresAt, data, status: 200 });
        }
        return { data, status: 200 };
      }

      lastErr = `${url} → HTTP ${res.status}`;
      
      if (res.status === 400) break;
      
      continue;
    } catch (err: any) {
      clearTimeout(timer);
      lastErr = err.name === 'AbortError'
        ? `${url} timed out after ${timeoutMs}ms`
        : `${url} error: ${err.message}`;
    }
  }

  
  return {
    status: 502,
    data: {
      jsonrpc: (body as any)?.jsonrpc ?? '2.0',
      id: reqId,
      error: { code: -32603, message: lastErr },
    },
  };
}




router.post('/:chainId', async (req: Request, res: Response) => {
  const { chainId } = req.params;
  const endpoints = getEndpoints(chainId ?? '25');
  
  const timeout = chainId === '338' ? 20_000 : 15_000;
  const { data, status } = await proxyRpc(endpoints, req.body, timeout);
  return res.status(status).json(data);
});


router.get('/:chainId', async (req: Request, res: Response) => {
  const { chainId } = req.params;
  const endpoints = getEndpoints(chainId ?? '25');
  const { data, status } = await proxyRpc(endpoints, {
    jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [],
  });
  return res.status(status).json(data);
});

export default router;
