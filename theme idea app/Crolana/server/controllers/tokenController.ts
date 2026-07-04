

import { Request, Response } from 'express';
import { compileContract } from '../services/compiler.js';
import { db } from '../db.js';
import {
  generateERC20Token,
  getTokenTemplates,
  validateToken,
  type TokenGenerateInput,
} from '../services/engines/tokenEngineAdapter.js';
import { v4 as uuidv4 } from 'uuid';






function extractContractName(source: string): string {
  const m = source.match(/\bcontract\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
  return m ? m[1] : 'Contract';
}


export const generateTokenV2 = async (req: Request, res: Response) => {
  try {
    const input: TokenGenerateInput = req.body;

    if (!input.name || !input.symbol || !input.initialSupply) {
      return res.status(400).json({ error: 'name, symbol, and initialSupply are required' });
    }

    const result = generateERC20Token(input);
    res.json({ source: result.source, contractName: result.contractName, config: result.config });
  } catch (error: any) {
    console.error('[tokenController] generateTokenV2 error:', error);
    res.status(400).json({ error: error.message || 'Failed to generate token' });
  }
};





export const generateTokenContract = async (req: Request, res: Response) => {
  try {
    const data = req.body;

    if (!data.name || !data.symbol) {
      return res.status(400).json({ error: 'name and symbol are required' });
    }

    
    const input: TokenGenerateInput = {
      name:          data.name,
      symbol:        data.symbol,
      decimals:      data.decimals ?? 18,
      initialSupply: data.initialSupply ?? data.totalSupply ?? '1000000',
      isMintable:    data.mintable ?? (!data.fixedSupply) ?? false,
      isBurnable:    data.burnable ?? false,
      isPausable:    data.pausable ?? false,
      hasTax:        (data.buyTax > 0 || data.sellTax > 0) || data.hasTax || false,
      taxBps:        data.taxBps ?? Math.max(data.buyTax ?? 0, data.sellTax ?? 0) ?? 0,
      taxRecipient:  data.taxWallet ?? data.taxRecipient ?? '',
      maxSupply:     data.maxSupply,
      isGovernance:  data.permit ?? data.isGovernance ?? false,
      
      hasPermit:     data.hasPermit     ?? false,
      hasFlashMint:  data.hasFlashMint  ?? false,
      hasBlacklist:  data.hasBlacklist  ?? false,
      useRoles:      data.useRoles      ?? false,
      logoURI:       data.logoURI       ?? '',
    };

    const result = generateERC20Token(input);
    res.json({ source: result.source, contractName: result.contractName });
  } catch (error: any) {
    console.error('[tokenController] generateTokenContract error:', error);
    res.status(400).json({ error: error.message || 'Failed to generate token contract' });
  }
};





export const compileTokenContract = async (req: Request, res: Response) => {
  let finalSource       = '';
  let finalContractName = '';
  try {
    const { source, contractName, config } = req.body;

    if (source && typeof source === 'string' && source.trim().length > 0) {
      
      finalSource = source.trim();
      
      finalContractName = (contractName && typeof contractName === 'string' && contractName.trim())
        ? contractName.trim()
        : extractContractName(finalSource);
    } else if (config && typeof config === 'object') {
      
      if (!config.name?.trim() || !config.symbol?.trim() || !config.initialSupply) {
        return res.status(400).json({ error: 'config requires name, symbol, and initialSupply' });
      }
      const result = generateERC20Token(config as TokenGenerateInput);
      finalSource       = result.source;
      finalContractName = result.contractName;
    } else {
      return res.status(400).json({
        error: 'Provide { source, contractName } or { config }. source was empty or missing.',
      });
    }

    if (!finalSource.includes('pragma solidity')) {
      return res.status(400).json({ error: 'Invalid Solidity source — missing pragma statement' });
    }

    
    finalContractName = finalContractName.replace(/[^a-zA-Z0-9_]/g, '') || extractContractName(finalSource);

    console.log(`[tokenController] compiling "${finalContractName}" (${finalSource.length} chars)`);
    const compiled = await compileContract(finalSource, finalContractName);

    if (compiled.error) {
      console.error(`[tokenController] compile error for ${finalContractName}:`, compiled.error.slice(0, 600));
      return res.status(400).json({ error: compiled.error });
    }

    if (!compiled.bytecode || compiled.bytecode.length < 10) {
      return res.status(400).json({ error: 'Compilation produced empty bytecode' });
    }

    console.log(`[tokenController] ✓ ${finalContractName}: ${compiled.abi.length} ABI entries, ${Math.round(compiled.bytecode.length / 2 / 1024)}KB`);
    return res.json({
      abi:          compiled.abi,
      bytecode:     '0x' + compiled.bytecode.replace(/^0x/, ''),
      source:       finalSource,
      contractName: finalContractName,
      warnings:     compiled.warnings,
    });
  } catch (error: any) {
    const msg = error?.message || 'Unknown compilation error';
    console.error('[tokenController] compileTokenContract EXCEPTION:', msg, error?.stack?.slice(0, 400));
    return res.status(500).json({ error: `Compilation error: ${msg}` });
  }
};





export const saveTokenDeployment = async (req: Request, res: Response) => {
  try {
    const { userId, networkId, contractAddress, name, symbol, txHash } = req.body;

    if (!userId || !networkId || !contractAddress) {
      return res.status(400).json({ error: 'userId, networkId, and contractAddress are required' });
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
      return res.status(400).json({ error: 'Invalid contract address format' });
    }

    const deployment = {
      id: uuidv4(),
      userId,
      networkId: Number(networkId),
      contractAddress: contractAddress.toLowerCase(),
      contractType: 'ERC20',
      name: name || '',
      symbol: symbol || '',
      txHash: txHash || '',
      deployedAt: new Date().toISOString(),
    };

    await db.addDeployment(deployment);
    res.status(201).json({ success: true, deployment });
  } catch (error: any) {
    console.error('[tokenController] saveTokenDeployment error:', error);
    res.status(500).json({ error: error.message });
  }
};





export const getTokenTemplatesHandler = async (_req: Request, res: Response) => {
  try {
    res.json({ templates: getTokenTemplates() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const validateTokenHandler = async (req: Request, res: Response) => {
  try {
    const errors = validateToken(req.body);
    res.json({ valid: errors.length === 0, errors });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
