import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { getProvider } from './ipfsService.js';
import { db, IPFSUpload } from '../db.js';
import { decrypt } from '../utils/encryption.js';
import fs from 'fs';

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface UploadJob {
  id: string;
  userId: string;
  type: 'images' | 'metadata';
  files: Express.Multer.File[];
  status: JobStatus;
  progress: number;
  result?: any;
  error?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

class UploadQueue extends EventEmitter {
  private jobs: Map<string, UploadJob> = new Map();
  private isProcessing = false;
  private readonly maxRetries = 3;
  private readonly maxJobs = 1000; 

  addJob(userId: string, type: 'images' | 'metadata', files: Express.Multer.File[]): string {
    
    if (this.jobs.size >= this.maxJobs) {
      const toDelete = Array.from(this.jobs.values())
        .filter((j) => j.status === 'completed' || j.status === 'failed')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, 100);
      toDelete.forEach((j) => this.jobs.delete(j.id));
    }

    const now = new Date().toISOString();
    const id = uuidv4();
    this.jobs.set(id, {
      id,
      userId,
      type,
      files,
      status: 'pending',
      progress: 0,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    setImmediate(() => this.processNext());
    return id;
  }

  getJob(id: string): UploadJob | undefined {
    return this.jobs.get(id);
  }

  retryJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (job && job.status === 'failed' && job.retryCount < this.maxRetries) {
      job.status = 'pending';
      job.retryCount++;
      job.error = undefined;
      job.updatedAt = new Date().toISOString();
      setImmediate(() => this.processNext());
      return true;
    }
    return false;
  }

  private async processNext() {
    if (this.isProcessing) return;

    const pendingJob = Array.from(this.jobs.values()).find((j) => j.status === 'pending');
    if (!pendingJob) return;

    this.isProcessing = true;
    pendingJob.status = 'processing';
    pendingJob.updatedAt = new Date().toISOString();
    this.emit('jobStarted', pendingJob);

    try {
      const config = await db.getConfig(pendingJob.userId);
      if (!config) throw new Error('IPFS configuration not found. Please configure IPFS in Settings.');

      const decryptedConfig = {
        provider: config.provider,
        apiKey: decrypt(config.encryptedApiKey),
        secret: decrypt(config.encryptedSecret),
        jwt: decrypt(config.encryptedJWT),
        gateway: config.gateway,
      };

      const provider = getProvider(decryptedConfig);
      pendingJob.progress = 25;
      pendingJob.updatedAt = new Date().toISOString();

      const result = await provider.uploadFolder(pendingJob.files);

      pendingJob.progress = 90;
      pendingJob.updatedAt = new Date().toISOString();

      
      let tokenMapping: Record<string, string> | undefined;
      if (pendingJob.type === 'metadata') {
        tokenMapping = {};
        pendingJob.files.forEach((file) => {
          const match = file.originalname.match(/^(\d+)\.json$/);
          if (match) tokenMapping![match[1]] = `${result.uri}${file.originalname}`;
        });
        if (Object.keys(tokenMapping).length === 0) tokenMapping = undefined;
      }

      const uploadRecord: IPFSUpload = {
        id: uuidv4(),
        userId: pendingJob.userId,
        type: pendingJob.type,
        cid: result.cid,
        provider: config.provider,
        gatewayUrl: result.gatewayUrl,
        uploadTimestamp: new Date().toISOString(),
        fileCount: pendingJob.files.length,
        collectionSize: pendingJob.files.length,
        createdAt: new Date().toISOString(),
        verified: false,
      };
      await db.addUpload(uploadRecord);

      pendingJob.status = 'completed';
      pendingJob.progress = 100;
      pendingJob.updatedAt = new Date().toISOString();
      pendingJob.result = { ...result, tokenMapping };
      this.emit('jobCompleted', pendingJob);
    } catch (error: any) {
      console.error(`[uploadQueue] Job ${pendingJob.id} failed:`, error.message);
      pendingJob.status = 'failed';
      pendingJob.error = error.message;
      pendingJob.updatedAt = new Date().toISOString();
      this.emit('jobFailed', pendingJob);

      
      if (pendingJob.retryCount < this.maxRetries) {
        const delay = 5000 * Math.pow(2, pendingJob.retryCount);
        console.log(`[uploadQueue] Retrying job ${pendingJob.id} in ${delay}ms (attempt ${pendingJob.retryCount + 1}/${this.maxRetries})`);
        setTimeout(() => this.retryJob(pendingJob.id), delay);
      }
    } finally {
      
      pendingJob.files.forEach((file) => {
        try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch {}
      });

      this.isProcessing = false;
      
      setImmediate(() => this.processNext());
    }
  }
}

export const uploadQueue = new UploadQueue();
