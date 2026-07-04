

import { Router, Request, Response } from 'express';

const router = Router();



const SOL_MAINNET_RPCS = [
  process.env.SOLANA_MAINNET_RPC,
  'https://rpc.ankr.com/solana',
  'https://solana-rpc.publicnode.com',
  'https://api.mainnet-beta.solana.com',
  'https://mainnet.helius-rpc.com/?api-key=public',
].filter(Boolean) as string[];

const SOL_DEVNET_RPCS = [
  process.env.SOLANA_DEVNET_RPC,
  'https://api.devnet.solana.com',
  'https://rpc.ankr.com/solana_devnet',
].filter(Boolean) as string[];

const RAYDIUM_V3 = 'https://api-v3.raydium.io';


const JUPITER_ENDPOINTS = [
  { base: 'https://quote-api.jup.ag',      prefix: '/v6' },
  { base: 'https://public.jupiterapi.com', prefix: '' },
] as const;



async function fetchT(url: string, opts: RequestInit = {}, ms = 12_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}


async function bodyText(r: Response): Promise<string> {
  try { return await r.clone().text(); } catch { return '(unreadable)'; }
}

async function jupiterFetch(path: string, opts: RequestInit = {}, ms = 15_000, retries = 2): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    for (const ep of JUPITER_ENDPOINTS) {
      const url = `${ep.base}${ep.prefix}${path}`;
      try {
        const r = await fetchT(url, opts, ms);
        if (r.status === 429) { console.warn(`[Jupiter] ${ep.base} rate-limited`); continue; }
        if (r.status >= 500)  { console.warn(`[Jupiter] ${ep.base} → ${r.status}`); continue; }
        return r;
      } catch (e) {
        lastErr = e;
        console.warn(`[Jupiter] ${ep.base} failed: ${(e as any).message}`);
      }
    }
    
    if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw lastErr ?? new Error('All Jupiter endpoints unavailable');
}


async function rpcFallback(rpcs: string[], body: unknown) {
  for (const rpc of rpcs) {
    try {
      const res = await fetchT(rpc, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify(body),
      }, 12_000);
      if (res.status >= 400 && res.status < 500) continue;
      if (!res.ok) continue;
      return { data: await res.json(), status: 200 };
    } catch {  }
  }
  return {
    data:   { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'All Solana RPC endpoints unavailable. Please retry.' } },
    status: 200,
  };
}



router.post('/rpc', async (req: Request, res: Response) => {
  const { data, status } = await rpcFallback(SOL_MAINNET_RPCS, req.body)
    .catch(() => ({ data: { jsonrpc:'2.0', id:1, error:{ code:-32000, message:'RPC proxy error' } }, status:200 }));
  res.status(status).json(data);
});

router.post('/rpc/devnet', async (req: Request, res: Response) => {
  const { data, status } = await rpcFallback(SOL_DEVNET_RPCS, req.body)
    .catch(() => ({ data: { jsonrpc:'2.0', id:1, error:{ code:-32000, message:'RPC proxy error' } }, status:200 }));
  res.status(status).json(data);
});



router.get('/jupiter/quote', async (req: Request, res: Response) => {
  try {
    const r = await jupiterFetch(`/quote?${new URLSearchParams(req.query as any)}`, { headers: { Accept: 'application/json' } });
    res.status(r.status).json(await r.json());
  } catch (e: any) {
    console.error('[Jupiter] /quote all endpoints failed:', e.message);
    res.status(502).json({ error: 'Jupiter quote temporarily unavailable. Please retry.' });
  }
});

router.post('/jupiter/swap', async (req: Request, res: Response) => {
  try {
    const r = await jupiterFetch('/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req.body),
    }, 25_000);
    res.status(r.status).json(await r.json());
  } catch (e: any) {
    console.error('[Jupiter] /swap all endpoints failed:', e.message);
    res.status(502).json({ error: 'Jupiter swap failed. Please retry.' });
  }
});

router.get('/jupiter/price', async (req: Request, res: Response) => {
  try {
    const r = await fetchT(`https://price.jup.ag/v4/price?${new URLSearchParams(req.query as any)}`, { headers: { Accept: 'application/json' } }, 8_000);
    res.status(r.status).json(await r.json());
  } catch (e: any) { res.status(502).json({ error: e.message }); }
});



const TOP_POOL_IDS = [
  '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWaS3AFAaGMXq',
  'AVs9TA4nWDzfPJE9gGVNJMVhcQy3V9PGazuz33BfG2RA',
  '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',
  'DVa7Qmb5ct9RCpaU7UTpSaf3GVMYz17vNVU67al68o9',
  'H5uzEytiByuCqn8n3QMxi9ham6JhM2m7ePByvBFvXmhH',
  'DwFDy8jAYNKMJ5qFSTEyBwqXMJzBPmGJxN5FZN8fbGZ8',
  'FbC6K13MkQkQzZT6LipMrPQEqQEyPKGub4zAzMCqGCEF',
  'B7LjpJXMfkjUPxShh7SZ8W6U1gfD9cqfJMNQoNVpGjVH',
].join(',');

const CURATED_POOLS = [
  { id:'58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWaS3AFAaGMXq', baseMint:'So11111111111111111111111111111111111111112', quoteMint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', baseSymbol:'SOL',  quoteSymbol:'USDC', lpMint:'8HoQnePLqPj4M7PUDzfw8e3Ymdwgc7NLGnaTUapubyvu', baseReserve:500000, quoteReserve:90000000, lpSupply:1000000, price:180, volume24h:25000000, fee24h:75000, apr24h:45, tvl:90000000, programId:'675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', type:'standard' },
  { id:'AVs9TA4nWDzfPJE9gGVNJMVhcQy3V9PGazuz33BfG2RA',  baseMint:'So11111111111111111111111111111111111111112', quoteMint:'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', baseSymbol:'SOL',  quoteSymbol:'USDT', lpMint:'BmFbRX63yeUznRp7ZAkbJcHDy5q5LLMkMiRaU5jRYCQM', baseReserve:300000, quoteReserve:54000000, lpSupply:500000, price:180, volume24h:12000000, fee24h:36000, apr24h:32, tvl:54000000, programId:'675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', type:'standard' },
  { id:'6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg',  baseMint:'4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', quoteMint:'So11111111111111111111111111111111111111112', baseSymbol:'RAY',  quoteSymbol:'SOL',  lpMint:'RmEtFdAQkMJQ8JB2FsxBaneFLAsmG2bJJR3s2sMSCJM', baseReserve:5000000, quoteReserve:50000, lpSupply:200000, price:2.0, volume24h:4000000, fee24h:12000, apr24h:28, tvl:9000000, programId:'675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', type:'standard' },
  { id:'H5uzEytiByuCqn8n3QMxi9ham6JhM2m7ePByvBFvXmhH',  baseMint:'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', quoteMint:'So11111111111111111111111111111111111111112', baseSymbol:'JUP',  quoteSymbol:'SOL',  lpMint:'', baseReserve:10000000, quoteReserve:40000, lpSupply:300000, price:0.72, volume24h:8000000, fee24h:24000, apr24h:52, tvl:7200000, programId:'675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', type:'standard' },
  { id:'DwFDy8jAYNKMJ5qFSTEyBwqXMJzBPmGJxN5FZN8fbGZ8',  baseMint:'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', quoteMint:'So11111111111111111111111111111111111111112', baseSymbol:'mSOL', quoteSymbol:'SOL',  lpMint:'', baseReserve:400000, quoteReserve:420000, lpSupply:400000, price:1.04, volume24h:2000000, fee24h:6000, apr24h:18, tvl:75600000, programId:'675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', type:'standard' },
  { id:'FbC6K13MkQkQzZT6LipMrPQEqQEyPKGub4zAzMCqGCEF',  baseMint:'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', quoteMint:'So11111111111111111111111111111111111111112', baseSymbol:'BONK', quoteSymbol:'SOL',  lpMint:'', baseReserve:500000000000, quoteReserve:12000, lpSupply:100000, price:0.000024, volume24h:5000000, fee24h:15000, apr24h:61, tvl:5760000, programId:'675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', type:'standard' },
];

let poolCacheData: any[] | null = null;
let poolCacheTime = 0;
let poolFetchPromise: Promise<any[]> | null = null;
const CACHE_TTL = 10 * 60 * 1000;

function normaliseV3Pool(p: any): any | null {
  if (p == null || typeof p !== 'object') return null;
  return {
    id:           p.id ?? '',
    baseMint:     p.mintA?.address  ?? p.baseMint    ?? '',
    quoteMint:    p.mintB?.address  ?? p.quoteMint   ?? '',
    baseSymbol:   p.mintA?.symbol   ?? p.baseSymbol  ?? '?',
    quoteSymbol:  p.mintB?.symbol   ?? p.quoteSymbol ?? '?',
    lpMint:       p.lpMint?.address ?? p.lpMint      ?? '',
    baseReserve:  parseFloat(p.mintAmountA  ?? p.baseReserve   ?? '0'),
    quoteReserve: parseFloat(p.mintAmountB  ?? p.quoteReserve  ?? '0'),
    lpSupply:     parseFloat(p.lpAmount     ?? p.lpSupply      ?? '0'),
    price:        parseFloat(p.price ?? '0'),
    volume24h:    parseFloat(p.day?.volume    ?? p.volume24h ?? '0'),
    fee24h:       parseFloat(p.day?.volumeFee ?? p.fee24h    ?? '0'),
    apr24h:       p.day?.apr != null ? parseFloat(p.day.apr) * 100 : parseFloat(p.apr ?? '0'),
    tvl:          parseFloat(p.tvl ?? p.liquidityUsd ?? '0'),
    programId:    p.programId ?? '',
    type:         p.config?.tickSpacing ? 'concentrated' : 'standard',
    
    keys: p.keys ?? null,
  };
}

async function doFetchPools(): Promise<any[]> {
  try {
    const res = await fetchT(`${RAYDIUM_V3}/pools/info/ids?ids=${TOP_POOL_IDS}`, { headers: { Accept: 'application/json' } }, 10_000);
    if (res.ok) {
      const json = await res.json();
      const pools: any[] = json?.data ?? (Array.isArray(json) ? json : []);
      const normalised = pools.map(normaliseV3Pool).filter((p): p is NonNullable<typeof p> => p != null && !!p.id);
      if (normalised.length >= 3) return normalised;
    } else { console.warn(`[Raydium] /ids → ${res.status}`); }
  } catch (e: any) { console.warn('[Raydium] /ids failed:', e.message); }

  try {
    const qs = new URLSearchParams({ poolType: 'standard', poolSortField: 'tvl', sortType: 'desc', pageSize: '20', page: '1' });
    const res = await fetchT(`${RAYDIUM_V3}/pools/info/list?${qs}`, { headers: { Accept: 'application/json' } }, 10_000);
    if (res.ok) {
      const json = await res.json();
      const pools: any[] = json?.data?.data ?? json?.data ?? (Array.isArray(json) ? json : []);
      const normalised = pools.map(normaliseV3Pool).filter((p): p is NonNullable<typeof p> => p != null && !!p.id && p.tvl > 0);
      if (normalised.length >= 3) return normalised;
    }
  } catch (e: any) { console.warn('[Raydium] /list failed:', e.message); }

  return CURATED_POOLS as any[];
}

async function getPools(): Promise<any[]> {
  if (poolCacheData && Date.now() - poolCacheTime < CACHE_TTL) return poolCacheData;
  if (!poolFetchPromise) {
    poolFetchPromise = doFetchPools().then(p => {
      poolCacheData = p; poolCacheTime = Date.now(); poolFetchPromise = null; return p;
    }).catch(err => { poolFetchPromise = null; throw err; });
  }
  return poolFetchPromise;
}

router.get('/raydium/pools', async (_req: Request, res: Response) => {
  try { res.json({ success: true, data: { data: await getPools() } }); }
  catch { res.json({ success: true, data: { data: CURATED_POOLS } }); }
});

router.get('/raydium/positions', async (req: Request, res: Response) => {
  const wallet = req.query.wallet as string;
  if (!wallet) return res.json({ data: [] });
  try {
    const r = await fetchT(`${RAYDIUM_V3}/main/portfolio/positions?wallet=${wallet}`, { headers: { Accept: 'application/json' } }, 12_000);
    if (r.ok) return res.json(await r.json());
  } catch {}
  res.json({ data: [] });
});

















router.post('/raydium/add', async (req: Request, res: Response) => {
  const { poolId, wallet, baseAmount, quoteAmount, slippage = 0.005 } = req.body ?? {};

  if (!poolId || !wallet || !baseAmount || !quoteAmount) {
    return res.status(400).json({ error: 'Missing required fields: poolId, wallet, baseAmount, quoteAmount' });
  }

  
  const body = {
    poolId,
    wallet,
    inputAmountA:                  String(baseAmount),
    inputAmountB:                  String(quoteAmount),
    fixedSide:                     'a',
    slippage:                      Number(slippage),
    computeUnitPriceMicroLamports: '100000',
    txVersion:                     'V0',
  };

  const endpoints = [
    `${RAYDIUM_V3}/transaction/add-liquidity`,
    `${RAYDIUM_V3}/transaction/add-pool-liquidity`,
  ];

  for (const url of endpoints) {
    try {
      const r = await fetchT(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify(body),
      }, 20_000);

      const rawBody = await bodyText(r);
      console.log(`[Raydium] add via ${url} → HTTP ${r.status}: ${rawBody.slice(0, 300)}`);

      if (r.ok) {
        try { return res.json(JSON.parse(rawBody)); }
        catch { return res.json({ data: [rawBody] }); }
      }
      
    } catch (e: any) {
      console.warn(`[Raydium] add via ${url} network error: ${e.message}`);
    }
  }

  
  console.error(`[Raydium] add-liquidity: all endpoints failed for pool ${poolId}`);
  return res.status(502).json({
    error:    'Raydium liquidity API is currently unavailable.',
    fallback: `https://raydium.io/liquidity/increase/?mode=add&pool_id=${poolId}`,
  });
});

router.post('/raydium/remove', async (req: Request, res: Response) => {
  const { poolId, wallet, lpAmount } = req.body ?? {};

  if (!poolId || !wallet || !lpAmount) {
    return res.status(400).json({ error: 'Missing required fields: poolId, wallet, lpAmount' });
  }

  const body = {
    poolId,
    wallet,
    lpAmount:                      String(lpAmount),
    computeUnitPriceMicroLamports: '100000',
    txVersion:                     'V0',
  };

  const endpoints = [
    `${RAYDIUM_V3}/transaction/remove-liquidity`,
    `${RAYDIUM_V3}/transaction/remove-pool-liquidity`,
  ];

  for (const url of endpoints) {
    try {
      const r = await fetchT(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify(body),
      }, 20_000);

      const rawBody = await bodyText(r);
      console.log(`[Raydium] remove via ${url} → HTTP ${r.status}: ${rawBody.slice(0, 300)}`);

      if (r.ok) {
        try { return res.json(JSON.parse(rawBody)); }
        catch { return res.json({ data: [rawBody] }); }
      }
    } catch (e: any) {
      console.warn(`[Raydium] remove via ${url} network error: ${e.message}`);
    }
  }

  console.error(`[Raydium] remove-liquidity: all endpoints failed for pool ${poolId}`);
  return res.status(502).json({
    error:    'Raydium liquidity API is currently unavailable.',
    fallback: `https://raydium.io/liquidity/increase/?mode=remove&pool_id=${poolId}`,
  });
});

export default router;
