import { Request, Response } from 'express';
import { ethers } from 'ethers';
import { POPULAR_TOKENS, type PopularToken } from '../data/popularTokens.js';
import { getPrisma } from '../db.js';



const MAINNET_RPCS = [
  process.env.CRONOS_MAINNET_RPC,
  'https://cronos-evm-rpc.publicnode.com',
  'https://cronos.blockpi.network/v1/rpc/public',
  'https://evm.cronos.org',
  'https://1rpc.io/cro',
].filter(Boolean) as string[];
const TESTNET_RPCS = [
  process.env.CRONOS_TESTNET_RPC,
  'https://cronos-testnet.drpc.org',                
  'https://evm-t3.cronos.org',
  'https://cronos-testnet.blockpi.network/v1/rpc/public',
  'https://cronos-testnet-rpc.publicnode.com',
  'https://rpc.ankr.com/cronos_testnet',
].filter(Boolean) as string[];

async function getWorkingProvider(chainId: number): Promise<ethers.JsonRpcProvider> {
  const rpcs = chainId === 25 ? MAINNET_RPCS : TESTNET_RPCS;
  let lastErr: Error = new Error('No RPC available');
  for (const rpc of rpcs) {
    const provider = new ethers.JsonRpcProvider(rpc);
    try {
      await Promise.race([
        provider.getBlockNumber(),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 8000)),
      ]);
      return provider;
    } catch (e: any) {
      lastErr = e;
    }
  }
  throw lastErr;
}



const ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
  'function getAmountsIn(uint amountOut, address[] calldata path) external view returns (uint[] memory amounts)',
];

const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
];

const PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function totalSupply() external view returns (uint)',
];

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
];



const ROUTERS: Record<number, { name: string; router: string; factory: string; wcro: string }> = {
  25: {
    name: 'VVS Finance',
    router: '0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae',
    factory: '0x3B44B2a187a7b3824131F8db5a74194D0a42Fc15',
    wcro: '0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23',
  },
  338: {
    name: 'UniswapV2 (Testnet)',
    router:  '0x9553aDCf3C6b55BEE12c3C46Da4D4F2Af4b5E0f',
    factory: '0xEC7b6c44BD2d38F39520c97b066D3da1Beb80614',
    wcro:    '0x6a3173618859C7cd40fAF6921b5E9eB6A76f1fD',
  },
};

const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'.toLowerCase();

function resolveTokenAddress(addr: string, config: { wcro: string }): string {
  return addr.toLowerCase() === NATIVE ? config.wcro : addr;
}


function buildSwapPath(tokenIn: string, tokenOut: string, wcro: string): string[] {
  const inAddr  = tokenIn.toLowerCase() === NATIVE ? wcro.toLowerCase() : tokenIn.toLowerCase();
  const outAddr = tokenOut.toLowerCase() === NATIVE ? wcro.toLowerCase() : tokenOut.toLowerCase();

  if (inAddr === outAddr) return [inAddr]; 

  
  if (inAddr === wcro.toLowerCase() || outAddr === wcro.toLowerCase()) return [inAddr, outAddr];

  
  return [inAddr, wcro.toLowerCase(), outAddr];
}




export const getQuote = async (req: Request, res: Response) => {
  const { tokenIn, tokenOut, amountIn, decimalsIn = '18', chainId = '25' } = req.query as Record<string, string>;
  const cid = parseInt(chainId, 10);

  if (!tokenIn || !tokenOut || !amountIn) {
    return res.status(400).json({ error: 'tokenIn, tokenOut, amountIn are required' });
  }

  const config = ROUTERS[cid] ?? ROUTERS[25];

  try {
    const provider = await getWorkingProvider(cid);
    const router = new ethers.Contract(config.router, ROUTER_ABI, provider);
    const amountInBn = ethers.parseUnits(amountIn, parseInt(decimalsIn, 10));
    const path = buildSwapPath(tokenIn, tokenOut, config.wcro);

    const amounts = await Promise.race([
      router.getAmountsOut(amountInBn, path) as Promise<bigint[]>,
      new Promise<never>((_, r) => setTimeout(() => r(new Error('RPC timeout')), 8000)),
    ]);

    return res.json({
      amountOut: amounts[amounts.length - 1].toString(),
      path,
      dex: config.name,
    });
  } catch (err: any) {
    const msg = err.message?.includes('INSUFFICIENT') ? 'Insufficient liquidity' : (err.message ?? 'Quote failed');
    return res.status(503).json({ error: msg });
  }
};


export const getPairInfo = async (req: Request, res: Response) => {
  const { tokenA, tokenB, chainId = '25' } = req.query as Record<string, string>;
  const cid = parseInt(chainId, 10);

  if (!tokenA || !tokenB) {
    return res.status(400).json({ error: 'tokenA, tokenB required' });
  }

  const config = ROUTERS[cid] ?? ROUTERS[25];

  try {
    const provider = await getWorkingProvider(cid);
    const factory = new ethers.Contract(config.factory, FACTORY_ABI, provider);
    const addrA = resolveTokenAddress(tokenA, config);
    const addrB = resolveTokenAddress(tokenB, config);

    const pairAddress = await Promise.race([
      factory.getPair(addrA, addrB) as Promise<string>,
      new Promise<never>((_, r) => setTimeout(() => r(new Error('RPC timeout')), 6000)),
    ]);

    if (pairAddress === ethers.ZeroAddress) {
      return res.json({ exists: false });
    }

    const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
    const [reserves, token0, totalSupply] = await Promise.all([
      pair.getReserves(),
      pair.token0(),
      pair.totalSupply(),
    ]);

    return res.json({
      exists: true,
      pairAddress,
      reserve0: reserves[0].toString(),
      reserve1: reserves[1].toString(),
      token0: (token0 as string).toLowerCase(),
      totalSupply: totalSupply.toString(),
      dex: config.name,
    });
  } catch (err: any) {
    return res.status(503).json({ error: err.message ?? 'Pair lookup failed' });
  }
};


export const getTokenInfo = async (req: Request, res: Response) => {
  const { address, chainId = '25' } = req.query as Record<string, string>;

  if (!address) {
    return res.status(400).json({ error: 'address required' });
  }

  let checksummed: string;
  try {
    checksummed = ethers.getAddress(address);
  } catch {
    return res.status(400).json({ error: 'Invalid contract address' });
  }

  const cid = parseInt(chainId, 10);

  try {
    const provider = await getWorkingProvider(cid);
    const token = new ethers.Contract(checksummed, ERC20_ABI, provider);

    const t = <T>(p: Promise<T>, fb: T): Promise<T> =>
      Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fb), 6000))]);

    const [name, symbol, decimals, totalSupply] = await Promise.all([
      t(token.name() as Promise<string>, 'Unknown'),
      t(token.symbol() as Promise<string>, '???'),
      t(token.decimals() as Promise<number>, 18),
      t(token.totalSupply() as Promise<bigint>, 0n),
    ]);

    
    let logoUrl: string | undefined;
    const networkSlug = cid === 25 ? 'cronos' : 'cronos-testnet';
    const trustWalletUrl = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${networkSlug}/assets/${checksummed}/logo.png`;

    try {
      const logoRes = await fetch(trustWalletUrl, { method: 'HEAD' });
      if (logoRes.ok) {
        logoUrl = trustWalletUrl;
      }
    } catch {
      
    }

    return res.json({
      address: checksummed,
      name,
      symbol,
      decimals: Number(decimals),
      totalSupply: totalSupply.toString(),
      chainId: cid,
      logoUrl,
    });
  } catch (err: any) {
    return res.status(503).json({ error: err.message ?? 'Token lookup failed' });
  }
};


export const searchTokens = async (req: Request, res: Response) => {
  const { q = '', chainId = '25' } = req.query as Record<string, string>;
  const cid = parseInt(chainId, 10);
  const query = q.trim().toLowerCase();

  
  if (query.length < 1) {
    return res.json([]);
  }

  const results: PopularToken[] = [];

  
  try {
    const prisma = await getPrisma();
    if (prisma) {
      const dbTokens = await prisma.token.findMany({
        where: {
          chainId: cid,
          OR: [
            { symbol: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
      });

      
      const mapped = dbTokens.map((t: any) => ({
        address: t.address || '',
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        chainId: t.chainId,
        isNative: t.address?.toLowerCase() === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        logoUrl: t.logoUrl || undefined,
      }));
      results.push(...mapped);
    }
  } catch (err) {
    console.warn('[searchTokens] DB query failed, using static list only:', err);
    
  }

  
  const already = new Set(results.map(r => r.address.toLowerCase()));
  const staticMatches = POPULAR_TOKENS.filter(
    (t) => t.chainId === cid &&
      !already.has(t.address.toLowerCase()) &&
      (t.symbol.toLowerCase().includes(query) || t.name.toLowerCase().includes(query))
  );
  results.push(...staticMatches);

  
  const unique = Array.from(new Map(results.map(t => [t.address.toLowerCase(), t])).values());

  
  return res.json(unique.slice(0, 20));
};
