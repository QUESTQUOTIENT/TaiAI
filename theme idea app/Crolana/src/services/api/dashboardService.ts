

import { apiClient } from './apiClient';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  timestamp: string;
  env: string;
}

export interface DashboardStats {
  deployments: number;
  uploads: number;
  networkStatus: 'online' | 'degraded' | 'offline';
  chainId: number;
}

export const dashboardService = {
  
  getHealth(): Promise<HealthStatus> {
    return apiClient.get('/api/health');
  },

  
  async getStats(userId: string): Promise<DashboardStats> {
    const [deployments, uploads] = await Promise.allSettled([
      apiClient.get<{ deployments: any[] }>(`/api/contract/deployments?userId=${encodeURIComponent(userId)}`),
      apiClient.get<{ uploads: any[] }>(`/api/ipfs/uploads?userId=${encodeURIComponent(userId)}`),
    ]);

    return {
      deployments: deployments.status === 'fulfilled' ? deployments.value.deployments.length : 0,
      uploads: uploads.status === 'fulfilled' ? (uploads.value.uploads?.length ?? 0) : 0,
      networkStatus: 'online',
      chainId: 25,
    };
  },
};
