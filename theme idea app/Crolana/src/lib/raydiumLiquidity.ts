

const RAYDIUM_PROXY = '/api/solana/raydium';
const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';



export interface RaydiumPool {
  id: string;
  baseMint: string;
  quoteMint: string;
  baseSymbol: string;
  quoteSymbol: string;
  lpMint: string;
  baseReserve: number;
  quoteReserve: number;
  lpSupply: number;
  price: number;
  volume24h: number;
  fee24h: number;
  apr24h: number;
  tvl: number;
  programId: string;
  type: 'standard' | 'concentrated';
}

export interface RaydiumUserPosition {
  poolId: string;
  lpBalance: number;
  lpMint: string;
  baseAmount: number;
  quoteAmount: number;
  sharePercent: number;
}



function normalisePool(p: any): RaydiumPool {
  const isClmm = !!p.config?.tickSpacing;
  
  
  return {
    id:           p.id ?? p.ammId ?? '',
    baseMint:     p.mintA?.address ?? p.baseMint ?? '',
    quoteMint:    p.mintB?.address ?? p.quoteMint ?? '',
    baseSymbol:   p.mintA?.symbol  ?? p.baseSymbol ?? '?',
    quoteSymbol:  p.mintB?.symbol  ?? p.quoteSymbol ?? '?',
    lpMint:       p.lpMint?.address ?? p.lpMint ?? '',
    baseReserve:  parseFloat(p.mintAmountA ?? p.baseReserve ?? '0'),
    quoteReserve: parseFloat(p.mintAmountB ?? p.quoteReserve ?? '0'),
    lpSupply:     parseFloat(p.lpAmount    ?? p.lpSupply ?? '0'),
    price:        parseFloat(p.price ?? '0'),
    volume24h:    parseFloat(p.day?.volume  ?? p.volume24h ?? p['24hVolume'] ?? '0'),
    fee24h:       parseFloat(p.day?.volumeFee ?? p.fee24h ?? '0'),
    
    apr24h:       p.day?.apr != null
                    ? parseFloat(p.day.apr) * 100
                    : parseFloat(p.apr ?? '0'),
    tvl:          parseFloat(p.tvl ?? p.liquidityUsd ?? '0'),
    programId:    p.programId ?? '',
    type: isClmm ? 'concentrated' : 'standard',
  };
}



export async function getRaydiumPools(options?: {
  baseMint?: string;
  quoteMint?: string;
  limit?: number;
}): Promise<RaydiumPool[]> {
  try {
    const params: Record<string, string> = {
      poolType:      'all',
      poolSortField: 'tvl',
      sortType:      'desc',
      pageSize:      String(Math.min(options?.limit ?? 50, 100)),
      page:          '1',
    };
    if (options?.baseMint)  params.mint1 = options.baseMint;
    if (options?.quoteMint) params.mint2 = options.quoteMint;

    const qs  = new URLSearchParams(params);
    const res = await fetch(`${RAYDIUM_PROXY}/pools?${qs}`, {
      signal: AbortSignal.timeout(15_000), 
    });

    if (!res.ok) return [];
    const json = await res.json();

    
    
    let pools: any[] = [];
    if (Array.isArray(json?.data?.data)) {
      pools = json.data.data;
    } else if (Array.isArray(json?.data)) {
      pools = json.data;
    } else if (Array.isArray(json)) {
      pools = json;
    }

    return pools
      .map(normalisePool)
      .filter(p => p.id && p.tvl > 0);
  } catch (err) {
    console.warn('[Raydium] Pool fetch failed:', err);
    return [];
  }
}

export async function findRaydiumPool(
  mintA: string,
  mintB: string,
): Promise<RaydiumPool | null> {
  const pools = await getRaydiumPools({ baseMint: mintA, quoteMint: mintB, limit: 20 });
  return pools.find(p =>
    (p.baseMint.toLowerCase() === mintA.toLowerCase() && p.quoteMint.toLowerCase() === mintB.toLowerCase()) ||
    (p.baseMint.toLowerCase() === mintB.toLowerCase() && p.quoteMint.toLowerCase() === mintA.toLowerCase()),
  ) ?? null;
}

export async function getTopRaydiumPools(limit = 20): Promise<RaydiumPool[]> {
  const pools = await getRaydiumPools({ limit: Math.min(limit * 3, 100) });
  return pools
    .filter(p => p.tvl > 1_000)
    .sort((a, b) => b.tvl - a.tvl)
    .slice(0, limit);
}



export async function getUserLpPositions(
  walletAddress: string,
  cluster = 'mainnet-beta',
): Promise<RaydiumUserPosition[]> {
  if (cluster !== 'mainnet-beta') return [];

  try {
    const res = await fetch(
      `${RAYDIUM_PROXY}/positions?wallet=${walletAddress}`,
      { signal: AbortSignal.timeout(12_000) },
    );
    if (!res.ok) return [];
    const json = await res.json();
    const items: any[] = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);

    return items.map(item => ({
      poolId:       item.poolId ?? item.ammId ?? '',
      lpBalance:    parseFloat(item.lpAmount ?? item.lpBalance ?? '0'),
      lpMint:       item.lpMint ?? '',
      baseAmount:   parseFloat(item.amountA ?? item.baseAmount ?? '0'),
      quoteAmount:  parseFloat(item.amountB ?? item.quoteAmount ?? '0'),
      sharePercent: parseFloat(item.sharePercent ?? item.share ?? '0'),
    }));
  } catch {
    return [];
  }
}



export async function addRaydiumLiquidity(params: {
  poolId: string;
  walletAddress: string;
  baseAmount: string;
  quoteAmount: string;
  slippagePct?: number;
  cluster?: string;
}): Promise<string> {
  const { poolId, walletAddress, baseAmount, quoteAmount, slippagePct = 0.5, cluster = 'mainnet-beta' } = params;

  if (!window.solana?.isPhantom) throw new Error('Phantom wallet not found.');
  if (cluster !== 'mainnet-beta') {
    throw new Error('Raydium liquidity is only available on Solana Mainnet.');
  }

  const res = await fetch(`${RAYDIUM_PROXY}/add`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      poolId,
      wallet:      walletAddress,
      baseAmount,
      quoteAmount,
      slippage: slippagePct / 100,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const json = await res.json().catch(() => ({})) as any;

  if (!res.ok) {
    const msg = json?.msg ?? json?.message ?? json?.error ?? `Raydium error ${res.status}`;
    
    const fallbackUrl: string | undefined = json?.fallback;
    const err = new Error(fallbackUrl
      ? `${msg}\n\nYou can complete this action directly on Raydium:\n${fallbackUrl}`
      : msg
    ) as any;
    err.fallbackUrl = fallbackUrl;
    throw err;
  }

  const txList: any[] = Array.isArray(json?.data)
    ? json.data
    : (json?.transaction ? [{ transaction: json.transaction }] : []);

  if (!txList.length) throw new Error('Raydium returned no transaction to sign.');

  const web3 = await import('@solana/web3.js');
  
  const rpcProxy = `${window.location.origin}/api/solana/rpc`;
  
  const connection = new web3.Connection(rpcProxy, {
    commitment: 'confirmed',
    wsEndpoint: 'wss://api.mainnet-beta.solana.com',
    disableRetryOnRateLimit: false,
  });
  let lastSig = '';

  for (const txItem of txList) {
    const txBase64 = typeof txItem === 'string' ? txItem : (txItem.transaction ?? txItem.id);
    const txBuf  = Buffer.from(txBase64, 'base64');
    const tx     = web3.VersionedTransaction.deserialize(txBuf);
    
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.message.recentBlockhash = blockhash;
    const { signature } = await window.solana.signAndSendTransaction(tx);
    
    let confirmed = false;
    const deadline = Date.now() + 90_000;
    while (!confirmed && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 1500));
      const { value } = await connection.getSignatureStatus(signature, { searchTransactionHistory: false });
      if (value?.confirmationStatus === 'confirmed' || value?.confirmationStatus === 'finalized') confirmed = true;
      if (value?.err) throw new Error('Transaction failed: ' + JSON.stringify(value.err));
    }
    if (!confirmed) throw new Error('Raydium tx confirmation timed out');
    lastSig = signature;
  }

  return lastSig;
}



export async function removeRaydiumLiquidity(params: {
  poolId: string;
  walletAddress: string;
  lpAmount: string;
  cluster?: string;
}): Promise<string> {
  const { poolId, walletAddress, lpAmount, cluster = 'mainnet-beta' } = params;

  if (!window.solana?.isPhantom) throw new Error('Phantom wallet not found.');
  if (cluster !== 'mainnet-beta') throw new Error('Raydium liquidity is only available on Solana Mainnet.');

  const res = await fetch(`${RAYDIUM_PROXY}/remove`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ poolId, wallet: walletAddress, lpAmount }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(err?.msg ?? err?.message ?? err?.error ?? `Raydium error ${res.status}`);
  }

  const json = await res.json();
  const txList: any[] = Array.isArray(json?.data)
    ? json.data
    : (json?.transaction ? [{ transaction: json.transaction }] : []);

  if (!txList.length) throw new Error('Raydium returned no transaction to sign.');

  const web3 = await import('@solana/web3.js');
  const rpcProxy = `${window.location.origin}/api/solana/rpc`;
  
  const connection = new web3.Connection(rpcProxy, {
    commitment: 'confirmed',
    wsEndpoint: 'wss://api.mainnet-beta.solana.com',
    disableRetryOnRateLimit: false,
  });
  let lastSig = '';

  for (const txItem of txList) {
    const txBase64 = typeof txItem === 'string' ? txItem : (txItem.transaction ?? txItem.id);
    const txBuf  = Buffer.from(txBase64, 'base64');
    const tx     = web3.VersionedTransaction.deserialize(txBuf);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.message.recentBlockhash = blockhash;
    const { signature } = await window.solana.signAndSendTransaction(tx);
    
    let confirmed = false;
    const deadline = Date.now() + 90_000;
    while (!confirmed && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 1500));
      const { value } = await connection.getSignatureStatus(signature, { searchTransactionHistory: false });
      if (value?.confirmationStatus === 'confirmed' || value?.confirmationStatus === 'finalized') confirmed = true;
      if (value?.err) throw new Error('Transaction failed: ' + JSON.stringify(value.err));
    }
    if (!confirmed) throw new Error('Raydium tx confirmation timed out');
    lastSig = signature;
  }

  return lastSig;
}

export function formatPoolTvl(tvl: number): string {
  if (tvl >= 1_000_000) return `$${(tvl / 1_000_000).toFixed(2)}M`;
  if (tvl >= 1_000)     return `$${(tvl / 1_000).toFixed(1)}K`;
  return `$${tvl.toFixed(0)}`;
}
