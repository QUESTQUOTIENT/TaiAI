import { Request, Response, NextFunction } from 'express';





type ValidatorFn = (value: unknown) => { success: boolean; error?: string; data?: any };

export function isEthAddress(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  return /^0x[0-9a-fA-F]{40}$/.test(v);
}
export function isPositiveNumber(v: unknown): boolean {
  return typeof v === 'number' && isFinite(v) && v > 0;
}
export function isValidChainId(v: unknown): boolean {
  return v === 25 || v === 338 || v === '25' || v === '338';
}

export function validateContractConfig(body: any): string[] {
  const errors: string[] = [];
  if (!body) return ['Request body is required'];
  if (!body.name?.trim()) errors.push('name is required');
  if (!body.symbol?.trim()) errors.push('symbol is required');
  if (!['ERC721', 'ERC721A', 'ERC1155'].includes(body.type)) errors.push('type must be ERC721, ERC721A, or ERC1155');
  if (!body.supply) {
    errors.push('supply config is required');
  } else {
    if (!Number.isInteger(body.supply.maxSupply) || body.supply.maxSupply < 1)
      errors.push('supply.maxSupply must be a positive integer');
    if (body.supply.maxPerWallet !== undefined && (!Number.isInteger(body.supply.maxPerWallet) || body.supply.maxPerWallet < 0))
      errors.push('supply.maxPerWallet must be a non-negative integer');
  }
  return errors;
}

export function validateMerkleBody(body: any): string[] {
  const errors: string[] = [];
  if (!body?.addresses) return ['addresses array is required'];
  if (!Array.isArray(body.addresses)) errors.push('addresses must be an array');
  else {
    const invalid = body.addresses.filter((a: any) => !isEthAddress(a));
    if (invalid.length > 0) errors.push(`${invalid.length} invalid Ethereum address(es) found`);
    if (body.addresses.length === 0) errors.push('addresses array cannot be empty');
  }
  return errors;
}

export function validateSwapQuoteBody(body: any): string[] {
  const errors: string[] = [];
  if (!body?.tokenIn) errors.push('tokenIn address required');
  else if (!isEthAddress(body.tokenIn) && body.tokenIn !== '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE')
    errors.push('tokenIn must be a valid address');
  if (!body?.tokenOut) errors.push('tokenOut address required');
  else if (!isEthAddress(body.tokenOut) && body.tokenOut !== '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE')
    errors.push('tokenOut must be a valid address');
  if (!body?.amountIn) errors.push('amountIn required');
  if (!isValidChainId(body?.chainId)) errors.push('chainId must be 25 (mainnet) or 338 (testnet)');
  return errors;
}

export function validateIPFSConfig(body: any): string[] {
  const errors: string[] = [];
  if (!body?.provider) errors.push('provider is required');
  if (!['pinata', 'infura', 'lighthouse', 'manual'].includes(body?.provider))
    errors.push('provider must be pinata, infura, lighthouse, or manual');
  return errors;
}


export function zodGuard(validator: (body: any) => string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors = validator(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    next();
  };
}
