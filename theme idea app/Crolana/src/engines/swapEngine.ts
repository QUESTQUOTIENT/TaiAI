

import { ethers } from 'ethers';





export const NATIVE_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const DEX_CONFIG = {
  25:  { name: 'VVS Finance', router: '0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae', factory: '0x3B44B2a187a7b3824131F8db5a74194D0a42Fc15', wcro: '0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23', feeBps: 30 },
  
  338: { name: 'UniswapV2 (Testnet)', router: '0x9553aDCf3C6b55BEE12c3C46Da4D4F2Af4b5E0f', factory: '0xEC7b6c44BD2d38F39520c97b066D3da1Beb80614', wcro: '0x6a3173618859C7cd40fAF6921b5E9eB6A76f1fD', feeBps: 30 },
} as const;

export const ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function WETH() external pure returns (address)',
];

export const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];





export interface SwapQuote {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
  amountOutFormatted: string;
  minReceived: bigint;
  minReceivedFormatted: string;
  path: string[];
  priceImpact: number;
  fee: string;
  dexName: string;
  executionPrice: string;  
  slippageBps: number;
}

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  decimalsIn: number;
  decimalsOut: number;
  slippageBps: number;
  deadlineMinutes: number;
  recipient: string;
}

export interface SwapResult {
  txHash: string;
  amountIn: bigint;
  amountOut: bigint;
  gasUsed: bigint;
  explorerUrl: string;
}





export function isNative(address: string): boolean {
  return address.toLowerCase() === NATIVE_ADDRESS.toLowerCase();
}

export function resolveRouterAddress(address: string, wcro: string): string {
  return isNative(address) ? wcro : address;
}

export function applySlippage(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10000 - slippageBps)) / 10000n;
}

export function getDeadline(minutes: number): number {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

function getDexConfig(chainId: number) {
  return DEX_CONFIG[chainId as keyof typeof DEX_CONFIG] ?? DEX_CONFIG[25];
}





export async function getSwapQuote(
  provider: ethers.BrowserProvider | ethers.JsonRpcProvider,
  chainId: number,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  decimalsIn: number,
  decimalsOut: number,
  slippageBps = 50,
): Promise<SwapQuote | null> {
  const config = getDexConfig(chainId);
  const router = new ethers.Contract(config.router, ROUTER_ABI, provider);
  const path = [resolveRouterAddress(tokenIn, config.wcro), resolveRouterAddress(tokenOut, config.wcro)];

  try {
    const amounts: bigint[] = await router.getAmountsOut(amountIn, path);
    const amountOut = amounts[amounts.length - 1];
    const minReceived = applySlippage(amountOut, slippageBps);

    const amountInNorm = Number(ethers.formatUnits(amountIn, decimalsIn));
    const amountOutNorm = Number(ethers.formatUnits(amountOut, decimalsOut));
    const executionPrice = amountInNorm > 0 ? (amountOutNorm / amountInNorm).toFixed(6) : '0';
    const priceImpact = config.feeBps / 100;

    return {
      tokenIn, tokenOut, amountIn, amountOut,
      amountOutFormatted: ethers.formatUnits(amountOut, decimalsOut),
      minReceived,
      minReceivedFormatted: ethers.formatUnits(minReceived, decimalsOut),
      path,
      priceImpact,
      fee: (config.feeBps / 100).toFixed(2) + '%',
      dexName: config.name,
      executionPrice,
      slippageBps,
    };
  } catch {
    return null;
  }
}





export async function ensureApproval(
  signer: ethers.JsonRpcSigner,
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  amount: bigint,
): Promise<string | null> {
  if (isNative(tokenAddress)) return null;
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const allowance: bigint = await token.allowance(ownerAddress, spenderAddress);
  if (allowance >= amount) return null;
  
  const tx = await token.approve(spenderAddress, amount);
  const receipt = await tx.wait();
  return receipt.hash;
}





export async function executeSwap(
  signer: ethers.JsonRpcSigner,
  chainId: number,
  params: SwapParams,
): Promise<SwapResult> {
  const config = getDexConfig(chainId);
  const router = new ethers.Contract(config.router, ROUTER_ABI, signer);
  const from = await signer.getAddress();
  const deadline = getDeadline(params.deadlineMinutes);
  const path = [resolveRouterAddress(params.tokenIn, config.wcro), resolveRouterAddress(params.tokenOut, config.wcro)];

  
  const provider = signer.provider as ethers.BrowserProvider;
  const quote = await getSwapQuote(provider, chainId, params.tokenIn, params.tokenOut, params.amountIn, params.decimalsIn, params.decimalsOut, params.slippageBps);
  if (!quote) throw new Error('No liquidity available for this swap');

  
  const approvalHash = await ensureApproval(signer, params.tokenIn, from, config.router, params.amountIn);
  if (approvalHash) {
    
    await new Promise((r) => setTimeout(r, 2000));
  }

  let tx: ethers.TransactionResponse;

  if (isNative(params.tokenIn)) {
    tx = await router.swapExactETHForTokens(quote.minReceived, path, params.recipient, deadline, { value: params.amountIn });
  } else if (isNative(params.tokenOut)) {
    tx = await router.swapExactTokensForETH(params.amountIn, quote.minReceived, path, params.recipient, deadline);
  } else {
    tx = await router.swapExactTokensForTokens(params.amountIn, quote.minReceived, path, params.recipient, deadline);
  }

  const receipt = await tx.wait();
  if (!receipt) throw new Error('Transaction failed to confirm');
  if (receipt.status === 0) throw new Error('Swap reverted on-chain');

  const explorerBase = chainId === 338 ? 'https://explorer.cronos.org/testnet' : 'https://explorer.cronos.org';

  return {
    txHash: receipt.hash,
    amountIn: params.amountIn,
    amountOut: quote.amountOut,
    gasUsed: receipt.gasUsed,
    explorerUrl: explorerBase + '/tx/' + receipt.hash,
  };
}





export async function getTokenBalance(
  provider: ethers.BrowserProvider | ethers.JsonRpcProvider,
  tokenAddress: string,
  walletAddress: string,
): Promise<{ balance: bigint; formatted: string; decimals: number; symbol: string }> {
  if (isNative(tokenAddress)) {
    const balance = await provider.getBalance(walletAddress);
    return { balance, formatted: ethers.formatEther(balance), decimals: 18, symbol: 'CRO' };
  }
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const [balance, decimals, symbol] = await Promise.all([
    token.balanceOf(walletAddress) as Promise<bigint>,
    token.decimals() as Promise<bigint>,
    token.symbol() as Promise<string>,
  ]);
  const dec = Number(decimals);
  return { balance, formatted: ethers.formatUnits(balance, dec), decimals: dec, symbol };
}





export function calculateFee(amountIn: bigint, feeBps: number): { feeAmount: bigint; netAmount: bigint } {
  const feeAmount = (amountIn * BigInt(feeBps)) / 10000n;
  const netAmount = amountIn - feeAmount;
  return { feeAmount, netAmount };
}

export function estimatePriceImpact(amountIn: bigint, reserve0: bigint, reserve1: bigint): number {
  if (reserve0 === 0n || reserve1 === 0n) return 100;
  const k = reserve0 * reserve1;
  const newReserve0 = reserve0 + amountIn;
  const newReserve1 = k / newReserve0;
  const priceAfter = Number(newReserve0) / Number(newReserve1);
  const priceBefore = Number(reserve0) / Number(reserve1);
  return Math.abs((priceAfter - priceBefore) / priceBefore) * 100;
}
