

import { apiClient } from './apiClient';



export interface MerkleTreeResult {
  root: string;
  totalAddresses: number;
  duplicatesRemoved: number;
  leaves: string[];
}

export interface MerkleProofResult {
  proof: string[];
  root: string;
  isValid: boolean;
}

export interface MintPhase {
  id: string;
  collectionId: string;
  name: string;
  phaseType: 'ALLOWLIST' | 'PUBLIC' | 'FCFS' | 'DUTCH_AUCTION';
  startTime: string;
  endTime: string | null;
  price: string;
  maxPerWallet: number;
  maxSupply: number | null;
  merkleRoot: string | null;
  isActive: boolean;
  order: number;
}

export interface WhitelistEntry {
  id: string;
  collectionId: string;
  address: string;
  maxMints: number;
  addedAt: string;
}

export interface WalletMintStatus {
  walletAddress: string;
  collectionId: string;
  totalMinted: number;
  byPhase: Array<{ phaseId: string | null; quantity: number }>;
}



export const mintService = {
  
  generateMerkleTree(addresses: string[]): Promise<MerkleTreeResult> {
    return apiClient.post('/api/mint/merkle/generate', { addresses });
  },

  
  getMerkleProof(address: string, addresses: string[]): Promise<MerkleProofResult> {
    return apiClient.post('/api/mint/merkle/proof', { address, addresses });
  },

  

  createPhase(data: Omit<MintPhase, 'id' | 'isActive'>): Promise<{ phase: MintPhase }> {
    return apiClient.post('/api/mint/phases', data);
  },

  getPhases(collectionId: string): Promise<{ phases: MintPhase[] }> {
    return apiClient.get('/api/mint/phases/' + collectionId);
  },

  updatePhase(id: string, updates: Partial<MintPhase>): Promise<{ phase: MintPhase }> {
    return apiClient.put('/api/mint/phases/' + id, updates);
  },

  deletePhase(id: string): Promise<{ success: boolean }> {
    return apiClient.delete('/api/mint/phases/' + id);
  },

  getActivePhase(collectionId: string): Promise<{ activePhase: MintPhase | null }> {
    return apiClient.get('/api/mint/phases/' + collectionId + '/active');
  },

  

  addWhitelist(collectionId: string, addresses: string[], maxMints = 1): Promise<{ added: number }> {
    return apiClient.post('/api/mint/whitelist', { collectionId, addresses, maxMints });
  },

  getWhitelist(collectionId: string, page = 1, limit = 100): Promise<{ entries: WhitelistEntry[]; total: number }> {
    return apiClient.get('/api/mint/whitelist/' + collectionId + '?page=' + page + '&limit=' + limit);
  },

  checkWhitelistStatus(collectionId: string, address: string): Promise<{
    isWhitelisted: boolean;
    maxMints: number;
    totalMinted: number;
    remainingMints: number;
  }> {
    return apiClient.get('/api/mint/whitelist/check?collectionId=' + collectionId + '&address=' + address);
  },

  removeFromWhitelist(collectionId: string, address: string): Promise<{ success: boolean }> {
    return apiClient.delete('/api/mint/whitelist?collectionId=' + collectionId + '&address=' + address);
  },

  

  recordMint(data: {
    collectionId: string;
    phaseId?: string;
    walletAddress: string;
    quantity?: number;
    txHash?: string;
  }): Promise<{ success: boolean }> {
    return apiClient.post('/api/mint/record', data);
  },

  getWalletMintStatus(collectionId: string, walletAddress: string): Promise<WalletMintStatus> {
    return apiClient.get('/api/mint/status?collectionId=' + collectionId + '&walletAddress=' + walletAddress);
  },
};
