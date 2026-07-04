

import {
  getPoolInfo,
  getLiquidityPosition,
  isNative,
  type PoolInfo,
  type LiquidityPosition,
} from '../../../packages/liquidity-engine/dist/index.js';
import { ethers } from 'ethers';

const MAINNET_RPCS = [
  process.env.CRONOS_MAINNET_RPC,
  'https://evm.cronos.org',
  'https://cronos-evm-rpc.publicnode.com',
  'https://cronos.blockpi.network/v1/rpc/public',
  'https://rpc.ankr.com/cronos',
  'https://1rpc.io/cro',
].filter(Boolean) as string[];

async function getProvider(chainId: number): Promise<ethers.JsonRpcProvider> {
  const rpcs = chainId === 25 ? MAINNET_RPCS : [process.env.CRONOS_TESTNET_RPC ?? 'https://evm-t3.cronos.org'];
  for (const rpc of rpcs) {
    const p = new ethers.JsonRpcProvider(rpc);
    try {
      await Promise.race([p.getBlockNumber(), new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 8000))]);
      return p;
    } catch {  }
  }
  throw new Error('All Cronos RPC endpoints unavailable');
}

const DEX_FACTORY: Record<number, { factory: string; wcro: string }> = {
  25:  { factory: '0x3B44B2a187a7b3824131F8db5a74194D0a42Fc15', wcro: '0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23' },
  338: { factory: '0x9553aDCf3C6b55BEE12c3C46Da4D4F2Af4b5E0f', wcro: '0x6a3173618859C7cd40fAF6921b5E9eB6A76f1fD' },
};


export async function getServerPoolInfo(
  tokenA: string,
  tokenB: string,
  chainId: number,
): Promise<PoolInfo> {
  const config = DEX_FACTORY[chainId] ?? DEX_FACTORY[25];
  const provider = await getProvider(chainId);
  return getPoolInfo(provider, config.factory, tokenA, tokenB, config.wcro);
}


export async function getServerLiquidityPosition(
  pairAddress: string,
  walletAddress: string,
  chainId: number,
): Promise<LiquidityPosition | null> {
  if (!ethers.isAddress(pairAddress)) throw new Error('Invalid pair address');
  if (!ethers.isAddress(walletAddress)) throw new Error('Invalid wallet address');

  const provider = await getProvider(chainId);
  try {
    return await getLiquidityPosition(provider, pairAddress, walletAddress);
  } catch {
    return null;
  }
}
