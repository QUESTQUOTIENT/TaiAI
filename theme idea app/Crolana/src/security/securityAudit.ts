

import { ethers } from 'ethers';





export interface SecurityAuditResult {
  passed: boolean;
  score: number;       
  issues: SecurityIssue[];
  warnings: string[];
  recommendations: string[];
}

export interface SecurityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  recommendation: string;
}






export function checkWalletIntegrity(): { safe: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (typeof window === 'undefined') return { safe: true, warnings };

  
  if (!(window as any).ethereum) {
    return { safe: false, warnings: ['No Web3 wallet detected'] };
  }

  
  const requiredMethods = ['request', 'on', 'removeListener'];
  for (const method of requiredMethods) {
    if (typeof ((window as any).ethereum as any)[method] !== 'function') {
      warnings.push(`Wallet provider missing method: ${method}`);
    }
  }

  
  if (((window as any).ethereum as any).providers?.length > 3) {
    warnings.push('Unusual number of wallet providers detected. Ensure you trust all installed extensions.');
  }

  
  const knownWallet = (window as any).ethereum.isMetaMask ||
    (window as any).ethereum.isCryptoCom ||
    (window as any).ethereum.isCoinbaseWallet ||
    (window as any).ethereum.isTrust ||
    (window as any).ethereum.isWalletConnect;

  if (!knownWallet) {
    warnings.push('Unrecognized wallet provider. Verify you are using a trusted wallet.');
  }

  return { safe: warnings.length === 0, warnings };
}






export async function safeApprove(
  signer: ethers.JsonRpcSigner,
  tokenAddress: string,
  spenderAddress: string,
  exactAmount: bigint,
  trustedSpender = false,
): Promise<{ txHash: string; approvedAmount: bigint }> {
  
  const provider = signer.provider!;
  const code = await provider.getCode(spenderAddress);
  if (code === '0x') {
    throw new Error(`SECURITY: Spender ${spenderAddress} is not a contract. Approval rejected.`);
  }

  
  const approveAmount = trustedSpender ? exactAmount : exactAmount;

  const token = new ethers.Contract(
    tokenAddress,
    ['function approve(address spender, uint256 amount) returns (bool)'],
    signer,
  );

  const tx = await token.approve(spenderAddress, approveAmount);
  const receipt = await tx.wait();
  return { txHash: receipt.hash, approvedAmount: approveAmount };
}





const usedNonces = new Set<string>();

export function generateSecureNonce(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function markNonceUsed(nonce: string): void {
  usedNonces.add(nonce);
}

export function isNonceUsed(nonce: string): boolean {
  return usedNonces.has(nonce);
}

export function buildSignMessage(address: string, nonce: string, domain: string, timestamp: number): string {
  return [
    `Sign in to ${domain}`,
    ``,
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued: ${new Date(timestamp).toISOString()}`,
    `Expires: ${new Date(timestamp + 5 * 60 * 1000).toISOString()}`,
  ].join('\n');
}

export function verifySignatureReplay(nonce: string, timestamp: number): { valid: boolean; reason?: string } {
  if (isNonceUsed(nonce)) return { valid: false, reason: 'Nonce already used (replay attack)' };
  if (Date.now() - timestamp > 5 * 60 * 1000) return { valid: false, reason: 'Signature expired' };
  return { valid: true };
}





const MAX_SAFE_SLIPPAGE_BPS = 500; 
const MIN_SLIPPAGE_BPS = 10;       

export interface SlippageValidation {
  safe: boolean;
  effectiveSlippageBps: number;
  warning?: string;
}

export function validateSlippage(requestedBps: number): SlippageValidation {
  if (requestedBps > MAX_SAFE_SLIPPAGE_BPS) {
    return {
      safe: false,
      effectiveSlippageBps: MAX_SAFE_SLIPPAGE_BPS,
      warning: `Slippage capped at ${MAX_SAFE_SLIPPAGE_BPS / 100}%. High slippage enables sandwich attacks.`,
    };
  }

  if (requestedBps < MIN_SLIPPAGE_BPS) {
    return {
      safe: true,
      effectiveSlippageBps: MIN_SLIPPAGE_BPS,
      warning: `Slippage raised to ${MIN_SLIPPAGE_BPS / 100}% minimum to prevent failed transactions.`,
    };
  }

  return { safe: true, effectiveSlippageBps: requestedBps };
}


export function validateSwapOutput(
  expectedOut: bigint,
  actualOut: bigint,
  slippageBps: number,
): { valid: boolean; actualSlippage: number; reason?: string } {
  if (actualOut === 0n) return { valid: false, actualSlippage: 100, reason: 'No output received' };

  const minAcceptable = (expectedOut * BigInt(10000 - slippageBps)) / 10000n;
  const actualSlippage = expectedOut > 0n
    ? ((Number(expectedOut) - Number(actualOut)) / Number(expectedOut)) * 100
    : 0;

  if (actualOut < minAcceptable) {
    return {
      valid: false,
      actualSlippage,
      reason: `Output ${actualSlippage.toFixed(2)}% below expected. Possible sandwich attack.`,
    };
  }

  return { valid: true, actualSlippage };
}





export function auditContractSource(source: string): SecurityAuditResult {
  const issues: SecurityIssue[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  
  const hasReentrancyGuard = source.includes('ReentrancyGuard') || source.includes('nonReentrant');
  const hasExternalCalls = source.includes('.call{') || source.includes('.transfer(') || source.includes('.send(');
  if (hasExternalCalls && !hasReentrancyGuard) {
    issues.push({
      severity: 'critical',
      category: 'Reentrancy',
      description: 'Contract has external calls without ReentrancyGuard',
      recommendation: 'Add OpenZeppelin ReentrancyGuard and nonReentrant modifier to all state-changing functions',
    });
  }

  
  const hasOwnable = source.includes('Ownable') || source.includes('onlyOwner');
  const hasSensitiveFunctions = ['withdraw', 'mint', 'pause', 'setBaseURI', 'setCost'].some(fn =>
    source.includes(`function ${fn}`),
  );
  if (hasSensitiveFunctions && !hasOwnable) {
    issues.push({
      severity: 'high',
      category: 'Access Control',
      description: 'Privileged functions found without access control',
      recommendation: 'Use OpenZeppelin Ownable or AccessControl for admin functions',
    });
  }

  
  const solidityVersion = source.match(/pragma solidity \^?(\d+\.\d+)/)?.[1];
  if (solidityVersion && parseFloat(solidityVersion) < 0.8) {
    issues.push({
      severity: 'high',
      category: 'Integer Overflow',
      description: 'Solidity <0.8 detected — no built-in overflow protection',
      recommendation: 'Upgrade to Solidity 0.8+ or use SafeMath library',
    });
  }

  
  if (source.includes('tx.origin')) {
    issues.push({
      severity: 'high',
      category: 'Phishing',
      description: 'Use of tx.origin detected — vulnerable to phishing attacks',
      recommendation: 'Replace tx.origin with msg.sender for authentication',
    });
  }

  
  const hasHardcodedKeys = /0x[0-9a-f]{64}/i.test(source) && source.includes('private');
  if (hasHardcodedKeys) {
    issues.push({
      severity: 'critical',
      category: 'Key Exposure',
      description: 'Potential hardcoded private key detected in contract source',
      recommendation: 'Never hardcode private keys. Use environment variables.',
    });
  }

  
  if (source.includes('function withdraw')) {
    if (!source.includes('require(success') && !source.includes('call{value:')) {
      issues.push({
        severity: 'medium',
        category: 'Withdrawal',
        description: 'Withdraw function may not check call success',
        recommendation: 'Always check success of low-level calls: (bool success,) = payable(to).call{value: amount}("")',
      });
    }
  }

  
  if (!source.includes('ERC2981') && !source.includes('royaltyInfo')) {
    warnings.push('No ERC-2981 royalty standard detected. Marketplaces may not honor creator royalties.');
    recommendations.push('Implement ERC-2981 for standardized royalty support across all marketplaces.');
  }

  
  if (!source.includes('event ')) {
    warnings.push('No events emitted. Transactions will be harder to track.');
    recommendations.push('Add events for all state changes: mints, transfers, ownership changes.');
  }

  
  let score = 100;
  issues.forEach((issue) => {
    if (issue.severity === 'critical') score -= 25;
    else if (issue.severity === 'high') score -= 15;
    else if (issue.severity === 'medium') score -= 8;
    else score -= 3;
  });
  score -= warnings.length * 2;
  score = Math.max(0, score);

  return {
    passed: issues.filter((i) => i.severity === 'critical' || i.severity === 'high').length === 0,
    score,
    issues,
    warnings,
    recommendations,
  };
}





export async function simulateTransaction(
  provider: ethers.BrowserProvider,
  tx: ethers.TransactionRequest,
): Promise<{ success: boolean; gasEstimate: bigint; revertReason?: string }> {
  try {
    const gasEstimate = await provider.estimateGas(tx);
    return { success: true, gasEstimate };
  } catch (err: any) {
    const revertReason = err.reason || err.message || 'Transaction would revert';
    return { success: false, gasEstimate: 0n, revertReason };
  }
}





export function validateAddress(address: string): { valid: boolean; checksummed?: string; reason?: string } {
  if (!address || !address.startsWith('0x')) return { valid: false, reason: 'Address must start with 0x' };
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return { valid: false, reason: 'Address must be 42 hex characters' };

  try {
    const checksummed = ethers.getAddress(address);
    return { valid: true, checksummed };
  } catch {
    return { valid: false, reason: 'Invalid address checksum' };
  }
}

export function isSafeAddress(address: string): boolean {
  const { valid } = validateAddress(address);
  return valid && address !== ethers.ZeroAddress;
}





const txTimestamps: number[] = [];
const MAX_TX_PER_MINUTE = 10;

export function checkRateLimit(): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  
  while (txTimestamps.length > 0 && txTimestamps[0] < oneMinuteAgo) txTimestamps.shift();

  const remaining = MAX_TX_PER_MINUTE - txTimestamps.length;
  const resetIn = txTimestamps.length > 0 ? Math.ceil((txTimestamps[0] + 60000 - now) / 1000) : 0;

  if (remaining <= 0) return { allowed: false, remaining: 0, resetIn };

  txTimestamps.push(now);
  return { allowed: true, remaining: remaining - 1, resetIn: 0 };
}





const TRUSTED_DOMAINS = [
  'crolana.app',
  'vvs.finance',
  'app.vvs.finance',
  'minted.network',
  'app.ebisusbay.com',
  'opensea.io',
  'explorer.cronos.org',
  'cronoscan.com',
  'ipfs.io',
  'gateway.lighthouse.storage',
  'pinata.cloud',
  'infura.io',
];

export function isUrlTrusted(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return TRUSTED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export function detectPhishingUrl(url: string): { safe: boolean; reason?: string } {
  const trusted = isUrlTrusted(url);
  if (!trusted) {
    return {
      safe: false,
      reason: `URL ${url} is not in the trusted domain list. Verify before proceeding.`,
    };
  }
  return { safe: true };
}





export async function runFullSecurityCheck(
  contractSource?: string,
  provider?: ethers.BrowserProvider,
): Promise<{
  walletIntegrity: ReturnType<typeof checkWalletIntegrity>;
  contractAudit?: SecurityAuditResult;
  overallScore: number;
  summary: string;
}> {
  const walletIntegrity = checkWalletIntegrity();
  const contractAudit = contractSource ? auditContractSource(contractSource) : undefined;

  let overallScore = walletIntegrity.safe ? 100 : 60;
  if (contractAudit) overallScore = Math.floor((overallScore + contractAudit.score) / 2);

  const summary = [
    `Wallet: ${walletIntegrity.safe ? '✓ Secure' : '⚠ Issues found'}`,
    contractAudit ? `Contract: ${contractAudit.passed ? '✓ Passed' : '⚠ Issues found'} (score: ${contractAudit.score}/100)` : '',
    `Overall Security Score: ${overallScore}/100`,
  ].filter(Boolean).join(' | ');

  return { walletIntegrity, contractAudit, overallScore, summary };
}
