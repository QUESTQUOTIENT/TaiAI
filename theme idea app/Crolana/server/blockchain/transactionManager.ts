

import { ethers } from 'ethers';
import { getProvider, getGasData } from './networkManager.js';

export interface TxOptions {
  gasLimit?: bigint;
  gasMultiplier?: number;  
  waitConfirmations?: number;
  timeoutMs?: number;
}

export interface TxResult {
  txHash: string;
  blockNumber: number;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  status: number;  
}

const DEFAULT_OPTS: Required<TxOptions> = {
  gasLimit: 0n,
  gasMultiplier: 1.3,
  waitConfirmations: 1,
  timeoutMs: 120_000,
};


export async function estimateGas(
  provider: ethers.JsonRpcProvider,
  tx: ethers.TransactionRequest,
  multiplier = 1.3,
): Promise<bigint> {
  const estimate = await provider.estimateGas(tx);
  return BigInt(Math.ceil(Number(estimate) * multiplier));
}


export async function waitForTransaction(
  provider: ethers.JsonRpcProvider,
  txHash: string,
  confirmations = 1,
  timeoutMs = 120_000,
): Promise<TxResult> {
  const receipt = await Promise.race([
    provider.waitForTransaction(txHash, confirmations),
    new Promise<never>((_, r) =>
      setTimeout(() => r(new Error('Transaction timeout after ' + timeoutMs + 'ms')), timeoutMs),
    ),
  ]);

  if (!receipt) throw new Error('Transaction receipt is null — tx may have been dropped');

  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    effectiveGasPrice: receipt.gasPrice ?? 0n,
    status: receipt.status ?? 0,
  };
}


export async function estimateDeploymentCost(
  chainId: number | string,
  bytecode: string,
  abi: any[],
  constructorArgs: any[] = [],
): Promise<{ gasEstimate: string; gasPriceGwei: string; totalCRO: string }> {
  const provider = await getProvider(chainId);
  const gasData = await getGasData(chainId);

  const factory = new ethers.ContractFactory(abi, bytecode);
  const deployTx = await factory.getDeployTransaction(...constructorArgs);

  let gasEstimate: bigint;
  try {
    gasEstimate = await provider.estimateGas({ data: deployTx.data });
    gasEstimate = BigInt(Math.ceil(Number(gasEstimate) * 1.3));
  } catch {
    gasEstimate = 2_500_000n;
  }

  const gasPriceWei = gasData.gasPrice;
  const totalWei = gasEstimate * gasPriceWei;

  return {
    gasEstimate: gasEstimate.toString(),
    gasPriceGwei: ethers.formatUnits(gasPriceWei, 'gwei') + ' Gwei',
    totalCRO: ethers.formatEther(totalWei),
  };
}


export async function buildDeployTransaction(
  chainId: number | string,
  abi: any[],
  bytecode: string,
  constructorArgs: any[],
  deployerAddress: string,
): Promise<ethers.TransactionRequest> {
  const provider = await getProvider(chainId);
  const factory = new ethers.ContractFactory(abi, bytecode);
  const deployTx = await factory.getDeployTransaction(...constructorArgs);

  let gasLimit: bigint;
  try {
    const estimate = await provider.estimateGas({ ...deployTx, from: deployerAddress });
    gasLimit = BigInt(Math.ceil(Number(estimate) * 1.3));
  } catch {
    gasLimit = 3_000_000n;
  }

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits('5000', 'gwei');

  const network = await provider.getNetwork();
  const nonce = await provider.getTransactionCount(deployerAddress, 'pending');

  return {
    ...deployTx,
    chainId: network.chainId,
    gasLimit,
    gasPrice,
    nonce,
    from: deployerAddress,
  };
}
