

import { Request, Response } from 'express';
import { generateContractSource } from '../services/contractGenerator.js';
import { compileContract } from '../services/compiler.js';
import { AdvancedContractConfig } from '../../src/types.js';
import { db, ContractDeployment } from '../db.js';
import { buildDeployTransaction, estimateDeploymentCost } from '../blockchain/transactionManager.js';
import { v4 as uuidv4 } from 'uuid';

function validateContractConfig(config: any): string[] {
  const errors: string[] = [];
  if (!config) { errors.push('Contract config is required'); return errors; }
  if (!config.name || typeof config.name !== 'string' || !config.name.trim()) errors.push('Contract name is required');
  if (!config.symbol || typeof config.symbol !== 'string' || !config.symbol.trim()) errors.push('Contract symbol is required');
  if (!['ERC721', 'ERC721A', 'ERC1155'].includes(config.type)) errors.push('Contract type must be ERC721, ERC721A, or ERC1155');
  if (!config.supply) errors.push('Supply settings required');
  else if (!Number.isInteger(config.supply.maxSupply) || config.supply.maxSupply < 1) errors.push('maxSupply must be a positive integer');
  return errors;
}





export const generateContract = async (req: Request, res: Response) => {
  try {
    const config: AdvancedContractConfig = req.body;
    const errors = validateContractConfig(config);
    if (errors.length > 0) return res.status(400).json({ error: 'Invalid config', details: errors });

    const source = generateContractSource(config);
    res.json({ source });
  } catch (error: any) {
    console.error('[contractController] generateContract error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate contract' });
  }
};

export const compileContractController = async (req: Request, res: Response) => {
  try {
    const { config } = req.body;
    if (!config) return res.status(400).json({ error: 'Config is required' });

    const errors = validateContractConfig(config);
    if (errors.length > 0) return res.status(400).json({ error: 'Invalid config', details: errors });

    const source = generateContractSource(config);
    const contractName = config.name.replace(/[^a-zA-Z0-9_]/g, '').replace(/^[0-9]+/, '') || 'MyNFT';
    const result = await compileContract(source, contractName);

    if (result.error) return res.status(400).json({ error: result.error });

    res.json(result);
  } catch (error: any) {
    console.error('[contractController] compileContract error:', error);
    res.status(500).json({ error: error.message || 'Compilation failed' });
  }
};





export const buildDeployTx = async (req: Request, res: Response) => {
  try {
    const { config, deployerAddress, chainId = 25 } = req.body;

    if (!config) return res.status(400).json({ error: 'Contract config is required' });
    if (!deployerAddress) return res.status(400).json({ error: 'deployerAddress is required' });

    const errors = validateContractConfig(config);
    if (errors.length > 0) return res.status(400).json({ error: 'Invalid config', details: errors });

    const source = generateContractSource(config);
    const contractName = config.name.replace(/[^a-zA-Z0-9_]/g, '').replace(/^[0-9]+/, '') || 'MyNFT';
    const compiled = await compileContract(source, contractName);

    if (compiled.error) return res.status(400).json({ error: compiled.error });

    
    const constructorArgs = [
      config.name,
      config.symbol,
      config.advanced?.baseURI || '',
      config.advanced?.hiddenMetadataUri || 'ipfs://placeholder/hidden.json',
    ];

    const tx = await buildDeployTransaction(chainId, compiled.abi, compiled.bytecode, constructorArgs, deployerAddress);

    res.json({
      tx,
      abi: compiled.abi,
      bytecode: compiled.bytecode,
      contractName,
      constructorArgs,
    });
  } catch (error: any) {
    console.error('[contractController] buildDeployTx error:', error);
    res.status(500).json({ error: error.message || 'Failed to build deploy transaction' });
  }
};





export const verifyContract = async (req: Request, res: Response) => {
  try {
    const { address, network: networkId } = req.body;
    if (!address) return res.status(400).json({ error: 'address is required' });

    const apiKey = process.env.CRONOSCAN_API_KEY;
    const isMainnet = networkId === 25;
    const explorerUrl = isMainnet
      ? 'https://explorer.cronos.org/address/' + address
      : 'https://explorer.cronos.org/testnet/address/' + address;

    if (!apiKey) {
      return res.json({
        verified: false,
        message: 'No CRONOSCAN_API_KEY set. Add it in Settings or your .env file, then retry.',
        explorerUrl,
        manualUrl: explorerUrl,
      });
    }

    const apiBase = isMainnet ? 'https://api.cronoscan.com/api' : 'https://api-testnet.cronoscan.com/api';
    const checkRes = await fetch(apiBase + '?module=contract&action=getsourcecode&address=' + address + '&apikey=' + apiKey);
    const checkData = await checkRes.json() as any;

    if (checkData.result?.[0]?.SourceCode) {
      return res.json({ verified: true, alreadyVerified: true, explorerUrl });
    }

    res.json({ verified: false, message: 'Contract not yet verified. Use Cronoscan to verify.', explorerUrl, manualUrl: explorerUrl });
  } catch (error: any) {
    console.error('[contractController] verifyContract error:', error);
    res.status(500).json({ error: error.message });
  }
};





export const saveDeployment = async (req: Request, res: Response) => {
  try {
    const { userId, networkId, contractAddress, contractType, name, symbol, txHash } = req.body;

    if (!userId || !networkId || !contractAddress) {
      return res.status(400).json({ error: 'Missing required fields: userId, networkId, contractAddress' });
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
      return res.status(400).json({ error: 'Invalid contract address format' });
    }

    const deployment: ContractDeployment = {
      id: uuidv4(),
      userId,
      networkId: Number(networkId),
      contractAddress: contractAddress.toLowerCase(),
      contractType: contractType || 'ERC721',
      name: name || '',
      symbol: symbol || '',
      txHash: txHash || '',
      deployedAt: new Date().toISOString(),
    };

    await db.addDeployment(deployment);
    res.status(201).json({ success: true, deployment });
  } catch (error: any) {
    console.error('[contractController] saveDeployment error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getDeployments = async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || 'default';
    const deployments = await db.getDeployments(userId);
    res.json({ deployments });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};





export const estimateGas = async (req: Request, res: Response) => {
  try {
    const { bytecode, abi, constructorArgs, networkId } = req.body;
    if (!bytecode) return res.status(400).json({ error: 'bytecode is required' });

    const chainId = Number(networkId) || 25;
    const result = await estimateDeploymentCost(chainId, bytecode, abi || [], constructorArgs || []);
    res.json(result);
  } catch (error: any) {
    
    res.json({
      gasEstimate: '2500000',
      gasPriceGwei: '5000 Gwei',
      totalCRO: '~0.01',
      note: 'Live estimate unavailable, showing approximate values',
    });
  }
};
