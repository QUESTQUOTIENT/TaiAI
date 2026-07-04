

import { ethers } from 'ethers';

export interface TokenSecurityReport {
  address: string;
  symbol: string;
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  score: number; 
  checks: SecurityCheck[];
  summary: string;
  recommendations: string[];
}

export interface SecurityCheck {
  name: string;
  passed: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low';
  detail: string;
}


const SAFE_TOKENS = new Set<string>([
  '0x5c7f8a570d578ed84e63fdfa7b1ee72deae1ae23', 
  '0xc21223249ca28397b4b6541dffaecc539bff0c59', 
  '0x66e428c3f67a68878562e79a0234c1f83c208770', 
  '0xf2001b145b43032af5ee2884e456ccd805f677d', 
  '0xe44fd7fcb2b1581822d0c862b68222998a0c299a', 
  '0x062e66477faf219f25d27dced647bf57c3107d52', 
]);

export async function analyzeTokenSecurity(
  tokenAddress: string,
  provider: ethers.JsonRpcProvider | ethers.BrowserProvider,
  nativeCurrencySymbol: string = 'ETH' 
): Promise<TokenSecurityReport> {
  const checks: SecurityCheck[] = [];
  const recommendations: string[] = [];

  
  const normalized = tokenAddress.toLowerCase();

  
  if (SAFE_TOKENS.has(normalized)) {
    return {
      address: tokenAddress,
      symbol: 'Unknown',
      riskLevel: 'safe',
      score: 100,
      checks: [{ name: 'Whitelist', passed: true, severity: 'low', detail: 'Token is on trusted whitelist' }],
      summary: 'Token is on the trusted whitelist. Very low risk.',
      recommendations: [],
    };
  }

  try {
    
    const code = await provider.getCode(tokenAddress);
    const balance = await provider.getBalance(tokenAddress);
    const blockNum = await provider.getBlockNumber();

    
    if (code === '0x' || code === '0x0') {
      return {
        address: tokenAddress,
        symbol: 'N/A',
        riskLevel: 'critical',
        score: 0,
        checks: [{ name: 'Contract Exists', passed: false, severity: 'critical', detail: 'No contract at this address' }],
        summary: 'No contract deployed at this address.',
        recommendations: ['Verify the token address is correct'],
      };
    }

    
    const isContract = code.length > 2;
    checks.push({
      name: 'Contract Deployment',
      passed: isContract,
      severity: isContract ? 'low' : 'critical',
      detail: isContract ? 'Contract exists at address' : 'No contract code found',
    });

    
    let symbol = 'Unknown';
    let decimals = 18;
    let totalSupply: bigint | null = null;
    try {
      const token = new ethers.Contract(
        tokenAddress,
        ['function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function totalSupply() view returns (uint256)'],
        provider
      );
      symbol = await token.symbol().catch(() => 'Unknown');
      decimals = await token.decimals().catch(() => 18);
      totalSupply = await token.totalSupply().catch(() => null);
    } catch {
      
    }

    
    if (totalSupply !== null && totalSupply === 0n) {
      checks.push({
        name: 'Total Supply',
        passed: false,
        severity: 'high',
        detail: 'Token has zero total supply — likely not initialized or suspicious',
      });
      recommendations.push('Token has no supply. Verify this is a legitimate token before swapping.');
    } else {
      checks.push({
        name: 'Total Supply',
        passed: true,
        severity: 'low',
        detail: totalSupply ? `Supply: ${ethers.formatUnits(totalSupply, decimals)}` : 'Unknown',
      });
    }

    
    const balanceInEth = ethers.formatEther(balance);
    if (balance < ethers.parseEther('0.01')) {
      checks.push({
        name: 'Contract Balance',
        passed: false,
        severity: 'medium',
        detail: `Contract ${nativeCurrencySymbol} balance is low (${balanceInEth} ${nativeCurrencySymbol})`,
      });
      recommendations.push('Low contract balance could indicate a honeypot. Proceed with caution.');
    } else {
      checks.push({
        name: 'Contract Balance',
        passed: true,
        severity: 'low',
        detail: `Contract has ${balanceInEth} ${nativeCurrencySymbol}`,
      });
    }

    
    const bytecode = code.toLowerCase();

    
    const hasMintablePattern = bytecode.includes('mint') || bytecode.includes('_mint');
    checks.push({
      name: 'Mintable',
      passed: !hasMintablePattern, 
      severity: hasMintablePattern ? 'high' : 'low',
      detail: hasMintablePattern ? 'Token has mint functionality — supply can increase indefinitely' : 'No mint function detected',
    });
    if (hasMintablePattern) {
      recommendations.push('This token is mintable. Supply can increase unexpectedly, devaluing your holdings.');
    }

    
    
    const hasTransferFee = bytecode.includes('take') && bytecode.includes('fee') || bytecode.includes('tax');
    checks.push({
      name: 'Transfer Fee',
      passed: !hasTransferFee,
      severity: hasTransferFee ? 'high' : 'low',
      detail: hasTransferFee ? 'Token may charge fees on transfers' : 'No transfer fee patterns detected',
    });
    if (hasTransferFee) {
      recommendations.push('Token appears to charge transfer fees. This can eat into your profits when trading.');
    }

    
    const hasBlacklist = bytecode.includes('blacklist') || bytecode.includes('isblacklisted') || bytecode.includes('blocked');
    const hasWhitelist = bytecode.includes('whitelist');
    const hasMaxTxAmount = bytecode.includes('maxtransfer') || bytecode.includes('maxamount') || bytecode.includes('_maxTxAmount');

    if (hasBlacklist) {
      checks.push({
        name: 'Blacklist',
        passed: false,
        severity: 'critical',
        detail: 'Token implements blacklisting — can block specific addresses from transferring',
      });
      recommendations.push('CRITICAL: This token has blacklist functionality. The owner can prevent you from selling.');
    } else {
      checks.push({
        name: 'Blacklist',
        passed: true,
        severity: 'low',
        detail: 'No blacklist detected',
      });
    }

    if (hasWhitelist && !hasBlacklist) {
      checks.push({
        name: 'Whitelist',
        passed: true,
        severity: 'low',
        detail: 'Token uses whitelist (may be for gas-free transfers)',
      });
    }

    if (hasMaxTxAmount) {
      checks.push({
        name: 'Max Transaction Limit',
        passed: true,
        severity: 'medium',
        detail: 'Token has maximum transaction amount limits',
      });
      recommendations.push('Token has max transaction limits. This can prevent large sells but also may restrict your ability to exit.');
    }

    
    const isProxy = bytecode.includes('delegatecall') || bytecode.includes('implementation') || bytecode.includes('admin');
    if (isProxy) {
      checks.push({
        name: 'Upgradeable',
        passed: true,
        severity: 'medium',
        detail: 'Token appears to be upgradeable (proxy pattern)',
      });
      recommendations.push('Token is upgradeable. Owner can change contract logic. Ensure the proxy admin is reputable or renounced.');
    }

    
    let isOwnershipRenounced = false;
    try {
      const token = new ethers.Contract(
        tokenAddress,
        ['function owner() view returns (address)'],
        provider
      );
      const owner = await token.owner().catch(() => null);
      if (owner && ethers.getAddress(owner) === ethers.ZeroAddress) {
        isOwnershipRenounced = true;
      }
    } catch {
      
    }

    if (isOwnershipRenounced) {
      checks.push({
        name: 'Ownership',
        passed: true,
        severity: 'low',
        detail: 'Ownership has been renounced — immutable contract',
      });
    } else {
      checks.push({
        name: 'Ownership',
        passed: false,
        severity: 'medium',
        detail: 'Contract has an owner who can modify parameters',
      });
      recommendations.push('Contract has an active owner. Research the project team and ensure they are trustworthy.');
    }

    
    let score = 100;
    let criticalCount = 0;
    let highCount = 0;

    checks.forEach(check => {
      if (!check.passed) {
        if (check.severity === 'critical') {
          score -= 30;
          criticalCount++;
        } else if (check.severity === 'high') {
          score -= 15;
          highCount++;
        } else if (check.severity === 'medium') {
          score -= 8;
        } else {
          score -= 3;
        }
      }
    });

    score = Math.max(0, Math.min(100, score));

    
    let riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical' = 'safe';
    if (criticalCount > 0) riskLevel = 'critical';
    else if (highCount > 0) riskLevel = 'high';
    else if (score < 70) riskLevel = 'medium';
    else if (score < 90) riskLevel = 'low';

    
    const passedCount = checks.filter(c => c.passed).length;
    const totalCount = checks.length;
    let summary = `Security scan complete: ${passedCount}/${totalCount} checks passed. Risk level: ${riskLevel.toUpperCase()}. Score: ${score}/100.`;

    if (criticalCount > 0) {
      summary += ' CRITICAL ISSUES FOUND — DO NOT SWAP unless you fully understand the risks.';
    } else if (highCount > 0) {
      summary += ' High-risk issues detected. Exercise extreme caution.';
    } else if (score < 70) {
      summary += ' Some concerns detected. Research the token thoroughly before swapping.';
    } else {
      summary += ' No major red flags detected.';
    }

    return {
      address: tokenAddress,
      symbol,
      riskLevel,
      score,
      checks,
      summary,
      recommendations,
    };

  } catch (error: any) {
    console.error('Token security analysis failed:', error);
    return {
      address: tokenAddress,
      symbol: 'Error',
      riskLevel: 'high',
      score: 30,
      checks: [{ name: 'Analysis Failed', passed: false, severity: 'high', detail: error.message }],
      summary: `Security analysis failed: ${error.message}`,
      recommendations: ['Unable to complete analysis. Verify the token address and try again.'],
    };
  }
}


export async function isTokenSafeToTrade(
  tokenAddress: string,
  provider: ethers.JsonRpcProvider | ethers.BrowserProvider
): Promise<{ safe: boolean; reason?: string; score: number }> {
  const report = await analyzeTokenSecurity(tokenAddress, provider);

  
  if (report.riskLevel === 'critical' || report.riskLevel === 'high' || report.score < 50) {
    return {
      safe: false,
      reason: `Token security score ${report.score}/100 (${report.riskLevel}). ${report.summary}`,
      score: report.score,
    };
  }

  return { safe: true, score: report.score };
}
