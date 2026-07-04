import { Request, Response } from 'express';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { encrypt, decrypt } from '../utils/encryption.js';
import { db, IPFSUpload, UserIPFSConfig } from '../db.js';
import { getProvider, IPFSProvider } from '../services/ipfsService.js';
import { uploadQueue } from '../services/uploadQueue.js';

async function getProviderFromConfig(userId: string): Promise<IPFSProvider> {
  const config = await db.getConfig(userId);
  if (!config) throw new Error('IPFS configuration not found for this user. Please configure it in Settings > IPFS.');

  const decryptedConfig = {
    provider: config.provider,
    apiKey: decrypt(config.encryptedApiKey),
    secret: decrypt(config.encryptedSecret),
    jwt: decrypt(config.encryptedJWT),
    gateway: config.gateway,
  };

  return getProvider(decryptedConfig);
}

export const saveConfig = async (req: Request, res: Response) => {
  try {
    const { userId, provider, apiKey, secret, jwt, gateway } = req.body;

    if (!userId || typeof userId !== 'string') return res.status(400).json({ error: 'userId is required' });
    if (!provider) return res.status(400).json({ error: 'provider is required' });
    if (!['pinata', 'infura', 'lighthouse', 'manual'].includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider. Must be one of: pinata, infura, lighthouse, manual' });
    }

    const defaultGateway = provider === 'lighthouse'
      ? 'https://gateway.lighthouse.storage/ipfs/'
      : 'https://gateway.pinata.cloud/ipfs/';

    const config: UserIPFSConfig = {
      userId: userId.trim(),
      provider,
      encryptedApiKey: encrypt(apiKey || ''),
      encryptedSecret: encrypt(secret || ''),
      encryptedJWT: encrypt(jwt || ''),
      gateway: gateway || defaultGateway,
      createdAt: new Date().toISOString(),
    };

    await db.saveConfig(config);
    res.json({ success: true, message: 'IPFS configuration saved securely.' });
  } catch (error: any) {
    console.error('[ipfsController] saveConfig error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getConfig = async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || 'default';
    const config = await db.getConfig(userId);
    if (!config) return res.json({ configured: false });
    
    res.json({
      configured: true,
      provider: config.provider,
      gateway: config.gateway,
      hasApiKey: !!config.encryptedApiKey,
      hasJWT: !!config.encryptedJWT,
      createdAt: config.createdAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const uploadImages = async (req: Request, res: Response) => {
  try {
    const userId = (req.body.userId as string) || 'default';
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    if (files.length > 500) return res.status(400).json({ error: 'Maximum 500 files per upload' });

    const jobId = uploadQueue.addJob(userId, 'images', files);
    res.status(202).json({ jobId, message: 'Upload queued', fileCount: files.length });
  } catch (error: any) {
    console.error('[ipfsController] uploadImages error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const uploadMetadata = async (req: Request, res: Response) => {
  try {
    const userId = (req.body.userId as string) || 'default';
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) return res.status(400).json({ error: 'No metadata files uploaded' });
    if (files.length > 500) return res.status(400).json({ error: 'Maximum 500 files per upload' });

    const jobId = uploadQueue.addJob(userId, 'metadata', files);
    res.status(202).json({ jobId, message: 'Metadata upload queued', fileCount: files.length });
  } catch (error: any) {
    console.error('[ipfsController] uploadMetadata error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getJobStatus = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    if (!jobId) return res.status(400).json({ error: 'jobId is required' });

    const job = uploadQueue.getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    res.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
      retryCount: job.retryCount,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const validateCID = async (req: Request, res: Response) => {
  try {
    const { cid } = req.body;
    if (!cid || typeof cid !== 'string') return res.status(400).json({ error: 'cid is required' });

    const trimmedCid = cid.trim();
    
    const isValidFormat = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(trimmedCid) || 
      /^bafy[a-z2-7]{55,}$/.test(trimmedCid); 

    if (!isValidFormat) {
      return res.json({ validFormat: false, resolves: false, sizeBytes: 0, providerReachable: false });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`https://ipfs.io/ipfs/${trimmedCid}`, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      res.json({
        validFormat: true,
        resolves: response.ok,
        sizeBytes: parseInt(response.headers.get('content-length') || '0', 10),
        providerReachable: true,
      });
    } catch {
      res.json({ validFormat: true, resolves: false, sizeBytes: 0, providerReachable: false });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getPinStatus = async (req: Request, res: Response) => {
  try {
    const { cid } = req.params;
    const userId = (req.query.userId as string) || 'default';

    if (!cid) return res.status(400).json({ error: 'CID is required' });

    const provider = await getProviderFromConfig(userId);
    const status = await provider.getPinStatus(cid);
    res.json(status);
  } catch (error: any) {
    console.error('[ipfsController] getPinStatus error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const uploadHiddenImage = async (req: Request, res: Response) => {
  try {
    const userId = (req.body.userId as string) || 'default';
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const provider = await getProviderFromConfig(userId);
    const result = await provider.uploadFile(file);

    const config = await db.getConfig(userId);
    const uploadRecord: IPFSUpload = {
      id: uuidv4(),
      userId,
      type: 'hidden',
      cid: result.cid,
      provider: config?.provider || 'unknown',
      gatewayUrl: result.gatewayUrl,
      uploadTimestamp: new Date().toISOString(),
      fileCount: 1,
      createdAt: new Date().toISOString(),
      verified: false,
    };
    await db.addUpload(uploadRecord);

    
    try { fs.unlinkSync(file.path); } catch {}

    res.json(result);
  } catch (error: any) {
    console.error('[ipfsController] uploadHiddenImage error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const uploadHiddenMetadata = async (req: Request, res: Response) => {
  try {
    const userId = (req.body.userId as string) || 'default';
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const provider = await getProviderFromConfig(userId);
    const result = await provider.uploadFile(file);

    const config = await db.getConfig(userId);
    const uploadRecord: IPFSUpload = {
      id: uuidv4(),
      userId,
      type: 'hidden',
      cid: result.cid,
      provider: config?.provider || 'unknown',
      gatewayUrl: result.gatewayUrl,
      uploadTimestamp: new Date().toISOString(),
      fileCount: 1,
      createdAt: new Date().toISOString(),
      verified: false,
    };
    await db.addUpload(uploadRecord);

    try { fs.unlinkSync(file.path); } catch {}

    res.json(result);
  } catch (error: any) {
    console.error('[ipfsController] uploadHiddenMetadata error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const prepareReveal = async (req: Request, res: Response) => {
  try {
    const { metadataCID } = req.body;
    if (!metadataCID || typeof metadataCID !== 'string') {
      return res.status(400).json({ error: 'metadataCID is required' });
    }

    const newBaseURI = `ipfs://${metadataCID.trim()}/`;
    res.json({
      newBaseURI,
      instructions: 'Call setBaseURI(newBaseURI) and setRevealed(true) on your deployed contract.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const replaceCID = async (req: Request, res: Response) => {
  res.status(501).json({ error: 'replaceCID is not yet implemented in this version.' });
};

export const getPreview = async (req: Request, res: Response) => {
  try {
    const { cid } = req.params;
    if (!cid) return res.status(400).json({ error: 'CID is required' });
    const gatewayUrl = `https://gateway.lighthouse.storage/ipfs/${cid}`;
    res.json({ gatewayUrl, ipfsUrl: `ipfs://${cid}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getUploads = async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || 'default';
    const uploads = await db.getUploads(userId);
    res.json({ uploads });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};




export const storageUploadAsset = async (req: Request, res: Response) => {
  try {
    const userId = (req.body.userId as string) || 'default';
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const provider = await getProviderFromConfig(userId);
    const result = await provider.uploadFile(file);

    const config = await db.getConfig(userId);
    await db.addUpload({
      id: uuidv4(),
      userId,
      type: 'images',
      cid: result.cid,
      provider: config?.provider || 'unknown',
      gatewayUrl: result.gatewayUrl,
      uploadTimestamp: new Date().toISOString(),
      fileCount: 1,
      createdAt: new Date().toISOString(),
      verified: false,
    });

    try { fs.unlinkSync(file.path); } catch {}

    res.json({
      cid: result.cid,
      uri: result.uri,
      gatewayUrl: result.gatewayUrl,
      ipfsUrl: `ipfs://${result.cid}`,
      storageProvider: config?.provider || 'unknown',
      uploadTimestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};


export const storageUploadMetadata = async (req: Request, res: Response) => {
  try {
    const userId = (req.body.userId as string) || 'default';
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: 'No metadata files uploaded' });

    
    const { uploadQueue } = await import('../services/uploadQueue.js');
    const jobId = uploadQueue.addJob(userId, 'metadata', files);
    res.status(202).json({
      jobId,
      message: 'Metadata upload queued',
      fileCount: files.length,
      pollUrl: `/api/storage/getCID/${jobId}`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};


export const storageGetCID = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    if (!jobId) return res.status(400).json({ error: 'jobId is required' });

    const { uploadQueue } = await import('../services/uploadQueue.js');
    const job = uploadQueue.getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (job.status === 'completed' && job.result) {
      return res.json({
        status: 'completed',
        cid: job.result.cid,
        uri: job.result.uri,
        gatewayUrl: job.result.gatewayUrl,
        ipfsUrl: `ipfs://${job.result.cid}`,
        tokenMapping: job.result.tokenMapping,
        storageProvider: job.result.provider || 'unknown',
        uploadTimestamp: job.updatedAt,
      });
    }

    res.json({
      status: job.status,
      progress: job.progress,
      error: job.error,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
