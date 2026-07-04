import fs from 'fs';
import path from 'path';



const DB_FILE = path.join(process.cwd(), 'db.json');
const USE_PRISMA = !!process.env.DATABASE_URL;

export interface IPFSUpload {
  id: string;
  userId: string;
  type: 'images' | 'metadata' | 'hidden';
  cid: string;
  provider: string;
  gatewayUrl?: string;
  uploadTimestamp?: string;
  fileCount?: number;
  collectionSize?: number;
  createdAt: string;
  verified: boolean;
}

export interface UserIPFSConfig {
  userId: string;
  provider: 'pinata' | 'infura' | 'lighthouse' | 'manual';
  encryptedApiKey: string;
  encryptedSecret: string;
  encryptedJWT: string;
  gateway: string;
  createdAt: string;
}

export interface ContractDeployment {
  id: string;
  userId: string;
  networkId: number;
  contractAddress: string;
  contractType: string;
  name: string;
  symbol: string;
  deployedAt: string;
  txHash: string;
}

export interface TrackedTransaction {
  id: string;
  chain: 'CRONOS' | 'SOLANA';
  txHash: string;
  walletAddress: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  blockNumber: number | null;
  slot: number | null;
  fee: string | null;
  errorMessage: string | null;
  metadata: Record<string, any> | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}



let _prisma: any = null;
export async function getPrisma() {
  if (!_prisma) {
    const { PrismaClient } = await import('@prisma/client');
    _prisma = new PrismaClient();
  }
  return _prisma;
}


interface DBData {
  uploads: IPFSUpload[];
  configs: UserIPFSConfig[];
  deployments: ContractDeployment[];
  transactions: TrackedTransaction[];
}
const DEFAULT_DATA: DBData = { uploads: [], configs: [], deployments: [], transactions: [] };

function readDB(): DBData {
  try {
    if (!fs.existsSync(DB_FILE)) { writeDB(DEFAULT_DATA); return DEFAULT_DATA; }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return {
      uploads: data.uploads ?? [],
      configs: data.configs ?? [],
      deployments: data.deployments ?? [],
      transactions: data.transactions ?? [],
    };
  } catch (err) {
    console.error('[db] Failed to read DB file, resetting:', err);
    writeDB(DEFAULT_DATA);
    return DEFAULT_DATA;
  }
}

function writeDB(data: DBData): void {
  try {
    const tmpFile = DB_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error('[db] Failed to write DB file:', err);
    throw new Error('Database write failed');
  }
}




export const db = {
  async getUploads(userId?: string): Promise<IPFSUpload[]> {
    if (USE_PRISMA) {
      try {
        const p = await getPrisma();
        const rows = await p.iPFSUpload.findMany({ where: userId ? { userId } : {} });
        return rows.map((r: any) => ({ ...r, createdAt: r.createdAt.toISOString() }));
      } catch {  }
    }
    const data = readDB();
    return userId ? data.uploads.filter((u) => u.userId === userId) : data.uploads;
  },

  async addUpload(upload: IPFSUpload): Promise<void> {
    if (USE_PRISMA) {
      try {
        const p = await getPrisma();
        await p.iPFSUpload.create({ data: { ...upload, createdAt: new Date(upload.createdAt) } });
        return;
      } catch {  }
    }
    const data = readDB();
    data.uploads.push(upload);
    writeDB(data);
  },

  async getConfig(userId: string): Promise<UserIPFSConfig | undefined> {
    if (USE_PRISMA) {
      try {
        const p = await getPrisma();
        const row = await p.userIPFSConfig.findUnique({ where: { userId } });
        return row ? { ...row, createdAt: row.createdAt.toISOString() } : undefined;
      } catch {  }
    }
    return readDB().configs.find((c) => c.userId === userId);
  },

  async saveConfig(config: UserIPFSConfig): Promise<void> {
    if (USE_PRISMA) {
      try {
        const p = await getPrisma();
        await p.userIPFSConfig.upsert({
          where: { userId: config.userId },
          update: { ...config, createdAt: new Date(config.createdAt) },
          create: { ...config, createdAt: new Date(config.createdAt) },
        });
        return;
      } catch {  }
    }
    const data = readDB();
    const index = data.configs.findIndex((c) => c.userId === config.userId);
    if (index >= 0) data.configs[index] = config; else data.configs.push(config);
    writeDB(data);
  },

  async getDeployments(userId: string): Promise<ContractDeployment[]> {
    if (USE_PRISMA) {
      try {
        const p = await getPrisma();
        const rows = await p.contractDeployment.findMany({ where: { userId } });
        return rows.map((r: any) => ({ ...r, deployedAt: r.deployedAt.toISOString() }));
      } catch {  }
    }
    return readDB().deployments.filter((d) => d.userId === userId);
  },

  async addDeployment(deployment: ContractDeployment): Promise<void> {
    if (USE_PRISMA) {
      try {
        const p = await getPrisma();
        await p.contractDeployment.create({ data: { ...deployment, deployedAt: new Date(deployment.deployedAt) } });
        return;
      } catch {  }
    }
    const data = readDB();
    data.deployments.push(deployment);
    writeDB(data);
  },

  async deleteConfig(userId: string): Promise<boolean> {
    if (USE_PRISMA) {
      try {
        const p = await getPrisma();
        await p.userIPFSConfig.delete({ where: { userId } });
        return true;
      } catch {  }
    }
    const data = readDB();
    const before = data.configs.length;
    data.configs = data.configs.filter((c) => c.userId !== userId);
    if (data.configs.length !== before) { writeDB(data); return true; }
    return false;
  },

  async getTransactions(walletAddress?: string, chainId?: number, limit: number = 50): Promise<TrackedTransaction[]> {
    if (USE_PRISMA) {
      try {
        const p = await getPrisma();
        const where: any = {};
        if (walletAddress) where.walletAddress = walletAddress.toLowerCase();
        if (chainId) {
          const chainMap: Record<number, 'CRONOS' | 'SOLANA'> = { 25: 'CRONOS', 338: 'CRONOS', 0: 'SOLANA' };
          where.chain = chainMap[chainId];
        }
        const rows = await p.trackedTransaction.findMany({
          where,
          orderBy: [
            { confirmedAt: 'desc' },
            { createdAt: 'desc' },
          ],
          take: Math.min(limit, 100),
        });
        return rows.map((r: any) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          confirmedAt: r.confirmedAt?.toISOString() ?? null,
        }));
      } catch {  }
    }
    let data = readDB().transactions;
    if (walletAddress) data = data.filter(t => t.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    if (chainId) {
      const chainMap: Record<number, 'CRONOS' | 'SOLANA'> = { 25: 'CRONOS', 338: 'CRONOS', 0: 'SOLANA' };
      const chain = chainMap[chainId];
      data = data.filter(t => t.chain === chain);
    }
    data.sort((a, b) => {
      const aDate = a.confirmedAt ? new Date(a.confirmedAt).getTime() : new Date(a.createdAt).getTime();
      const bDate = b.confirmedAt ? new Date(b.confirmedAt).getTime() : new Date(b.createdAt).getTime();
      return bDate - aDate;
    });
    return data.slice(0, Math.min(limit, 100));
  },

  async recordTransaction(data: {
    walletAddress: string;
    chainId: number;
    txHash: string;
    type: string;
    status?: 'PENDING' | 'CONFIRMED' | 'FAILED';
    blockNumber?: number | null;
    metadata?: Record<string, any>;
    executedAt?: Date | string;
  }): Promise<TrackedTransaction> {
    const chainMap: Record<string, 'CRONOS' | 'SOLANA'> = { '25': 'CRONOS', '338': 'CRONOS', '0': 'SOLANA' };
    const chain = chainMap[data.chainId.toString()] || 'CRONOS';
    const id = `${data.walletAddress.toLowerCase()}-${data.txHash}`.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 100);
    const now = new Date();
    const confirmedAt = data.executedAt ? new Date(data.executedAt) : data.status === 'CONFIRMED' ? now : null;

    if (USE_PRISMA) {
      try {
        const p = await getPrisma();
        const record = await p.trackedTransaction.upsert({
          where: { id },
          create: {
            id,
            chain,
            txHash: data.txHash,
            walletAddress: data.walletAddress.toLowerCase(),
            status: data.status || 'PENDING',
            blockNumber: data.blockNumber ?? null,
            slot: null,
            fee: null,
            errorMessage: null,
            metadata: {
              type: data.type,
              ...data.metadata,
            },
            confirmedAt,
          },
          update: {
            status: data.status,
            confirmedAt,
            blockNumber: data.blockNumber ?? null,
            metadata: {
              ...data.metadata,
              type: data.type,
            },
          },
        });
        return record as TrackedTransaction;
      } catch {  }
    }

    
    const all = readDB().transactions;
    const idx = all.findIndex(t => t.id === id);
    const tx: TrackedTransaction = {
      id,
      chain,
      txHash: data.txHash,
      walletAddress: data.walletAddress.toLowerCase(),
      status: data.status || 'PENDING',
      blockNumber: data.blockNumber ?? null,
      slot: null,
      fee: null,
      errorMessage: null,
      metadata: { type: data.type, ...data.metadata },
      confirmedAt: confirmedAt?.toISOString() ?? null,
      createdAt: idx >= 0 ? all[idx].createdAt : now.toISOString(),
      updatedAt: now.toISOString(),
    };
    if (idx >= 0) {
      all[idx] = tx;
    } else {
      all.push(tx);
    }
    writeDB({ ...readDB(), transactions: all });
    return tx;
  },
};
