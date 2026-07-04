

const JUPITER_PROXY = '/api/solana/jupiter';


function getRpcProxyUrl(cluster: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  return cluster === 'devnet'
    ? `${origin}/api/solana/rpc/devnet`
    : `${origin}/api/solana/rpc`;
}



export interface JupiterQuoteResult {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
}



export async function getJupiterQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string;       
  slippageBps?: number; 
  cluster?: string;
}): Promise<JupiterQuoteResult> {
  const { inputMint, outputMint, amount, slippageBps = 50, cluster = 'mainnet-beta' } = params;

  if (cluster !== 'mainnet-beta') {
    throw new Error(
      'Jupiter aggregator only operates on Solana Mainnet. Switch network to Mainnet to use swap.',
    );
  }

  
  const qs = new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    slippageBps:        String(slippageBps),
    onlyDirectRoutes:   'false',
    asLegacyTransaction:'false',
  });

  const res = await fetch(`${JUPITER_PROXY}/quote?${qs}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as any).error ?? (err as any).message ?? `Jupiter quote failed: ${res.status}`);
  }
  return res.json();
}



export async function buildJupiterSwapTx(params: {
  quoteResponse: JupiterQuoteResult;
  userPublicKey: string;
  wrapUnwrapSOL?: boolean;
}): Promise<string> {
  const { quoteResponse, userPublicKey, wrapUnwrapSOL = true } = params;

  const res = await fetch(`${JUPITER_PROXY}/swap`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol:          wrapUnwrapSOL,
      dynamicComputeUnitLimit:   true,
      prioritizationFeeLamports: 'auto',  
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as any).error ?? (err as any).message ?? `Jupiter swap build failed: ${res.status}`);
  }

  const { swapTransaction } = await res.json();
  return swapTransaction; 
}



export async function signAndSendSolanaSwap(params: {
  swapTransactionBase64: string;
  cluster?: string;
}): Promise<string> {
  const { swapTransactionBase64, cluster = 'mainnet-beta' } = params;

  if (!window.solana?.isPhantom) {
    throw new Error('Phantom wallet not found. Install from https://phantom.app');
  }
  if (!window.solana.publicKey) {
    throw new Error('Phantom not connected. Please connect your wallet first.');
  }

  
  const web3     = await import('@solana/web3.js');
  const txBuf    = Buffer.from(swapTransactionBase64, 'base64');
  const transaction = web3.VersionedTransaction.deserialize(txBuf);

  
  const rpcUrl    = getRpcProxyUrl(cluster);
  
  const wsUrl = cluster === 'devnet' ? 'wss://api.devnet.solana.com' : 'wss://api.mainnet-beta.solana.com';
  const connection = new web3.Connection(rpcUrl, {
    commitment: 'confirmed',
    wsEndpoint: wsUrl,
    disableRetryOnRateLimit: false,
  });

  
  const { signature } = await window.solana.signAndSendTransaction(transaction);

  
  const { lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  let confirmed = false;
  const deadline = Date.now() + 90_000;
  while (!confirmed && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1500));
    const { value } = await connection.getSignatureStatus(signature, { searchTransactionHistory: false });
    if (value?.confirmationStatus === 'confirmed' || value?.confirmationStatus === 'finalized') confirmed = true;
    if (value?.err) throw new Error('Swap transaction failed: ' + JSON.stringify(value.err));
  }
  if (!confirmed) throw new Error('Jupiter swap confirmation timed out');

  return signature;
}



export async function getJupiterTokenPrice(
  mint: string,
): Promise<number | null> {
  try {
    const res = await fetch(`${JUPITER_PROXY}/price?ids=${mint}&vsToken=USDC`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data as any).data?.[mint]?.price ?? null;
  } catch {
    return null;
  }
}




export function solAmountToLamports(amount: string, decimals: number): string {
  try {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return '0';
    return Math.floor(num * 10 ** decimals).toString();
  } catch {
    return '0';
  }
}


export function lamportsToDisplay(lamports: string, decimals: number, precision = 6): string {
  try {
    const num = parseInt(lamports, 10) / 10 ** decimals;
    if (num === 0) return '0';
    if (num < 0.000001) return '< 0.000001';
    return num.toFixed(precision).replace(/\.?0+$/, '');
  } catch {
    return '0';
  }
}

export const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';

export function isNativeSOL(mint: string): boolean {
  return mint === NATIVE_SOL_MINT;
}
