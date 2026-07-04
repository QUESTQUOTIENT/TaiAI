

import { ethers } from 'ethers';

export const ROUTER_ABI = [
  'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)',
  'function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)',
  'function removeLiquidity(address tokenA, address tokenB, uint liquidity, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB)',
  'function removeLiquidityETH(address token, uint liquidity, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external returns (uint amountToken, uint amountETH)',
  'function factory() external pure returns (address)',
];

export const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
];

export const PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function totalSupply() external view returns (uint)',
  'function balanceOf(address) external view returns (uint)',
  'function approve(address spender, uint value) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint)',
];

export const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
];

export const NATIVE_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export interface PoolInfo {
  pairAddress: string;
  token0: string;
  token1: string;
  reserve0: bigint;
  reserve1: bigint;
  totalSupply: bigint;
  exists: boolean;
}

export interface LiquidityPosition {
  pairAddress: string;
  lpBalance: bigint;
  share: number;          
  token0Amount: bigint;
  token1Amount: bigint;
}

export interface AddLiquidityParams {
  tokenA: string;
  tokenB: string;
  amountA: bigint;
  amountB: bigint;
  slippageBps: number;
  deadlineMinutes: number;
  recipient: string;
}

export interface RemoveLiquidityParams {
  tokenA: string;
  tokenB: string;
  pairAddress: string;
  lpAmount: bigint;
  deadlineMinutes: number;
  recipient: string;
}

export function isNative(addr: string): boolean {
  return addr.toLowerCase() === NATIVE_ADDRESS.toLowerCase();
}

function getDeadline(minutes: number): number {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

function applySlippage(amount: bigint, bps: number): bigint {
  return (amount * BigInt(10000 - bps)) / 10000n;
}


export async function getPoolInfo(
  provider: ethers.JsonRpcProvider | ethers.BrowserProvider,
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
    return { pairAddress: ethers.ZeroAddress, token0: addrA, token1: addrB, reserve0: 0n, reserve1: 0n, totalSupply: 0n, exists: false };
  }

  const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
  const [reserves, token0, totalSupply] = await Promise.all([
    pair.getReserves(),
    pair.token0(),
    pair.totalSupply(),
  ]);

  return {
    pairAddress,
    token0: token0.toLowerCase(),
    token1: addrA.toLowerCase() === token0.toLowerCase() ? addrB : addrA,
    reserve0: reserves[0],
    reserve1: reserves[1],
    totalSupply,
    exists: true,
  };
}


export async function getLiquidityPosition(
  provider: ethers.JsonRpcProvider | ethers.BrowserProvider,
  pairAddress: string,
  walletAddress: string,
): Promise<LiquidityPosition> {
  const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
  const [lpBalance, totalSupply, reserves] = await Promise.all([
    pair.balanceOf(walletAddress),
    pair.totalSupply(),
    pair.getReserves(),
  ]);

  const share = totalSupply > 0n ? Number(lpBalance) / Number(totalSupply) : 0;
  const token0Amount = BigInt(Math.floor(share * Number(reserves[0])));
  const token1Amount = BigInt(Math.floor(share * Number(reserves[1])));

  return { pairAddress, lpBalance, share, token0Amount, token1Amount };
}


export async function addLiquidity(
  signer: ethers.Signer,
  routerAddress: string,
  params: AddLiquidityParams,
  wcroAddress: string,
): Promise<{ txHash: string; lpReceived?: bigint }> {
  const router = new ethers.Contract(routerAddress, ROUTER_ABI, signer);
  const from = await signer.getAddress();
  const deadline = getDeadline(params.deadlineMinutes);
  const minA = applySlippage(params.amountA, params.slippageBps);
  const minB = applySlippage(params.amountB, params.slippageBps);

  const approveToken = async (tokenAddr: string, amount: bigint) => {
    if (isNative(tokenAddr)) return;
    const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
    const allowance: bigint = await token.allowance(from, routerAddress);
    if (allowance < amount) {
      const approveTx = await token.approve(routerAddress, ethers.MaxUint256);
      await approveTx.wait();
    }
  };

  let tx: ethers.TransactionResponse;

  if (isNative(params.tokenA)) {
    await approveToken(params.tokenB, params.amountB);
    tx = await router.addLiquidityETH(
      params.tokenB, params.amountB, minB, minA,
      params.recipient, deadline,
      { value: params.amountA },
    );
  } else if (isNative(params.tokenB)) {
    await approveToken(params.tokenA, params.amountA);
    tx = await router.addLiquidityETH(
      params.tokenA, params.amountA, minA, minB,
      params.recipient, deadline,
      { value: params.amountB },
    );
  } else {
    await Promise.all([
      approveToken(params.tokenA, params.amountA),
      approveToken(params.tokenB, params.amountB),
    ]);
    tx = await router.addLiquidity(
      params.tokenA, params.tokenB,
      params.amountA, params.amountB,
      minA, minB,
      params.recipient, deadline,
    );
  }

  const receipt = await tx.wait();
  if (!receipt) throw new Error('Transaction failed to confirm');
  return { txHash: receipt.hash };
}


export async function removeLiquidity(
  signer: ethers.Signer,
  routerAddress: string,
  params: RemoveLiquidityParams,
  wcroAddress: string,
): Promise<{ txHash: string }> {
  const router = new ethers.Contract(routerAddress, ROUTER_ABI, signer);
  const from = await signer.getAddress();
  const deadline = getDeadline(params.deadlineMinutes);

  
  const pair = new ethers.Contract(params.pairAddress, PAIR_ABI, signer);
  const allowance: bigint = await pair.allowance(from, routerAddress);
  if (allowance < params.lpAmount) {
    const approveTx = await pair.approve(routerAddress, ethers.MaxUint256);
    await approveTx.wait();
  }

  let tx: ethers.TransactionResponse;

  if (isNative(params.tokenA) || isNative(params.tokenB)) {
    const erc20Token = isNative(params.tokenA) ? params.tokenB : params.tokenA;
    tx = await router.removeLiquidityETH(
      erc20Token, params.lpAmount, 0n, 0n,
      params.recipient, deadline,
    );
  } else {
    tx = await router.removeLiquidity(
      params.tokenA, params.tokenB,
      params.lpAmount, 0n, 0n,
      params.recipient, deadline,
    );
  }

  const receipt = await tx.wait();
  if (!receipt) throw new Error('Transaction failed to confirm');
  return { txHash: receipt.hash };
}
