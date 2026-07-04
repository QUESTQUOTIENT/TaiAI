

import {
  generateTokenSource,
  validateTokenConfig,
  TOKEN_TEMPLATES,
  DEFAULT_TOKEN_CONFIG,
  type TokenConfig,
  type TokenTemplate,
} from '../../../packages/token-engine/dist/index.js';

export interface TokenGenerateInput {
  name: string;
  symbol: string;
  decimals?: number;
  initialSupply: string;
  isMintable?: boolean;
  isBurnable?: boolean;
  isPausable?: boolean;
  hasTax?: boolean;
  taxBps?: number;
  taxRecipient?: string;
  maxSupply?: string;
  
  isGovernance?: boolean;
  hasPermit?: boolean;
  hasFlashMint?: boolean;
  hasBlacklist?: boolean;
  useRoles?: boolean;
  logoURI?: string;
}

export interface TokenGenerateOutput {
  source: string;
  contractName: string;
  config: TokenConfig;
  estimatedDeploySize: number;  
}


export function generateERC20Token(input: TokenGenerateInput): TokenGenerateOutput {
  const config: TokenConfig = {
    ...DEFAULT_TOKEN_CONFIG,
    name:           input.name.trim(),
    symbol:         input.symbol.trim().toUpperCase(),
    decimals:       input.decimals     ?? 18,
    initialSupply:  input.initialSupply,
    isMintable:     input.isMintable   ?? false,
    isBurnable:     input.isBurnable   ?? false,
    isPausable:     input.isPausable   ?? false,
    hasTax:         input.hasTax       ?? false,
    taxBps:         input.taxBps       ?? 0,
    taxRecipient:   input.taxRecipient ?? '',
    maxSupply:      input.maxSupply,
    isGovernance:   input.isGovernance ?? false,
    hasPermit:      input.hasPermit    ?? false,
    hasFlashMint:   input.hasFlashMint ?? false,
    hasBlacklist:   input.hasBlacklist ?? false,
    useRoles:       input.useRoles     ?? false,
    logoURI:        input.logoURI      ?? '',
  };

  const errors = validateTokenConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid token config: ${errors.join('; ')}`);
  }

  const source = generateTokenSource(config);
  
  
  
  const contractName = config.name.replace(/[^a-zA-Z0-9_]/g, '').replace(/^[0-9]+/, '') || 'Token';

  return {
    source,
    contractName,
    config,
    estimatedDeploySize: source.length,
  };
}


export function getTokenTemplates(): TokenTemplate[] {
  return TOKEN_TEMPLATES;
}


export function validateToken(input: Partial<TokenConfig>): string[] {
  return validateTokenConfig(input);
}
