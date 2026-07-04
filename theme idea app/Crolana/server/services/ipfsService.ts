

import fs from 'fs';

export interface UploadResult {
  cid: string;
  uri: string;
  gatewayUrl: string;
  fileCount: number;
}

export interface PinStatus {
  cid: string;
  pinned: boolean;
  replicationCount: number;
  provider: string;
}

export interface IPFSProvider {
  uploadFolder(files: Express.Multer.File[]): Promise<UploadResult>;
  uploadFile(file: Express.Multer.File): Promise<UploadResult>;
  uploadJSON(data: object, filename?: string): Promise<UploadResult>;
  getPinStatus(cid: string): Promise<PinStatus>;
  validateCID(cid: string): boolean;
}





export class PinataProvider implements IPFSProvider {
  private apiKey: string;
  private secret: string;
  private jwt: string;
  private gateway: string;

  constructor(config: { apiKey?: string; secret?: string; jwt?: string; gateway?: string }) {
    this.apiKey = config.apiKey || '';
    this.secret = config.secret || '';
    this.jwt = config.jwt || '';
    this.gateway = config.gateway || 'https://gateway.pinata.cloud/ipfs/';
  }

  private authHeaders(): Record<string, string> {
    return this.jwt
      ? { Authorization: 'Bearer ' + this.jwt }
      : { pinata_api_key: this.apiKey, pinata_secret_api_key: this.secret };
  }

  async uploadFolder(files: Express.Multer.File[]): Promise<UploadResult> {
    const form = new globalThis.FormData();
    files.forEach((file) => {
      const fileBuffer = fs.readFileSync(file.path);
      const blob = new Blob([fileBuffer]);
      form.append('file', blob, 'folder/' + file.originalname);
    });
    form.append('pinataMetadata', JSON.stringify({ name: 'Crolana Upload' }));
    form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { ...this.authHeaders() },
      body: form,
    });
    if (!res.ok) throw new Error('Pinata upload failed: ' + res.status + ' ' + await res.text());
    const data = await res.json() as any;

    return {
      cid: data.IpfsHash,
      uri: 'ipfs://' + data.IpfsHash + '/',
      gatewayUrl: this.gateway + data.IpfsHash + '/',
      fileCount: files.length,
    };
  }

  async uploadFile(file: Express.Multer.File): Promise<UploadResult> {
    const form = new globalThis.FormData();
    const fileBuffer = fs.readFileSync(file.path);
    const blob = new Blob([fileBuffer]);
    form.append('file', blob, file.originalname);
    form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { ...this.authHeaders() },
      body: form,
    });
    if (!res.ok) throw new Error('Pinata upload failed: ' + res.status + ' ' + await res.text());
    const data = await res.json() as any;

    return {
      cid: data.IpfsHash,
      uri: 'ipfs://' + data.IpfsHash,
      gatewayUrl: this.gateway + data.IpfsHash,
      fileCount: 1,
    };
  }

  async uploadJSON(data: object, filename = 'metadata.json'): Promise<UploadResult> {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const form = new globalThis.FormData();
    form.append('file', blob, filename);
    form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { ...this.authHeaders() },
      body: form,
    });
    if (!res.ok) throw new Error('Pinata JSON upload failed: ' + res.status);
    const responseData = await res.json() as any;

    return {
      cid: responseData.IpfsHash,
      uri: 'ipfs://' + responseData.IpfsHash,
      gatewayUrl: this.gateway + responseData.IpfsHash,
      fileCount: 1,
    };
  }

  async getPinStatus(cid: string): Promise<PinStatus> {
    const res = await fetch('https://api.pinata.cloud/data/pinList?hashContains=' + cid, {
      headers: this.authHeaders(),
    });
    const data = await res.json() as any;
    const isPinned = (data.count ?? 0) > 0;
    return { cid, pinned: isPinned, replicationCount: isPinned ? 1 : 0, provider: 'pinata' };
  }

  validateCID(cid: string): boolean { return cid.length > 0; }
}





export class InfuraProvider implements IPFSProvider {
  private auth: string;
  private readonly gateway = 'https://ipfs.io/ipfs/';

  constructor(config: { projectId: string; projectSecret: string }) {
    this.auth = Buffer.from(config.projectId + ':' + config.projectSecret).toString('base64');
  }

  private async pin(formData: globalThis.FormData): Promise<string> {
    const res = await fetch('https://ipfs.infura.io:5001/api/v0/add?pin=true', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + this.auth },
      body: formData,
    });
    if (!res.ok) throw new Error('Infura upload failed: ' + res.status + ' ' + await res.text());
    const json = await res.json();
    return json.Hash as string;
  }

  async uploadFolder(files: Express.Multer.File[]): Promise<UploadResult> {
    if (files.length === 0) throw new Error('No files to upload');
    const formData = new globalThis.FormData();
    for (const file of files) {
      const buf = fs.readFileSync(file.path);
      const blob = new Blob([buf], { type: file.mimetype });
      formData.append('file', blob, file.originalname);
    }
    const res = await fetch('https://ipfs.infura.io:5001/api/v0/add?pin=true&wrap-with-directory=true', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + this.auth },
      body: formData,
    });
    if (!res.ok) throw new Error('Infura folder upload failed: ' + res.status);
    const lines = (await res.text()).trim().split('\n');
    const last = JSON.parse(lines[lines.length - 1]);
    const cid: string = last.Hash;
    return { cid, uri: 'ipfs://' + cid + '/', gatewayUrl: this.gateway + cid + '/', fileCount: files.length };
  }

  async uploadFile(file: Express.Multer.File): Promise<UploadResult> {
    const formData = new globalThis.FormData();
    const buf = fs.readFileSync(file.path);
    const blob = new Blob([buf], { type: file.mimetype });
    formData.append('file', blob, file.originalname);
    const cid = await this.pin(formData);
    return { cid, uri: 'ipfs://' + cid, gatewayUrl: this.gateway + cid, fileCount: 1 };
  }

  async uploadJSON(data: object, filename = 'metadata.json'): Promise<UploadResult> {
    const formData = new globalThis.FormData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    formData.append('file', blob, filename);
    const cid = await this.pin(formData);
    return { cid, uri: 'ipfs://' + cid, gatewayUrl: this.gateway + cid, fileCount: 1 };
  }

  async getPinStatus(cid: string): Promise<PinStatus> {
    try {
      const res = await fetch('https://ipfs.infura.io:5001/api/v0/pin/ls?arg=' + cid, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + this.auth },
      });
      const json = await res.json();
      const pinned = !!(json.Keys && json.Keys[cid]);
      return { cid, pinned, replicationCount: pinned ? 1 : 0, provider: 'infura' };
    } catch {
      return { cid, pinned: false, replicationCount: 0, provider: 'infura' };
    }
  }

  validateCID(cid: string): boolean { return cid.length > 0; }
}





export class LighthouseProvider implements IPFSProvider {
  private apiKey: string;
  private readonly gateway = 'https://gateway.lighthouse.storage/ipfs/';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async uploadFolder(files: Express.Multer.File[]): Promise<UploadResult> {
    if (files.length === 0) throw new Error('No files to upload');
    const form = new globalThis.FormData();
    for (const file of files) {
      const buf = fs.readFileSync(file.path);
      const blob = new Blob([buf], { type: file.mimetype });
      form.append('file', blob, file.originalname);
    }

    const res = await fetch('https://node.lighthouse.storage/api/v0/add?wrap-with-directory=true', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + this.apiKey },
      body: form,
    });
    if (!res.ok) throw new Error('Lighthouse upload failed: ' + res.status + ' ' + await res.text());

    const lines = (await res.text()).trim().split('\n');
    const entries = lines.map((l) => JSON.parse(l));
    const dir = entries.find((e: any) => e.Name === '') ?? entries[entries.length - 1];
    const cid: string = dir.Hash ?? dir.cid;
    if (!cid) throw new Error('Lighthouse did not return a folder CID');

    return { cid, uri: 'ipfs://' + cid + '/', gatewayUrl: this.gateway + cid + '/', fileCount: files.length };
  }

  async uploadFile(file: Express.Multer.File): Promise<UploadResult> {
    const buf = fs.readFileSync(file.path);
    const blob = new Blob([buf], { type: file.mimetype });
    const form = new globalThis.FormData();
    form.append('file', blob, file.originalname);

    const res = await fetch('https://node.lighthouse.storage/api/v0/add', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + this.apiKey },
      body: form,
    });
    if (!res.ok) throw new Error('Lighthouse upload failed: ' + res.status + ' ' + await res.text());

    const json = await res.json() as any;
    const cid: string = json.Hash ?? json.cid;
    if (!cid) throw new Error('Lighthouse did not return a CID');

    return { cid, uri: 'ipfs://' + cid, gatewayUrl: this.gateway + cid, fileCount: 1 };
  }

  async uploadJSON(data: object, filename = 'metadata.json'): Promise<UploadResult> {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const form = new globalThis.FormData();
    form.append('file', blob, filename);

    const res = await fetch('https://node.lighthouse.storage/api/v0/add', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + this.apiKey },
      body: form,
    });
    if (!res.ok) throw new Error('Lighthouse JSON upload failed: ' + res.status);
    const resJson = await res.json() as any;
    const cid: string = resJson.Hash ?? resJson.cid;
    if (!cid) throw new Error('Lighthouse did not return a CID');
    return { cid, uri: 'ipfs://' + cid, gatewayUrl: this.gateway + cid, fileCount: 1 };
  }

  async getPinStatus(cid: string): Promise<PinStatus> {
    try {
      const res = await fetch('https://api.lighthouse.storage/api/lighthouse/file_info?cid=' + cid, {
        headers: { Authorization: 'Bearer ' + this.apiKey },
      });
      if (!res.ok) return { cid, pinned: false, replicationCount: 0, provider: 'lighthouse' };
      const json = await res.json() as any;
      const pinned = json.fileSizeInBytes !== undefined;
      return { cid, pinned, replicationCount: pinned ? 3 : 0, provider: 'lighthouse' };
    } catch {
      return { cid, pinned: false, replicationCount: 0, provider: 'lighthouse' };
    }
  }

  validateCID(cid: string): boolean { return cid.length > 0; }
}





export class ManualProvider implements IPFSProvider {
  async uploadFolder(_files: Express.Multer.File[]): Promise<UploadResult> {
    throw new Error('Manual provider does not support upload. Set your CID directly.');
  }
  async uploadFile(_file: Express.Multer.File): Promise<UploadResult> {
    throw new Error('Manual provider does not support upload. Set your CID directly.');
  }
  async uploadJSON(_data: object): Promise<UploadResult> {
    throw new Error('Manual provider does not support upload.');
  }
  async getPinStatus(cid: string): Promise<PinStatus> {
    return { cid, pinned: true, replicationCount: 1, provider: 'manual' };
  }
  validateCID(_cid: string): boolean { return true; }
}





export function getProvider(config: any): IPFSProvider {
  switch (config.provider) {
    case 'pinata':     return new PinataProvider({ apiKey: config.apiKey, secret: config.secret, jwt: config.jwt, gateway: config.gateway });
    case 'infura':     return new InfuraProvider({ projectId: config.apiKey, projectSecret: config.secret });
    case 'lighthouse': return new LighthouseProvider(config.apiKey);
    case 'manual':     return new ManualProvider();
    default:           throw new Error('Unsupported IPFS provider: ' + config.provider);
  }
}
