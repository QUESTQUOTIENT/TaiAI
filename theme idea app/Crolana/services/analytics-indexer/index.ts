

import 'dotenv/config';
import { ethers } from 'ethers';

const RPC_MAINNET = process.env.CRONOS_RPC_MAINNET ?? 'https://evm.cronos.org';
const RPC_TESTNET = process.env.CRONOS_RPC_TESTNET ?? 'https://evm-t3.cronos.org';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '30000', 10);

const ERC721_ABI = [
  'function totalSupply() view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function cost() view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

interface IndexerConfig {
  contractAddress: string;
  collectionId?: string;
  chainId: number;
  fromBlock: number;
  name?: string;
}





let prisma: any = null;

async function initDB() {
  if (process.env.DATABASE_URL) {
    try {
      const { PrismaClient } = await import('@prisma/client');
      prisma = new PrismaClient();
      await prisma.$connect();
      console.log('[indexer] Connected to database');
    } catch (err: any) {
      console.warn('[indexer] DB unavailable, using in-memory store:', err.message);
    }
  } else {
    console.log('[indexer] No DATABASE_URL set — using in-memory snapshots');
  }
}


const memSnapshots: Map<string, any> = new Map();

async function saveSnapshot(data: {
  collectionId?: string;
  contractAddr: string;
  chainId: number;
  date: string;
  totalMinted: number;
  uniqueOwners: number;
  mintsCount: number;
  revenueWei: string;
  mintVelocity: number;
}) {
  const key = data.contractAddr.toLowerCase() + '-' + data.chainId;

  if (prisma && data.collectionId) {
    try {
      await prisma.analyticsSnapshot.upsert({
        where: { collectionId_date: { collectionId: data.collectionId, date: data.date } },
        create: {
          collectionId: data.collectionId,
          date: data.date,
          totalMinted: data.totalMinted,
          uniqueOwners: data.uniqueOwners,
          mintsCount: data.mintsCount,
          revenueWei: data.revenueWei,
          mintVelocity: data.mintVelocity,
        },
        update: {
          totalMinted: data.totalMinted,
          uniqueOwners: data.uniqueOwners,
          mintsCount: data.mintsCount,
          revenueWei: data.revenueWei,
          mintVelocity: data.mintVelocity,
        },
      });
      return;
    } catch (err: any) {
      console.warn('[indexer] DB write failed, using in-memory:', err.message);
    }
  }

  
  memSnapshots.set(key, { ...data, updatedAt: Date.now() });
}





async function indexContract(config: IndexerConfig) {
  const rpc = config.chainId === 25 ? RPC_MAINNET : RPC_TESTNET;
  const provider = new ethers.JsonRpcProvider(rpc);
  const contract = new ethers.Contract(config.contractAddress, ERC721_ABI, provider);

  const today = new Date().toISOString().split('T')[0];

  try {
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(config.fromBlock, currentBlock - 50000);

    const [totalSupply, mintCost, logs] = await Promise.all([
      contract.totalSupply() as Promise<bigint>,
      contract.cost().catch(() => 0n) as Promise<bigint>,
      contract.queryFilter(contract.filters.Transfer(), fromBlock, currentBlock),
    ]);

    const mints = (logs as ethers.EventLog[]).filter(
      (l) => (l.args as any)[0] === ethers.ZeroAddress,
    );
    const owners = new Set(
      (logs as ethers.EventLog[]).map((l) => ((l.args as any)[1] as string)?.toLowerCase()).filter(Boolean),
    );

    const revenueWei = (mintCost * BigInt(mints.length)).toString();
    const pollSeconds = POLL_INTERVAL_MS / 1000;
    const mintVelocity = mints.length > 0 ? mints.length / (pollSeconds / 3600) : 0;

    await saveSnapshot({
      collectionId: config.collectionId,
      contractAddr: config.contractAddress,
      chainId: config.chainId,
      date: today,
      totalMinted: Number(totalSupply),
      uniqueOwners: owners.size,
      mintsCount: mints.length,
      revenueWei,
      mintVelocity,
    });

    console.log(
      '[indexer]',
      config.contractAddress.slice(0, 10) + '…',
      'totalMinted=' + totalSupply,
      'mints24h=' + mints.length,
      'owners=' + owners.size,
      'revenue=' + ethers.formatEther(revenueWei) + ' CRO',
    );
  } catch (err: any) {
    console.error('[indexer] Failed to index', config.contractAddress + ':', err.message);
  }
}





async function startApiServer(contracts: IndexerConfig[]) {
  const express = (await import('express')).default;
  const app = express();
  app.use(express.json());

  app.get('/snapshots', (_req: any, res: any) => {
    res.json(Array.from(memSnapshots.values()));
  });

  app.get('/snapshots/:address', (req: any, res: any) => {
    const key = req.params.address.toLowerCase();
    const found = Array.from(memSnapshots.entries()).find(([k]) => k.startsWith(key));
    if (!found) return res.status(404).json({ error: 'Not found' });
    res.json(found[1]);
  });

  
  app.post('/watch', (req: any, res: any) => {
    const { address, collectionId, chainId = 25, fromBlock = 0, name } = req.body;
    if (!address) return res.status(400).json({ error: 'address is required' });
    contracts.push({ contractAddress: address, collectionId, chainId, fromBlock, name });
    res.json({ success: true, watching: contracts.length });
  });

  app.get('/health', (_req: any, res: any) => res.json({ status: 'ok', snapshots: memSnapshots.size, watching: contracts.length }));

  app.listen(3001, () => console.log('[indexer] API server on :3001'));
}





async function main() {
  console.log('[analytics-indexer] Starting Cronos Studio Analytics Indexer v7.1');
  console.log('[analytics-indexer] Poll interval:', POLL_INTERVAL_MS / 1000 + 's');

  await initDB();

  const contracts: IndexerConfig[] = (process.env.WATCHED_CONTRACTS ?? '')
    .split(',')
    .filter(Boolean)
    .map((addr) => ({
      contractAddress: addr.trim(),
      chainId: 25,
      fromBlock: 0,
    }));

  if (contracts.length === 0) {
    console.log('[analytics-indexer] No contracts in WATCHED_CONTRACTS. POST to /watch to add contracts.');
  }

  await startApiServer(contracts);

  const poll = async () => {
    for (const config of contracts) {
      await indexContract(config).catch(() => {});
    }
  };

  await poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error('[analytics-indexer] Fatal:', err);
  process.exit(1);
});

export { IndexerConfig, indexContract };
