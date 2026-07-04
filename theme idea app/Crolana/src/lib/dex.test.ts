import { describe, it, expect } from 'vitest';
import {
  isNativeCRO,
  buildSwapPath,
  parseAmount,
  formatAmount,
  applySlippage,
  getDeadline,
  calcPriceImpact,
} from './dex';
import { NATIVE_CRO_ADDRESS, getWCROAddress } from '../data/tokens';

describe('isNativeCRO', () => {
  it('identifies native CRO address (lowercase)', () => {
    expect(isNativeCRO(NATIVE_CRO_ADDRESS.toLowerCase())).toBe(true);
  });

  it('identifies native CRO address (uppercase)', () => {
    expect(isNativeCRO(NATIVE_CRO_ADDRESS.toUpperCase())).toBe(true);
  });

  it('rejects other addresses', () => {
    expect(isNativeCRO('0x1234567890123456789012345678901234567890')).toBe(false);
    expect(isNativeCRO('')).toBe(false);
  });
});

describe('buildSwapPath', () => {
  const chainId = 25; 
  const wcro = getWCROAddress(chainId).toLowerCase();

  it('routes CRO -> token directly through WCRO', () => {
    const path = buildSwapPath(NATIVE_CRO_ADDRESS, '0xTokenAddress', chainId);
    expect(path).toEqual([wcro, '0xtokenaddress']);
  });

  it('routes token -> CRO directly through WCRO', () => {
    const path = buildSwapPath('0xTokenAddress', NATIVE_CRO_ADDRESS, chainId);
    expect(path).toEqual(['0xtokenaddress', wcro]);
  });

  it('routes ERC20 -> ERC20 through WCRO hub', () => {
    const path = buildSwapPath('0xTokenA', '0xTokenB', chainId);
    expect(path).toEqual(['0xtokena', wcro, '0xtokenb']);
  });

  it('handles same token (returns single element)', () => {
    const path = buildSwapPath(wcro, wcro, chainId);
    expect(path).toEqual([wcro]);
  });

  it('handles wcro as input to another token', () => {
    const path = buildSwapPath(wcro, '0xOtherToken', chainId);
    expect(path).toEqual([wcro, '0xothertoken']);
  });
});

describe('parseAmount', () => {
  it('parses valid decimal string', () => {
    
    expect(parseAmount('123.456', 18)).toBe(BigInt('123456000000000000000'));
  });

  it('parses integer string', () => {
    expect(parseAmount('100', 18)).toBe(BigInt('100000000000000000000'));
  });

  it('returns 0 for empty string', () => {
    expect(parseAmount('', 18)).toBe(0n);
  });

  it('returns 0 for invalid input', () => {
    expect(parseAmount('abc', 18)).toBe(0n);
  });

  it('handles 0 decimals', () => {
    expect(parseAmount('123', 0)).toBe(BigInt('123'));
  });

  it('respects different decimals', () => {
    
    expect(parseAmount('1.5', 6)).toBe(BigInt('1500000'));
  });
});

describe('formatAmount', () => {
  it('formats zero', () => {
    expect(formatAmount(0n, 18)).toBe('0');
  });

  it('formats with default precision', () => {
    
    expect(formatAmount(BigInt('123456789000000000'), 18)).toBe('0.123457');
  });

  it('trims trailing zeros', () => {
    expect(formatAmount(BigInt('1000000000000000000'), 18, 6)).toBe('1');
  });

  it('shows < 0.000001 for very small amounts', () => {
    const tiny = BigInt('1'); 
    expect(formatAmount(tiny, 18)).toBe('< 0.000001');
  });

  it('respects custom precision', () => {
    const amount = BigInt('123456789000000000'); 
    expect(formatAmount(amount, 18, 4)).toBe('0.1235');
  });
});

describe('applySlippage', () => {
  it('applies 0.5% slippage (50 bps) to amountOut', () => {
    
    const result = applySlippage(BigInt('1000'), 50);
    
    expect(result).toBe(BigInt('995'));
  });

  it('applies 1% slippage (100 bps)', () => {
    const result = applySlippage(BigInt('1000'), 100);
    expect(result).toBe(BigInt('990'));
  });

  it('returns 0 for tiny amount with slippage (floor division)', () => {
    const result = applySlippage(BigInt('1'), 50);
    
    expect(result).toBe(0n);
  });

  it('handles zero amount', () => {
    const result = applySlippage(0n, 50);
    expect(result).toBe(0n);
  });
});

describe('getDeadline', () => {
  it('returns a timestamp minutes in the future', () => {
    const now = Math.floor(Date.now() / 1000);
    const deadline = getDeadline(20);
    expect(deadline).toBeGreaterThan(now + 19 * 60);
    expect(deadline).toBeLessThan(now + 21 * 60);
  });
});

describe('calcPriceImpact', () => {
  it('calculates tiny impact for large pool', () => {
    
    const amountIn = BigInt('100');
    const amountOut = BigInt('99'); 
    const reserveIn = BigInt('1000000'); 
    const reserveOut = BigInt('1000000'); 
    const impact = calcPriceImpact(amountIn, amountOut, reserveIn, reserveOut);
    
    expect(impact).toBeCloseTo(1, 0);
  });

  it('calculates higher impact for small pool', () => {
    const amountIn = BigInt('100');
    const amountOut = BigInt('80'); 
    const reserveIn = BigInt('1000');
    const reserveOut = BigInt('1000');
    const impact = calcPriceImpact(amountIn, amountOut, reserveIn, reserveOut);
    
    expect(impact).toBeGreaterThan(5);
  });

  it('returns 0 for zero reserves', () => {
    const impact = calcPriceImpact(BigInt('100'), BigInt('50'), 0n, 0n);
    expect(impact).toBe(0);
  });
});
