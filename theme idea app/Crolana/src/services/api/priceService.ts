

interface PriceData {
  price: number;
  lastUpdated: number;
}


const STABLECOIN_IDS = new Set([
  'usd-coin',      
  'tether',        
  'dai',           
  'usdp',          
  'true-usd',      
  'dai',           
  'fei-usd',       
  'frax',          
  'lusd',          
]);


const TOKEN_ID_MAP: Record<string, string> = {
  
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': 'crypto-com-chain',
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE': 'crypto-com-chain',

  
  '0x5c7f8a570d578ed84e63fdfa7b1ee72deae1ae23': 'crypto-com-chain',
  '0x6a3173618859c7cd40faf6921b5e9eb6a76f1fd': 'crypto-com-chain', 

  
  '0xc21223249ca28397b4b6541dffaecc539bff0c59': 'usd-coin',
  
  '0x66e428c3f67a68878562e79a0234c1f83c208770': 'tether',
  
  '0xf2001b145b43032af5ee2884e456ccd805f677d': 'dai',
  
  '0xe44fd7fcb2b1581822d0c862b68222998a0c299a': 'wrapped-ethereum',
  
  '0x062e66477faf219f25d27dced647bf57c3107d52': 'wrapped-bitcoin',
  
  '0x2d03bece6747adc00e1a131bba1469c15fd11e03': 'vvs-finance',
  '0x2D03bECE6747ADC00E1a131BBA1469C15fD11e03': 'vvs-finance',
  
  '0xdd73dea10abc2bff99c60882ec5b2b81bb1dc5b1': 'tectonic',
  '0xDD73dEa10ABC2Bff99c60882EC5b2B81Bb1Dc5B1': 'tectonic',
  
  '0xadbd1231fb360047525bedf962581f3eee7b49fe': 'beefy-finance',
  '0xAdbd1231fb360047525BEdF962581F3eee7b49fe': 'beefy-finance',
  
  '0xb888d8dd1733d72681b30c00ee76bde93ae7aa93': 'cosmos-hub',
  '0xB888d8Dd1733d72681b30c00ee76BDE93ae7aa93': 'cosmos-hub',

  
  'so11111111111111111111111111111111111111112': 'solana',
  'epjfwwd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v': 'usd-coin',
  'es9vmfrzacermjfrf4h2fyd4kconnky11mcce8benwny': 'tether',
  '7vfcxtuxx5wjv5jadk17du4kssgau7utnkj4b963voxs': 'wrapped-ethereum',
  '9n4nbm75f5ui33zbpyxn59ewsge8cgshtaeth5yfej9e': 'bitcoin',
  '4k3dyjzvzp8emzwuxbcjcevwsgku7utnkj4b963voxs': 'raydium',
  'jupyiwryjfskupeih7hker8vutaefosybkedznsdvcn': 'jupiter',
  'dezxaz8z7pnrnrjjz3wxborgixca6xjnb7yab1ppb263': 'bonk',
  'msolzycxdhygdzul16g5qsh3i5k3z3kzk7ytfqcjm7so': 'marinade-staked-sol',
  'bso13r4tkie4kuml71lshstppl2eubylfx6h9hp3piy1': 'blaze-staked-sol',
};


const priceCache = new Map<string, PriceData>();
const CACHE_TTL_MS = 5 * 60 * 1000; 

const COINGECKO_API = 'https://api.coingecko.com/api/v3';

async function fetchFromCoinGecko(
  tokenIds: string[],
  vsCurrency: string = 'usd'
): Promise<Record<string, number>> {
  const now = Date.now();
  const uncached = tokenIds.filter(id => {
    const cached = priceCache.get(id);
    return !cached || (now - cached.lastUpdated) > CACHE_TTL_MS;
  });

  
  if (uncached.length === 0) {
    return tokenIds.reduce((acc, id) => {
      acc[id] = priceCache.get(id)!.price;
      return acc;
    }, {} as Record<string, number>);
  }

  
  try {
    const idsParam = uncached.join(',');
    const response = await fetch(
      `${COINGECKO_API}/simple/price?ids=${idsParam}&vs_currencies=${vsCurrency}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.warn('[PriceService] CoinGecko fetch failed:', response.status);
      
      const result: Record<string, number> = {};
      for (const id of uncached) {
        const cached = priceCache.get(id);
        if (cached) result[id] = cached.price;
      }
      return result;
    }

    const data: Record<string, Record<string, number>> = await response.json();

    
    const result: Record<string, number> = {};
    for (const id of uncached) {
      if (data[id]?.[vsCurrency]) {
        const price = data[id][vsCurrency];
        result[id] = price;
        priceCache.set(id, { price, lastUpdated: now });
      } else {
        
        const cached = priceCache.get(id);
        if (cached) result[id] = cached.price;
      }
    }

    return result;
  } catch (error) {
    console.error('[PriceService] Error fetching prices:', error);
    
    const result: Record<string, number> = {};
    for (const id of uncached) {
      const cached = priceCache.get(id);
      if (cached) result[id] = cached.price;
    }
    return result;
  }
}


export async function getTokenPrice(
  tokenAddress: string,
  chainId?: number
): Promise<number> {
  const normalized = tokenAddress.toLowerCase();

  
  let coingeckoId = TOKEN_ID_MAP[normalized];
  if (!coingeckoId) {
    
    return 0;
  }

  
  if (STABLECOIN_IDS.has(coingeckoId)) {
    return 1.0;
  }

  const prices = await fetchFromCoinGecko([coingeckoId]);
  return prices[coingeckoId] || 0;
}


export async function getTokensPrices(
  tokenAddresses: string[]
): Promise<Map<string, number>> {
  if (tokenAddresses.length === 0) {
    return new Map();
  }

  
  const addressToId = new Map<string, string>();
  const stablecoinAddresses: string[] = [];

  for (const addr of tokenAddresses) {
    const normalized = addr.toLowerCase();
    const id = TOKEN_ID_MAP[normalized];
    if (id) {
      
      if (STABLECOIN_IDS.has(id)) {
        stablecoinAddresses.push(addr);
      } else {
        addressToId.set(addr, id);
      }
    }
  }

  
  let prices: Record<string, number> = {};
  if (addressToId.size > 0) {
    const uniqueIds = [...new Set([...addressToId.values()])];
    prices = await fetchFromCoinGecko(uniqueIds);
  }

  
  const result = new Map<string, number>();
  for (const [addr, id] of addressToId) {
    if (prices[id]) {
      result.set(addr, prices[id]);
    }
  }
  
  for (const addr of stablecoinAddresses) {
    result.set(addr, 1.0);
  }

  return result;
}


export function formatWithUsd(
  formattedBalance: string,
  usdPrice: number,
  decimals: number = 6
): string {
  if (usdPrice === 0) {
    return formattedBalance;
  }

  const numericBalance = parseFloat(formattedBalance.replace(/,/g, ''));
  if (isNaN(numericBalance) || !isFinite(numericBalance)) {
    return formattedBalance;
  }

  const usdValue = numericBalance * usdPrice;

  
  const formattedUsd = usdValue < 1
    ? usdValue.toFixed(4)
    : usdValue.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

  return `${formattedBalance} ≈ ${formattedUsd}`;
}


export function clearPriceCache(): void {
  priceCache.clear();
}


export function getPriceCacheStats(): { size: number; ttlMs: number } {
  return {
    size: priceCache.size,
    ttlMs: CACHE_TTL_MS,
  };
}
