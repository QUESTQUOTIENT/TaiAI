

import { ethers } from 'ethers';





export const NATIVE_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const DEX_CONFIG = {
  25: {
    name: 'VVS Finance',
    router: '0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae',
    factory: '0x3B44B2a187a7b3824131F8db5a74194D0a42Fc15',
    wcro: '0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23',
    feeBps: 30, 
  },
  338: {
    name: 'VVS Finance (Testnet)',
    router: '0x9553aDCf3C6b55BEE12c3C46Da4D4F2Af4b5E0f',
    factory: '0x9553aDCf3C6b55BEE12c3C46Da4D4F2Af4b5E0f',
    wcro: '0x6a3173618859C7cd40fAF6921b5E9eB6A76f1fD',
    feeBps: 30,
  },
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
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];





export interface SwapQuote {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
  path: string[];
  priceImpact: number;
  minReceived: bigint;
  slippageBps: number;
  dexName: string;
  routerAddress: string;
}

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  slippageBps: number;   
  deadlineMinutes: number;
  recipient: string;
}

export interface SwapResult {
  txHash: string;
  amountIn: bigint;
  amountOut: bigint;
  gasUsed: bigint;
}





export function isNative(address: string): boolean {
  return address.toLowerCase() === NATIVE_ADDRESS.toLowerCase();
}

export function resolveAddress(address: string, wcro: string): string {
  return isNative(address) ? wcro : address;
}

export function applySlippage(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10000 - slippageBps)) / 10000n;
}

export function getDeadline(minutes: number): number {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}





export async function getQuote(
  provider: ethers.JsonRpcProvider | ethers.BrowserProvider,
  chainId: number,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  slippageBps = 50,
): Promise<SwapQuote | null> {
  const config = DEX_CONFIG[chainId as keyof typeof DEX_CONFIG] ?? DEX_CONFIG[25];
  const router = new ethers.Contract(config.router, ROUTER_ABI, provider);
  const path = [resolveAddress(tokenIn, config.wcro), resolveAddress(tokenOut, config.wcro)];

  try {
    const amounts: bigint[] = await router.getAmountsOut(amountIn, path);
    const amountOut = amounts[amounts.length - 1];
    const minReceived = applySlippage(amountOut, slippageBps);

    
    const priceImpact = (config.feeBps / 100) * (Number(amountIn) / (Number(amountIn) + 1e9));

    return {
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      path,
      priceImpact,
      minReceived,
      slippageBps,
      dexName: config.name,
      routerAddress: config.router,
    };
  } catch {
    return null;
  }
}





export async function ensureApproval(
  signer: ethers.Signer,
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  amount: bigint,
): Promise<string | null> {
  if (isNative(tokenAddress)) return null;
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const allowance: bigint = await token.allowance(ownerAddress, spenderAddress);
  if (allowance >= amount) return null;
  const tx = await token.approve(spenderAddress, ethers.MaxUint256);
  const receipt = await tx.wait();
  return receipt.hash;
}





export async function executeSwap(
  signer: ethers.Signer,
  chainId: number,
  params: SwapParams,
): Promise<SwapResult> {
  const config = DEX_CONFIG[chainId as keyof typeof DEX_CONFIG] ?? DEX_CONFIG[25];
  const router = new ethers.Contract(config.router, ROUTER_ABI, signer);
  const from = await signer.getAddress();
  const deadline = getDeadline(params.deadlineMinutes);

  const path = [
    resolveAddress(params.tokenIn, config.wcro),
    resolveAddress(params.tokenOut, config.wcro),
  ];

  
  const quote = await getQuote(
    signer.provider as ethers.BrowserProvider,
    chainId,
    params.tokenIn,
    params.tokenOut,
    params.amountIn,
    params.slippageBps,
  );
  if (!quote) throw new Error('No liquidity available for this swap');

  let tx: ethers.TransactionResponse;

  if (isNative(params.tokenIn)) {
    
    tx = await router.swapExactETHForTokens(
      quote.minReceived,
      path,
      params.recipient,
      deadline,
      { value: params.amountIn },
    );
  } else if (isNative(params.tokenOut)) {
    
    await ensureApproval(signer, params.tokenIn, from, config.router, params.amountIn);
    tx = await router.swapExactTokensForETH(
      params.amountIn,
      quote.minReceived,
      path,
      params.recipient,
      deadline,
    );
  } else {
    
    await ensureApproval(signer, params.tokenIn, from, config.router, params.amountIn);
    tx = await router.swapExactTokensForTokens(
      params.amountIn,
      quote.minReceived,
      path,
      params.recipient,
      deadline,
    );
  }

  const receipt = await tx.wait();
  if (!receipt) throw new Error('Transaction failed to confirm');

  return {
    txHash: receipt.hash,
    amountIn: params.amountIn,
    amountOut: quote.amountOut,
    gasUsed: receipt.gasUsed,
  };
}
