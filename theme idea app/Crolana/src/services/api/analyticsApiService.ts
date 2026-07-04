

import { apiClient } from './apiClient';

export interface OnChainAnalytics {
  overview: {
    totalSupply: number;
    uniqueOwners: number;
    totalRaised: string;
    contractBalance: string;
    mintCost: string;
    paused: boolean;
    revealed: boolean;
    name: string;
    symbol: string;
    dataSource: string;
  };
  mintChartData: Array<{ date: string; mints: number }>;
  participation: Array<{ name: string; value: number }>;
  recentActivity: Array<{
    txHash: string;
    type: string;
    from: string;
    to: string;
    tokenId: string;
    timestamp: number;
    value: string;
  }>;
}

export interface CollectionSnapshot {
  id: string;
  collectionId: string;
  date: string;
  totalMinted: number;
  uniqueOwners: number;
  mintsCount: number;
  revenueWei: string;
  mintVelocity: number;
}

export const analyticsService = {
  
  getOnChain(contractAddress: string, networkId: number = 25): Promise<OnChainAnalytics> {
    return apiClient.get('/api/analytics?address=' + contractAddress + '&networkId=' + networkId);
  },

  
  getCollection(collectionId: string): Promise<{ collectionId: string; snapshots: CollectionSnapshot[] }> {
    return apiClient.get('/api/analytics/collection?collectionId=' + collectionId);
  },

  
  getRevenue(collectionId: string): Promise<{
    collectionId: string;
    totalRevenueCRO: string;
    revenueByDay: Array<{ date: string; revenueCRO: string; mints: number }>;
  }> {
    return apiClient.get('/api/analytics/revenue?collectionId=' + collectionId);
  },

  
  getHolders(collectionId: string): Promise<{
    collectionId: string;
    uniqueOwners: number;
    totalMinted: number;
    topWallets: Array<{ address: string; totalMinted: number }>;
  }> {
    return apiClient.get('/api/analytics/holders?collectionId=' + collectionId);
  },
};
