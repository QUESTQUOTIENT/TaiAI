

import { ethers } from 'ethers';

export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcs: string[];
  wsRpc?: string;
  symbol: string;
  explorerUrl: string;
  isTestnet: boolean;
}

export const NETWORKS: Record<number, NetworkConfig> = {
  25: {
    chainId: 25,
    name: 'Cronos Mainnet',
    rpcs: [
      process.env.CRONOS_MAINNET_RPC ?? 'https://evm.cronos.org',
      'https://cronos-evm-rpc.publicnode.com',
      'https://rpc.vvs.finance',
    ],
    wsRpc: process.env.CRONOS_WS_MAINNET ?? 'wss://ws.cronos.org',
    symbol: 'CRO',
    explorerUrl: 'https://explorer.cronos.org',
    isTestnet: false,
  },
  338: {
    chainId: 338,
    name: 'Cronos Testnet',
    rpcs: [process.env.CRONOS_TESTNET_RPC ?? 'https://evm-t3.cronos.org'],
    wsRpc: process.env.CRONOS_WS_TESTNET,
    symbol: 'TCRO',
    explorerUrl: 'https://explorer.cronos.org/testnet',
    isTestnet: true,
  },
};

export function getNetwork(chainId: number | string): NetworkConfig {
  const cid = Number(chainId);
  const net = NETWORKS[cid];
  if (!net) throw new Error('Unsupported chainId: ' + chainId);
  return net;
}

const providerCache = new Map<string, ethers.JsonRpcProvider>();

function getCachedProvider(rpcUrl: string): ethers.JsonRpcProvider {
  if (!providerCache.has(rpcUrl)) {
    providerCache.set(rpcUrl, new ethers.JsonRpcProvider(rpcUrl));
  }
  return providerCache.get(rpcUrl)!;
}

async function testProvider(provider: ethers.JsonRpcProvider): Promise<boolean> {
  try {
    await Promise.race([
      provider.getBlockNumber(),
      new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 6000)),
    ]);
    return true;
  } catch { return false; }
}

export async function getProvider(chainId: number | string): Promise<ethers.JsonRpcProvider> {
  const network = getNetwork(chainId);
  for (const rpc of network.rpcs) {
    const provider = getCachedProvider(rpc);
    if (await testProvider(provider)) return provider;
  }
  providerCache.clear();
  for (const rpc of network.rpcs) {
    const provider = getCachedProvider(rpc);
    try { await provider.getBlockNumber(); return provider; } catch {  }
  }
  throw new Error('All RPC endpoints unavailable for chainId ' + chainId);
}

export async function getWebSocketProvider(chainId: number | string): Promise<ethers.WebSocketProvider | null> {
  const network = getNetwork(chainId);
  if (!network.wsRpc) return null;
  try {
    const ws = new ethers.WebSocketProvider(network.wsRpc);
    await Promise.race([ws.getBlockNumber(), new Promise<never>((_, r) => setTimeout(() => r(new Error('ws timeout')), 8000))]);
    return ws;
  } catch { return null; }
}

export async function getGasData(chainId: number | string): Promise<{ gasPrice: bigint; maxFeePerGas: bigint | null; maxPriorityFeePerGas: bigint | null }> {
  const provider = await getProvider(chainId);
  const feeData = await provider.getFeeData();
  return {
    gasPrice: feeData.gasPrice ?? ethers.parseUnits('5000', 'gwei'),
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
  };
}

export function getExplorerUrl(chainId: number | string, hashOrAddress: string, type: 'tx' | 'address' = 'tx'): string {
  const network = getNetwork(chainId);
  return network.explorerUrl + '/' + type + '/' + hashOrAddress;
}
