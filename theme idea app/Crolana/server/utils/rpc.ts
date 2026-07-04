
import { ethers } from 'ethers';

export function getRpcUrl(chainId: number | string): string {
  const cid = Number(chainId);
  if (cid === 338) {
    return process.env.CRONOS_TESTNET_RPC ?? 'https://evm-t3.cronos.org';
  }
  return process.env.CRONOS_MAINNET_RPC ?? 'https://evm.cronos.org';
}

export function createProvider(chainId: number | string): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(getRpcUrl(chainId));
}
