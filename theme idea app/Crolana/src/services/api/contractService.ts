

import { apiClient } from './apiClient';

export interface CompileResult {
  abi: any[];
  bytecode: string;
  source: string;
}

export interface DeployTxResult {
  tx: {
    data: string;
    gasLimit: string;
    gasPrice: string;
    nonce: number;
    chainId: number;
    value?: string;
  };
  abi: any[];
  bytecode: string;
  contractName: string;
  constructorArgs: any[];
}

export interface GasEstimate {
  gasEstimate: string;
  gasPriceGwei: string;
  totalCRO: string;
  note?: string;
}

export interface Deployment {
  id: string;
  contractAddress: string;
  contractType: string;
  name: string;
  symbol: string;
  networkId: number;
  txHash: string;
  deployedAt: string;
}

export const contractService = {
  
  generateSource(config: any): Promise<{ source: string }> {
    return apiClient.post('/api/contract/generate', config);
  },

  
  compile(config: any): Promise<CompileResult> {
    return apiClient.post('/api/contract/compile', { config });
  },

  
  buildDeployTx(config: any, deployerAddress: string, chainId = 25): Promise<DeployTxResult> {
    return apiClient.post('/api/contract/build-deploy-tx', { config, deployerAddress, chainId });
  },

  
  estimateGas(bytecode: string, abi: any[], constructorArgs: any[], networkId: number): Promise<GasEstimate> {
    return apiClient.post('/api/contract/estimate-gas', { bytecode, abi, constructorArgs, networkId });
  },

  
  saveDeployment(data: {
    userId: string;
    networkId: number;
    contractAddress: string;
    contractType?: string;
    name?: string;
    symbol?: string;
    txHash?: string;
  }): Promise<{ deployment: Deployment }> {
    return apiClient.post('/api/contract/deployments', data);
  },

  
  getDeployments(userId: string): Promise<{ deployments: Deployment[] }> {
    return apiClient.get('/api/contract/deployments?userId=' + userId);
  },

  
  verify(address: string, network: number): Promise<{ verified: boolean; explorerUrl: string }> {
    return apiClient.post('/api/contract/verify', { address, network });
  },
};
