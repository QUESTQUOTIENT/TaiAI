

import { apiClient } from './apiClient';

export interface NonceResponse {
  nonce: string;
  message: string;     
  expiresAt: number;
}

export interface AuthSession {
  token: string;
  address: string;
  chainId: number;
  expiresAt: number;
}

export interface SessionInfo {
  address: string;
  chainId: number;
  authenticated: boolean;
}

const TOKEN_KEY = 'crolana-token';

export const authApiService = {
  
  getNonce(address: string): Promise<NonceResponse> {
    return apiClient.get(`/api/auth/nonce?address=${encodeURIComponent(address)}`);
  },

  
  verify(address: string, signature: string, message: string, chainId = 25): Promise<AuthSession> {
    return apiClient.post('/api/auth/verify', { address, signature, message, chainId });
  },

  
  getSession(): Promise<SessionInfo> {
    return apiClient.get('/api/auth/me');
  },

  
  async logout(): Promise<void> {
    try { await apiClient.post('/api/auth/logout'); } catch {  }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
    }
  },

  

  saveToken(token: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, token);
    }
  },

  getToken(): string | null {
    return typeof localStorage !== 'undefined'
      ? localStorage.getItem(TOKEN_KEY)
      : null;
  },

  clearToken(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
    }
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  },
};
