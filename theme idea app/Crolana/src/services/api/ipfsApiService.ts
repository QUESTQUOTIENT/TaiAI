

import { apiClient } from './apiClient';

export interface IPFSConfig {
  provider: 'pinata' | 'infura' | 'lighthouse' | 'manual';
  apiKey?: string;
  secret?: string;
  jwt?: string;
  gateway?: string;
}

export interface UploadResult {
  cid: string;
  gatewayUrl: string;
  jobId?: string;
  fileCount?: number;
}

export interface JobStatus {
  jobId: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress?: number;
  cid?: string;
  error?: string;
}

export interface PinStatus {
  pinned: boolean;
  cid: string;
  provider: string;
  size?: number;
}

export const ipfsApiService = {
  
  saveConfig(userId: string, config: IPFSConfig): Promise<{ success: boolean; message: string }> {
    return apiClient.post('/api/ipfs/config', { userId, ...config });
  },

  
  getConfig(userId: string): Promise<{ provider: string; gateway: string } | null> {
    return apiClient.get(`/api/ipfs/config?userId=${encodeURIComponent(userId)}`);
  },

  
  uploadImages(userId: string, files: File[]): Promise<{ jobId: string }> {
    const form = new FormData();
    form.append('userId', userId);
    files.forEach((f) => form.append('files', f));
    return apiClient.upload('/api/ipfs/upload/images', form);
  },

  
  uploadMetadata(userId: string, files: File[]): Promise<{ jobId: string }> {
    const form = new FormData();
    form.append('userId', userId);
    files.forEach((f) => form.append('files', f));
    return apiClient.upload('/api/ipfs/upload/metadata', form);
  },

  
  uploadHiddenImage(userId: string, file: File): Promise<UploadResult> {
    const form = new FormData();
    form.append('userId', userId);
    form.append('file', file);
    return apiClient.upload('/api/ipfs/upload/hidden-image', form);
  },

  
  uploadHiddenMetadata(userId: string, file: File): Promise<UploadResult> {
    const form = new FormData();
    form.append('userId', userId);
    form.append('file', file);
    return apiClient.upload('/api/ipfs/upload/hidden-metadata', form);
  },

  
  getJobStatus(jobId: string): Promise<JobStatus> {
    return apiClient.get(`/api/ipfs/job/${encodeURIComponent(jobId)}`);
  },

  
  getPinStatus(cid: string): Promise<PinStatus> {
    return apiClient.get(`/api/ipfs/pin-status/${encodeURIComponent(cid)}`);
  },

  
  validateCID(cid: string): Promise<{ valid: boolean; accessible: boolean }> {
    return apiClient.post('/api/ipfs/validate', { cid });
  },

  
  getUploads(userId: string): Promise<{ uploads: any[] }> {
    return apiClient.get(`/api/ipfs/uploads?userId=${encodeURIComponent(userId)}`);
  },
};
