



function getRpcProxyUrl(cluster: string): string {
  return cluster === 'devnet'
    ? '/api/solana/rpc/devnet'
    : '/api/solana/rpc';
}




export function getSolanaRpcUrl(cluster: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  return cluster === 'devnet'
    ? `${origin}/api/solana/rpc/devnet`
    : `${origin}/api/solana/rpc`;
}



export const SOLANA_MAINNET_RPCS = ['https://rpc.ankr.com/solana'];
export const SOLANA_DEVNET_RPCS  = ['https://api.devnet.solana.com'];

export const LAMPORTS_PER_SOL = 1_000_000_000;

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

export function formatSol(lamports: number, decimals = 4): string {
  const sol = lamports / LAMPORTS_PER_SOL;
  if (sol === 0) return '0';
  if (sol < 0.0001) return '< 0.0001';
  return sol.toFixed(decimals).replace(/\.?0+$/, '');
}



export function getPhantomWallet() {
  return (window as any).solana ?? null;
}

export function isPhantomInstalled(): boolean {
  return !!(window.solana?.isPhantom);
}

export async function connectPhantom(): Promise<string> {
  const phantom = getPhantomWallet();
  if (!phantom) throw new Error('Phantom wallet not installed. Visit https://phantom.app to install.');
  if (!phantom.isPhantom) throw new Error('Phantom wallet not detected.');
  const resp = await phantom.connect();
  return resp.publicKey.toBase58 ? resp.publicKey.toBase58() : resp.publicKey.toString();
}





export function isMetaMaskSolanaAvailable(): boolean {
  const w = window as any;
  if (w.solana?.isMetaMask) return true;
  if (w.phantom?.ethereum?.isMetaMask) return true;
  if (Array.isArray(w.ethereum?.providers)) {
    return w.ethereum.providers.some((p: any) => p.isMetaMask);
  }
  return false;
}

export function getMetaMaskSolanaProvider(): any | null {
  const w = window as any;
  if (w.solana?.isMetaMask) return w.solana;
  return null;
}

export async function connectMetaMaskSolana(): Promise<string> {
  const provider = getMetaMaskSolanaProvider();
  if (!provider) {
    throw new Error(
      'MetaMask Solana not available. ' +
      'Enable it in MetaMask → Settings → Experimental → Solana, then reload the page.'
    );
  }
  const resp = await provider.connect();
  const key = resp?.publicKey;
  if (!key) throw new Error('MetaMask Solana: no public key returned');
  return key.toBase58 ? key.toBase58() : key.toString();
}

export async function disconnectPhantom(): Promise<void> {
  const phantom = getPhantomWallet();
  if (phantom) await phantom.disconnect();
}





async function solRpc(
  cluster: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const proxyUrl = getRpcProxyUrl(cluster);
  const res = await fetch(proxyUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

  if (!res.ok) throw new Error(`Solana RPC proxy ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'Solana RPC error');
  return json.result;
}



export async function getSolBalance(
  publicKey: string,
  cluster = 'mainnet-beta',
): Promise<number> {
  const result = await solRpc(cluster, 'getBalance', [
    publicKey,
    { commitment: 'confirmed' },
  ]) as { value: number };
  return result.value ?? 0;
}



export interface SplTokenBalance {
  mint: string;
  amount: string;
  decimals: number;
  uiAmount: number | null;
  symbol?: string;
  name?: string;
}

export async function getSplTokenAccounts(
  publicKey: string,
  cluster = 'mainnet-beta',
): Promise<SplTokenBalance[]> {
  try {
    const result = await solRpc(cluster, 'getTokenAccountsByOwner', [
      publicKey,
      { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
      { encoding: 'jsonParsed', commitment: 'confirmed' },
    ]) as {
      value: Array<{
        account: {
          data: {
            parsed: {
              info: {
                mint: string;
                tokenAmount: { amount: string; decimals: number; uiAmount: number | null };
              };
            };
          };
        };
      }>;
    };

    return result.value
      .map(acc => {
        const info = acc.account.data.parsed.info;
        return {
          mint:      info.mint,
          amount:    info.tokenAmount.amount,
          decimals:  info.tokenAmount.decimals,
          uiAmount:  info.tokenAmount.uiAmount,
        };
      })
      .filter(t => t.uiAmount !== null && t.uiAmount > 0);
  } catch {
    return [];
  }
}



export async function getSolanaNfts(
  publicKey: string,
  cluster = 'mainnet-beta',
): Promise<Array<{ mint: string; amount: number }>> {
  try {
    const tokens = await getSplTokenAccounts(publicKey, cluster);
    return tokens
      .filter(t => t.decimals === 0 && t.uiAmount === 1)
      .map(t => ({ mint: t.mint, amount: 1 }));
  } catch {
    return [];
  }
}



export function solscanTx(sig: string, cluster?: string): string {
  const q = cluster === 'devnet' ? '?cluster=devnet' : '';
  return `https://solscan.io/tx/${sig}${q}`;
}

export function solscanAddress(addr: string, cluster?: string): string {
  const q = cluster === 'devnet' ? '?cluster=devnet' : '';
  return `https://solscan.io/address/${addr}${q}`;
}

export function solscanToken(mint: string, cluster?: string): string {
  const q = cluster === 'devnet' ? '?cluster=devnet' : '';
  return `https://solscan.io/token/${mint}${q}`;
}



export interface KnownToken {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export const KNOWN_SPL_TOKENS: KnownToken[] = [
  { mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL',  name: 'Wrapped SOL',        decimals: 9  },
  { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', name: 'USD Coin',         decimals: 6  },
  { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',  symbol: 'USDT', name: 'Tether USD',       decimals: 6  },
  { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',  symbol: 'BONK', name: 'Bonk',             decimals: 5  },
  { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',   symbol: 'JUP',  name: 'Jupiter',          decimals: 6  },
  { mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', symbol: 'RAY',  name: 'Raydium',          decimals: 6  },
  { mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',  symbol: 'ETH',  name: 'Ethereum (Wormhole)', decimals: 8 },
  { mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',  symbol: 'mSOL', name: 'Marinade Staked SOL', decimals: 9 },
];
