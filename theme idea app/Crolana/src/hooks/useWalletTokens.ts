

import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { getReadProvider } from '../lib/provider';
import { getTokenList, NATIVE_CRO_ADDRESS, type Token } from '../data/tokens';
import { ERC20_ABI, formatAmount } from '../lib/dex';
import { getTokensPrices } from '../services/api/priceService';

export interface WalletTokenBalance {
  token: Token;
  rawBalance: bigint;
  formattedBalance: string;
  usdValue?: number;
  usdPrice?: number; 
}

interface UseWalletTokensResult {
  balances: Map<string, WalletTokenBalance>;
  isLoading: boolean;
  refresh: () => void;
}

const REFRESH_INTERVAL_MS = 30_000;

export function useWalletTokens(
  walletAddress: string | null,
  chainId: number,
): UseWalletTokensResult {
  const [balances, setBalances] = useState<Map<string, WalletTokenBalance>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    if (!walletAddress) {
      setBalances(new Map());
      return;
    }

    setIsLoading(true);
    try {
      
      const provider = getReadProvider(chainId);
      const tokens = getTokenList(chainId);

      
      const balanceResults = await Promise.allSettled(
        tokens.map(async (token): Promise<[string, WalletTokenBalance]> => {
          let raw: bigint;

          if (token.isNative || token.address.toLowerCase() === NATIVE_CRO_ADDRESS.toLowerCase()) {
            raw = await provider.getBalance(walletAddress);
          } else {
            const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
            raw = await contract.balanceOf(walletAddress);
          }

          return [
            token.address.toLowerCase(),
            {
              token,
              rawBalance: raw,
              formattedBalance: formatAmount(raw, token.decimals, 6),
            },
          ];
        }),
      );

      
      const tokenAddresses = tokens.map(t => t.address.toLowerCase());

      
      const priceMap = await getTokensPrices(tokenAddresses).catch(() => new Map());

      const map = new Map<string, WalletTokenBalance>();
      for (const result of balanceResults) {
        if (result.status === 'fulfilled') {
          const [addr, data] = result.value;
          const price = priceMap.get(addr);
          map.set(addr, {
            ...data,
            usdPrice: price,
            usdValue: price && data.rawBalance > 0n
              ? (parseFloat(data.formattedBalance) * price)
              : undefined,
          });
        }
      }
      setBalances(map);
    } catch (err) {
      console.error('[useWalletTokens] fetch error:', err);
      
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, chainId]);

  useEffect(() => {
    fetchAll();

    timerRef.current = setInterval(fetchAll, REFRESH_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchAll]);

  return { balances, isLoading, refresh: fetchAll };
}
