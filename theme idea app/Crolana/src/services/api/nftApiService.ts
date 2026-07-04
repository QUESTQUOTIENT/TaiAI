

import { apiClient } from './apiClient';

export interface TraitLayer {
  id: string;
  name: string;
  order: number;
  traits: Array<{
    id: string;
    name: string;
    weight: number;
    imageData?: string;
  }>;
}

export interface GeneratedNFTSummary {
  id: number;
  name: string;
  description: string;
  dnaHash: string;
  attributes: Array<{ trait_type: string; value: string }>;
  rarity: number;
  rarityRank: number;
  rarityLabel: string;
  isLegendary: boolean;
}

export interface GenerationResult {
  success: boolean;
  totalGenerated: number;
  uniqueCount: number;
  rarityBreakdown: {
    mythic: number;
    legendary: number;
    epic: number;
    rare: number;
    uncommon: number;
    common: number;
  };
  distribution: Record<string, Record<string, number>>;
  nfts: GeneratedNFTSummary[];
}

export interface TokenTemplate {
  id: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
}

export const nftApiService = {
  
  generateCollection(params: {
    collectionName: string;
    collectionDescription?: string;
    totalSupply: number;
    layers: TraitLayer[];
    seed?: number;
  }): Promise<GenerationResult> {
    return apiClient.post('/api/nft/generate', params);
  },

  
  buildMetadata(params: {
    nft: GeneratedNFTSummary;
    ipfsImagesCid: string;
    options?: { royaltyBps?: number; royaltyAddr?: string; externalUrl?: string };
  }): Promise<Record<string, unknown>> {
    return apiClient.post('/api/nft/metadata', params);
  },

  
  getPoolInfo(tokenA: string, tokenB: string, chainId: number) {
    return apiClient.get<{
      exists: boolean;
      pairAddress: string | null;
      token0: string;
      token1: string;
      reserve0: string;
      reserve1: string;
      totalSupply: string;
    }>(`/api/pool/info?tokenA=${encodeURIComponent(tokenA)}&tokenB=${encodeURIComponent(tokenB)}&chainId=${chainId}`);
  },

  
  getLPPosition(pairAddress: string, walletAddress: string, chainId: number) {
    return apiClient.get<{
      lpBalance: string;
      share: number;
      sharePercent: string;
      token0Amount: string;
      token1Amount: string;
    }>(`/api/pool/position?pair=${encodeURIComponent(pairAddress)}&wallet=${encodeURIComponent(walletAddress)}&chainId=${chainId}`);
  },

  
  getTokenTemplates(): Promise<{ templates: TokenTemplate[] }> {
    return apiClient.get('/api/token/templates');
  },
};
