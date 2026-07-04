import { useState, useEffect, useMemo } from 'react';
import { getTokensPrices } from '../services/api/priceService';


export function useTokenPrices(tokenAddresses: string[], chainId: number): Map<string, number> {
  const [priceMap, setPriceMap] = useState<Map<string, number>>(new Map());

  const addresses = useMemo(() =>
    [...new Set(tokenAddresses.map(addr => addr.toLowerCase()))],
    [tokenAddresses]
  );

  useEffect(() => {
    let mounted = true;
    const fetchPrices = async () => {
      if (addresses.length === 0) {
        setPriceMap(new Map());
        return;
      }

      try {
        const prices = await getTokensPrices(addresses);
        if (mounted) {
          setPriceMap(prices);
        }
      } catch (error) {
        console.error('Failed to fetch token prices:', error);
        if (mounted) {
          setPriceMap(new Map());
        }
      }
    };

    fetchPrices();
    return () => { mounted = false; };
  }, [addresses, chainId]);

  return priceMap;
}


export function formatWithUsd(
  amountStr: string,
  tokenAddress: string,
  tokenDecimals: number,
  tokenSymbol: string,
  priceMap: Map<string, number>
): string {
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || !isFinite(amount)) return amountStr;

  const price = priceMap.get(tokenAddress.toLowerCase()) ?? 0;
  if (price === 0) return amountStr;

  const usdValue = amount * price;

  
  let usdFormatted: string;
  if (usdValue < 0.01) {
    usdFormatted = `< $0.01`;
  } else if (usdValue < 1) {
    usdFormatted = `$${usdValue.toFixed(4)}`;
  } else {
    usdFormatted = `$${usdValue.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return `${amountStr} ${tokenSymbol} ≈ ${usdFormatted}`;
}
