

import { ethers } from 'ethers';


const TESTNET_WSS = 'wss://cronos-testnet.drpc.org';
const TESTNET_HTTP = 'https://cronos-testnet.drpc.org';


let _testnetWssProvider: ethers.WebSocketProvider | null = null;
let _testnetWssReady = false;

function getTestnetWssProvider(): ethers.WebSocketProvider | null {
  
  if (typeof window === 'undefined') return null;
  if (_testnetWssProvider && _testnetWssReady) return _testnetWssProvider;

  try {
    const p = new ethers.WebSocketProvider(
      TESTNET_WSS,
      { chainId: 338, name: 'cronos-testnet' },
    );
    
    p.on('network', () => { _testnetWssReady = true; });
    (p.websocket as any).onerror = () => {
      _testnetWssReady = false;
      _testnetWssProvider = null;
    };
    (p.websocket as any).onclose = () => {
      _testnetWssReady = false;
      _testnetWssProvider = null;
    };
    _testnetWssProvider = p;
    _testnetWssReady = true; 
    return p;
  } catch {
    return null;
  }
}


export function getProxyProvider(chainId: number): ethers.JsonRpcProvider {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  return new ethers.JsonRpcProvider(
    `${origin}/api/rpc/${chainId}`,
    { chainId, name: chainId === 25 ? 'cronos' : 'cronos-testnet' },
    { staticNetwork: true },
  );
}


export function getReadProvider(chainId: number): ethers.JsonRpcProvider | ethers.WebSocketProvider {
  if (chainId !== 338) {
    
    return getProxyProvider(chainId);
  }
  
  const wss = getTestnetWssProvider();
  if (wss) return wss;
  
  return getProxyProvider(chainId);
}


export function getDexProvider(chainId: number): ethers.JsonRpcProvider {
  
  if (chainId === 338) {
    return new ethers.JsonRpcProvider(
      TESTNET_HTTP,
      { chainId: 338, name: 'cronos-testnet' },
      { staticNetwork: true },
    );
  }
  return getProxyProvider(chainId);
}


export async function getSignerProvider(): Promise<{
  provider: ethers.BrowserProvider;
  signer: ethers.JsonRpcSigner;
}> {
  if (!(window as any).ethereum) throw new Error('No wallet detected. Please install MetaMask.');
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  return { provider, signer };
}
