

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSolTokenList, NATIVE_SOL_MINT, type SolToken } from '../data/solanaTokens';
import { getSolBalance, getSplTokenAccounts, formatSol } from '../lib/solana';
import { getTokensPrices } from '../services/api/priceService';

const LAMPORTS_PER_SOL = 1_000_000_000;

export interface SolTokenBalance {
  token: SolToken;
  rawBalance: bigint;   
  formattedBalance: string;
  usdPrice?: number;   
  usdValue?: number;   
}

interface Result {
  balances: Map<string, SolTokenBalance>;  
  isLoading: boolean;
  refresh: () => void;
}

function formatSplAmount(amount: bigint, decimals: number): string {
  if (amount === 0n) return '0';
  const num = Number(amount) / 10 ** decimals;
  if (num < 0.000001) return '< 0.000001';
  return num.toFixed(6).replace(/\.?0+$/, '');
}

export function useSolanaTokens(
  walletAddress: string | null,
  cluster: string,
): Result {
  const [balances, setBalances] = useState<Map<string, SolTokenBalance>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    if (!walletAddress) {
      setBalances(new Map());
      return;
    }

    setIsLoading(true);
    try {
      const tokens = getSolTokenList(cluster);
      const map = new Map<string, SolTokenBalance>();

      
      try {
        const lamports = await getSolBalance(walletAddress, cluster);
        const raw = BigInt(lamports);
        const nativeToken = tokens.find(t => t.isNative)!;
        map.set(NATIVE_SOL_MINT.toLowerCase(), {
          token: nativeToken,
          rawBalance: raw,
          formattedBalance: formatSol(lamports, 4),
        });
      } catch {  }

      
      try {
        const splAccounts = await getSplTokenAccounts(walletAddress, cluster);
        for (const acc of splAccounts) {
          const known = tokens.find(t => t.mint.toLowerCase() === acc.mint.toLowerCase());
          if (!known) continue; 
          map.set(acc.mint.toLowerCase(), {
            token: known,
            rawBalance: BigInt(acc.amount),
            formattedBalance: formatSplAmount(BigInt(acc.amount), acc.decimals),
          });
        }
      } catch {  }

      
      const tokenAddresses = tokens.map(t => t.mint.toLowerCase());
      const priceMap = await getTokensPrices(tokenAddresses).catch(() => new Map());

      
      for (const [mint, balanceData] of map) {
        const price = priceMap.get(mint);
        if (price && balanceData.rawBalance > 0n) {
          const numericBalance = parseFloat(balanceData.formattedBalance.replace(/,/g, ''));
          map.set(mint, {
            ...balanceData,
            usdPrice: price,
            usdValue: isNaN(numericBalance) ? undefined : numericBalance * price,
          });
        }
      }

      setBalances(map);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, cluster]);

  useEffect(() => {
    fetchAll();
    timerRef.current = setInterval(fetchAll, 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchAll]);

  return { balances, isLoading, refresh: fetchAll };
}
