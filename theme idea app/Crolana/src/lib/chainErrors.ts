

export type SupportedChain = 'cronos' | 'solana';

export interface ParsedChainError {
  chain: SupportedChain;
  code: string;           
  title: string;          
  message: string;        
  suggestion?: string;    
  isRetryable: boolean;   
  isFatal: boolean;       
  raw?: unknown;          
}



export function parseChainError(err: unknown, chain: SupportedChain): ParsedChainError {
  const raw = err instanceof Error ? err : new Error(String(err));
  const message = raw.message ?? '';
  const data = (raw as any).data;

  if (chain === 'cronos') return parseEVMError(message, data, raw);
  return parseSolanaError(message, raw);
}



function parseEVMError(message: string, data: unknown, raw: unknown): ParsedChainError {
  const lower = message.toLowerCase();

  
  if (
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('user cancel') ||
    (raw as any)?.code === 4001
  ) {
    return {
      chain: 'cronos', code: 'USER_REJECTED',
      title: 'Transaction Cancelled',
      message: 'You rejected the transaction in your wallet.',
      isRetryable: true, isFatal: false, raw,
    };
  }

  
  if (lower.includes('gas') && (lower.includes('estimat') || lower.includes('limit') || lower.includes('required'))) {
    return {
      chain: 'cronos', code: 'GAS_ESTIMATION_FAILED',
      title: 'Gas Estimation Failed',
      message: 'The transaction could not be estimated. It may revert on-chain.',
      suggestion: 'Try increasing gas limit manually, or check that you have enough CRO and the contract state is valid.',
      isRetryable: true, isFatal: false, raw,
    };
  }

  
  if (lower.includes('insufficient funds') || lower.includes('not enough')) {
    return {
      chain: 'cronos', code: 'INSUFFICIENT_FUNDS',
      title: 'Insufficient Balance',
      message: 'You do not have enough CRO to pay for this transaction (gas + value).',
      suggestion: 'Add more CRO to your wallet and try again.',
      isRetryable: true, isFatal: false, raw,
    };
  }

  
  if (lower.includes('nonce') || lower.includes('replacement transaction underpriced')) {
    return {
      chain: 'cronos', code: 'NONCE_ERROR',
      title: 'Transaction Nonce Error',
      message: 'There is a nonce conflict with a pending transaction.',
      suggestion: 'Wait for pending transactions to clear, or reset your wallet account nonce.',
      isRetryable: true, isFatal: false, raw,
    };
  }

  
  if (lower.includes('revert') || lower.includes('execution reverted')) {
    const revertReason = extractRevertReason(message, data);
    return {
      chain: 'cronos', code: 'TX_REVERTED',
      title: 'Transaction Reverted',
      message: revertReason
        ? `Contract reverted: ${revertReason}`
        : 'The transaction was reverted by the contract.',
      suggestion: 'Check that you meet all conditions (whitelist, phase active, supply not exceeded, etc.).',
      isRetryable: false, isFatal: false, raw,
    };
  }

  
  if (lower.includes('network') || lower.includes('rpc') || lower.includes('timeout') || lower.includes('server') || lower.includes('502') || lower.includes('503')) {
    return {
      chain: 'cronos', code: 'NETWORK_ERROR',
      title: 'Network Error',
      message: 'Could not reach the Cronos network. Please check your connection.',
      suggestion: 'Check your internet connection and try again in a moment.',
      isRetryable: true, isFatal: false, raw,
    };
  }

  
  if (lower.includes('wrong network') || lower.includes('chain') || lower.includes('unsupported chain')) {
    return {
      chain: 'cronos', code: 'WRONG_NETWORK',
      title: 'Wrong Network',
      message: 'Your wallet is connected to the wrong network.',
      suggestion: 'Switch to Cronos Mainnet (Chain ID: 25) in your wallet.',
      isRetryable: true, isFatal: false, raw,
    };
  }

  
  if (lower.includes('not a contract') || lower.includes('invalid address') || lower.includes('no code')) {
    return {
      chain: 'cronos', code: 'INVALID_CONTRACT',
      title: 'Contract Not Found',
      message: 'The contract address is invalid or not deployed on this network.',
      suggestion: 'Verify the contract address and selected network.',
      isRetryable: false, isFatal: true, raw,
    };
  }

  
  return {
    chain: 'cronos', code: 'UNKNOWN_EVM_ERROR',
    title: 'Transaction Error',
    message: message || 'An unexpected error occurred on the Cronos network.',
    isRetryable: false, isFatal: false, raw,
  };
}

function extractRevertReason(message: string, data: unknown): string | null {
  
  const match = message.match(/reverted[^:]*:\s*(.+?)(?:\s*\(|$)/i);
  if (match) return match[1].trim();

  
  if (typeof data === 'string' && data.startsWith('0x08c379a0')) {
    try {
      const hex = data.slice(10); 
      const offset = parseInt(hex.slice(0, 64), 16) * 2;
      const length = parseInt(hex.slice(64, 128), 16) * 2;
      const encoded = hex.slice(128, 128 + length);
      const decoded = Buffer.from(encoded, 'hex').toString('utf8');
      return decoded;
    } catch {  }
  }
  return null;
}



function parseSolanaError(message: string, raw: unknown): ParsedChainError {
  const lower = message.toLowerCase();

  
  if (lower.includes('user rejected') || lower.includes('user cancel') || lower.includes('transaction was not confirmed')) {
    return {
      chain: 'solana', code: 'USER_REJECTED',
      title: 'Transaction Cancelled',
      message: 'You rejected the transaction in Phantom.',
      isRetryable: true, isFatal: false, raw,
    };
  }

  
  if (lower.includes('blockhash') && (lower.includes('not found') || lower.includes('expired'))) {
    return {
      chain: 'solana', code: 'BLOCKHASH_EXPIRED',
      title: 'Transaction Expired',
      message: 'The transaction blockhash expired before it was submitted.',
      suggestion: 'Rebuild and resubmit the transaction. This happens when signing takes too long.',
      isRetryable: true, isFatal: false, raw,
    };
  }

  
  if (lower.includes('insufficient') || lower.includes('0x1') || lower.includes('not enough sol') || lower.includes('lamport')) {
    return {
      chain: 'solana', code: 'INSUFFICIENT_SOL',
      title: 'Insufficient SOL',
      message: 'You do not have enough SOL to pay for this transaction and rent.',
      suggestion: 'Add more SOL to your wallet. Minting usually requires 0.01–0.05 SOL.',
      isRetryable: true, isFatal: false, raw,
    };
  }

  
  if (lower.includes('program error') || lower.includes('custom error') || lower.includes('0x')) {
    const code = extractSolanaProgramError(message);
    return {
      chain: 'solana', code: `PROGRAM_ERROR_${code ?? 'UNKNOWN'}`,
      title: 'Program Error',
      message: `The Solana program returned an error${code ? ` (code: ${code})` : ''}.`,
      suggestion: 'This may mean conditions were not met (e.g. collection verified, NFT already minted).',
      isRetryable: false, isFatal: false, raw,
    };
  }

  
  if (lower.includes('account') && (lower.includes('not found') || lower.includes('does not exist') || lower.includes('invalid'))) {
    return {
      chain: 'solana', code: 'ACCOUNT_NOT_FOUND',
      title: 'Account Not Found',
      message: 'A required account does not exist on-chain.',
      suggestion: 'The token account or program account may not be initialized.',
      isRetryable: false, isFatal: false, raw,
    };
  }

  
  if (lower.includes('simulation failed') || lower.includes('failed to simulate')) {
    return {
      chain: 'solana', code: 'SIMULATION_FAILED',
      title: 'Transaction Simulation Failed',
      message: 'The transaction failed during simulation before sending.',
      suggestion: 'Check your inputs. The transaction would likely fail on-chain too.',
      isRetryable: true, isFatal: false, raw,
    };
  }

  
  if (lower.includes('network') || lower.includes('timeout') || lower.includes('rpc') || lower.includes('503') || lower.includes('502')) {
    return {
      chain: 'solana', code: 'NETWORK_ERROR',
      title: 'Solana Network Error',
      message: 'Could not reach the Solana RPC endpoint.',
      suggestion: 'Check your connection or try again shortly.',
      isRetryable: true, isFatal: false, raw,
    };
  }

  
  if (lower.includes('phantom') || lower.includes('not connected') || lower.includes('wallet')) {
    return {
      chain: 'solana', code: 'WALLET_NOT_CONNECTED',
      title: 'Wallet Not Connected',
      message: 'Phantom wallet is not connected.',
      suggestion: 'Connect your Phantom wallet and try again.',
      isRetryable: true, isFatal: false, raw,
    };
  }

  return {
    chain: 'solana', code: 'UNKNOWN_SOLANA_ERROR',
    title: 'Solana Error',
    message: message || 'An unexpected error occurred on the Solana network.',
    isRetryable: false, isFatal: false, raw,
  };
}

function extractSolanaProgramError(message: string): string | null {
  const match = message.match(/0x([0-9a-fA-F]+)/);
  return match ? match[1] : null;
}




export function useChainErrorHandler(chain: SupportedChain) {
  const handleError = (
    err: unknown,
    onParsed?: (parsed: ParsedChainError) => void,
  ): ParsedChainError => {
    const parsed = parseChainError(err, chain);
    console.error(`[${chain} error]`, parsed.code, parsed.message, parsed.raw);
    onParsed?.(parsed);
    return parsed;
  };

  return { handleError, parseChainError: (err: unknown) => parseChainError(err, chain) };
}
