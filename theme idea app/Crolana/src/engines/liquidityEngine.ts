

import { ethers } from 'ethers';

export const NATIVE_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const ROUTER_ABI = [
  'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)',
  'function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)',
  'function removeLiquidity(address tokenA, address tokenB, uint liquidity, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB)',
  'function removeLiquidityETH(address token, uint liquidity, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external returns (uint amountToken, uint amountETH)',
  'function factory() external pure returns (address)',
  'function quote(uint amountA, uint reserveA, uint reserveB) external pure returns (uint amountB)',
];

export const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
  'function createPair(address tokenA, address tokenB) external returns (address pair)',
];

export const PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function totalSupply() external view returns (uint)',
  'function balanceOf(address) external view returns (uint)',
  'function allowance(address owner, address spender) external view returns (uint)',
  'function approve(address spender, uint value) external returns (bool)',
];

export const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export interface PoolInfo {
  pairAddress: string;
  token0: string;
  token1: string;
  reserve0: bigint;
  reserve1: bigint;
  totalSupply: bigint;
  exists: boolean;
  price0Per1: number;
  price1Per0: number;
}

export interface LiquidityPosition {
  pairAddress: string;
  lpBalance: bigint;
  lpBalanceFormatted: string;
  share: number;
  sharePercent: string;
  token0Amount: bigint;
  token1Amount: bigint;
}

export interface AddLiquidityResult {
  txHash: string;
  amountA: bigint;
  amountB: bigint;
  lpReceived?: bigint;
  explorerUrl: string;
}

function isNative(addr: string): boolean {
  return addr.toLowerCase() === NATIVE_ADDRESS.toLowerCase();
}

function getDeadline(minutes: number): number {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

function applySlippage(amount: bigint, bps: number): bigint {
  return (amount * BigInt(10000 - bps)) / 10000n;
}

function explorerUrl(chainId: number, hash: string): string {
  const base = chainId === 338 ? 'https://explorer.cronos.org/testnet' : 'https://explorer.cronos.org';
  return base + '/tx/' + hash;
}

async function approveIfNeeded(signer: ethers.JsonRpcSigner, tokenAddress: string, spenderAddress: string, amount: bigint): Promise<void> {
  if (isNative(tokenAddress)) return;
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const owner = await signer.getAddress();
  const allowance: bigint = await token.allowance(owner, spenderAddress);
  if (allowance < amount) {
    const tx = await token.approve(spenderAddress, amount);
    await tx.wait();
  }
}

export async function getPoolInfo(
  provider: ethers.BrowserProvider | ethers.JsonRpcProvider,
  factoryAddress: string,
  tokenA: string,
  tokenB: string,
  wcroAddress: string,
): Promise<PoolInfo> {
  const addrA = isNative(tokenA) ? wcroAddress : tokenA;
  const addrB = isNative(tokenB) ? wcroAddress : tokenB;
  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
  const pairAddress: string = await factory.getPair(addrA, addrB);

  if (pairAddress === ethers.ZeroAddress) {
    return { pairAddress: ethers.ZeroAddress, token0: addrA, token1: addrB, reserve0: 0n, reserve1: 0n, totalSupply: 0n, exists: false, price0Per1: 0, price1Per0: 0 };
  }

  const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
  const [reserves, token0, totalSupply] = await Promise.all([pair.getReserves(), pair.token0(), pair.totalSupply()]);

  const r0: bigint = reserves[0];
  const r1: bigint = reserves[1];
  const price0Per1 = r1 > 0n ? Number(r0) / Number(r1) : 0;
  const price1Per0 = r0 > 0n ? Number(r1) / Number(r0) : 0;

  return {
    pairAddress,
    token0: token0.toLowerCase(),
    token1: addrA.toLowerCase() === token0.toLowerCase() ? addrB : addrA,
    reserve0: r0,
    reserve1: r1,
    totalSupply,
    exists: true,
    price0Per1,
    price1Per0,
  };
}

export async function getLiquidityPosition(
  provider: ethers.BrowserProvider | ethers.JsonRpcProvider,
  pairAddress: string,
  walletAddress: string,
): Promise<LiquidityPosition> {
  const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
  const [lpBalance, totalSupply, reserves] = await Promise.all([pair.balanceOf(walletAddress), pair.totalSupply(), pair.getReserves()]);

  const share = totalSupply > 0n ? Number(lpBalance) / Number(totalSupply) : 0;
  const token0Amount = BigInt(Math.floor(share * Number(reserves[0])));
  const token1Amount = BigInt(Math.floor(share * Number(reserves[1])));

  return {
    pairAddress,
    lpBalance,
    lpBalanceFormatted: ethers.formatUnits(lpBalance, 18),
    share,
    sharePercent: (share * 100).toFixed(4) + '%',
    token0Amount,
    token1Amount,
  };
}

export async function addLiquidity(
  signer: ethers.JsonRpcSigner,
  routerAddress: string,
  tokenA: string,
  tokenB: string,
  amountA: bigint,
  amountB: bigint,
  slippageBps: number,
  deadlineMinutes: number,
  chainId: number,
): Promise<AddLiquidityResult> {
  const router = new ethers.Contract(routerAddress, ROUTER_ABI, signer);
  const recipient = await signer.getAddress();
  const deadline = getDeadline(deadlineMinutes);
  const minA = applySlippage(amountA, slippageBps);
  const minB = applySlippage(amountB, slippageBps);

  let tx: ethers.TransactionResponse;

  if (isNative(tokenA)) {
    await approveIfNeeded(signer, tokenB, routerAddress, amountB);
    tx = await router.addLiquidityETH(tokenB, amountB, minB, minA, recipient, deadline, { value: amountA });
  } else if (isNative(tokenB)) {
    await approveIfNeeded(signer, tokenA, routerAddress, amountA);
    tx = await router.addLiquidityETH(tokenA, amountA, minA, minB, recipient, deadline, { value: amountB });
  } else {
    await Promise.all([
      approveIfNeeded(signer, tokenA, routerAddress, amountA),
      approveIfNeeded(signer, tokenB, routerAddress, amountB),
    ]);
    tx = await router.addLiquidity(tokenA, tokenB, amountA, amountB, minA, minB, recipient, deadline);
  }

  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) throw new Error('Add liquidity transaction failed');

  return { txHash: receipt.hash, amountA, amountB, explorerUrl: explorerUrl(chainId, receipt.hash) };
}

export async function removeLiquidity(
  signer: ethers.JsonRpcSigner,
  routerAddress: string,
  pairAddress: string,
  tokenA: string,
  tokenB: string,
  lpAmount: bigint,
  deadlineMinutes: number,
  chainId: number,
): Promise<{ txHash: string; explorerUrl: string }> {
  const router = new ethers.Contract(routerAddress, ROUTER_ABI, signer);
  const pair = new ethers.Contract(pairAddress, PAIR_ABI, signer);
  const recipient = await signer.getAddress();
  const deadline = getDeadline(deadlineMinutes);

  const allowance: bigint = await pair.allowance(recipient, routerAddress);
  if (allowance < lpAmount) {
    const approveTx = await pair.approve(routerAddress, lpAmount);
    await approveTx.wait();
  }

  let tx: ethers.TransactionResponse;
  if (isNative(tokenA) || isNative(tokenB)) {
    const erc20Token = isNative(tokenA) ? tokenB : tokenA;
    tx = await router.removeLiquidityETH(erc20Token, lpAmount, 0n, 0n, recipient, deadline);
  } else {
    tx = await router.removeLiquidity(tokenA, tokenB, lpAmount, 0n, 0n, recipient, deadline);
  }

  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) throw new Error('Remove liquidity transaction failed');
  return { txHash: receipt.hash, explorerUrl: explorerUrl(chainId, receipt.hash) };
}

export function calculateLiquidityAmountB(amountA: bigint, reserveA: bigint, reserveB: bigint): bigint {
  if (reserveA === 0n || reserveB === 0n) return amountA;
  return (amountA * reserveB) / reserveA;
}

export function calculatePoolShare(lpAmount: bigint, totalSupply: bigint): number {
  if (totalSupply === 0n) return 100;
  return (Number(lpAmount) / Number(totalSupply)) * 100;
}
