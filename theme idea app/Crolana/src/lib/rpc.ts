

import { ethers } from 'ethers';


export function getRpcProxyUrl(chainId: number): string {
  const origin = typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:3000';
  return `${origin}/api/rpc/${chainId}`;
}




export function createProxyProvider(chainId: number): ethers.JsonRpcProvider {
  if (chainId === 338) {
    return new ethers.JsonRpcProvider(
      'https://cronos-testnet.drpc.org',
      { chainId: 338, name: 'cronos-testnet' },
      { staticNetwork: true },
    );
  }
  return new ethers.JsonRpcProvider(
    getRpcProxyUrl(chainId),
    { chainId, name: 'cronos' },
    { staticNetwork: true },
  );
}


export function createRpcProvider(chainId: number): ethers.JsonRpcProvider {
  return createProxyProvider(chainId);
}


export function createStaticRpcProvider(chainId: number): ethers.JsonRpcProvider {
  return createProxyProvider(chainId);
}


export async function getSigner(): Promise<ethers.JsonRpcSigner> {
  if (!window?.ethereum) throw new Error('No wallet found. Please install MetaMask.');
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  return provider.getSigner();
}
