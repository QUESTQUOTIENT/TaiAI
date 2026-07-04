

import 'dotenv/config';
import { ethers } from 'ethers';

const WS_RPC = process.env.CRONOS_WS_MAINNET ?? 'wss://ws.cronos.org';
const HTTP_RPC = process.env.CRONOS_RPC_MAINNET ?? 'https://evm.cronos.org';

const TRANSFER_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
];

interface WatchedContract {
  address: string;
  chainId: number;
  name: string;
  type: 'ERC721' | 'ERC20';
}

interface LiveEvent {
  type: 'Mint' | 'Transfer' | 'Burn';
  contractAddress: string;
  txHash: string;
  blockNumber: number;
  from: string;
  to: string;
  tokenId?: string;
  timestamp: number;
}

const watchedContracts: WatchedContract[] = [];
const eventBuffer: LiveEvent[] = [];
const MAX_BUFFER = 500;





let prisma: any = null;

async function initDB() {
  if (process.env.DATABASE_URL) {
    try {
      const { PrismaClient } = await import('@prisma/client');
      prisma = new PrismaClient();
      await prisma.$connect();
      console.log('[listener] Connected to database');
    } catch (err: any) {
      console.warn('[listener] DB unavailable:', err.message);
    }
  }
}

async function persistEvent(event: LiveEvent) {
  if (!prisma) return;
  try {
    if (event.type === 'Mint') {
      await prisma.mintEvent.create({
        data: {
          txHash: event.txHash,
          blockNumber: event.blockNumber,
          tokenId: event.tokenId ? parseInt(event.tokenId) : null,
          minterAddress: event.from === ethers.ZeroAddress ? event.to : event.from,
          toAddress: event.to,
          chainId: 25,
          timestamp: new Date(event.timestamp),
        },
      }).catch(() => {}); 
    } else {
      await prisma.transferEvent.create({
        data: {
          txHash: event.txHash,
          blockNumber: event.blockNumber,
          tokenId: event.tokenId ? parseInt(event.tokenId) : null,
          fromAddress: event.from,
          toAddress: event.to,
          chainId: 25,
          timestamp: new Date(event.timestamp),
        },
      }).catch(() => {});
    }
  } catch (err: any) {
    
    console.debug('[listener] DB persist error:', err.message);
  }
}





let wsProvider: ethers.WebSocketProvider | null = null;
let httpProvider: ethers.JsonRpcProvider;
const contractListeners: Map<string, ethers.Contract> = new Map();

async function connectWebSocket() {
  try {
    wsProvider = new ethers.WebSocketProvider(WS_RPC);
    console.log('[listener] WebSocket connected to', WS_RPC);

    
    for (const watched of watchedContracts) {
      await attachContractListener(watched);
    }

    
    (wsProvider as any).websocket?.addEventListener?.('close', () => {
      console.log('[listener] WebSocket closed — reconnecting in 5s…');
      wsProvider = null;
      contractListeners.clear();
      setTimeout(connectWebSocket, 5000);
    });
  } catch (err: any) {
    console.error('[listener] WebSocket connection failed:', err.message);
    console.log('[listener] Falling back to HTTP polling');
    httpProvider = new ethers.JsonRpcProvider(HTTP_RPC);
    startHttpPolling();
  }
}

async function attachContractListener(watched: WatchedContract) {
  const provider = wsProvider ?? httpProvider;
  if (!provider) return;

  
  if (contractListeners.has(watched.address.toLowerCase())) return;

  const contract = new ethers.Contract(watched.address, TRANSFER_ABI, provider);
  contractListeners.set(watched.address.toLowerCase(), contract);

  contract.on('Transfer', (from, to, tokenIdOrAmount, event) => {
    const isMint = from === ethers.ZeroAddress;
    const isBurn = to === ethers.ZeroAddress;

    const liveEvent: LiveEvent = {
      type: isMint ? 'Mint' : isBurn ? 'Burn' : 'Transfer',
      contractAddress: watched.address,
      txHash: event.log?.transactionHash ?? '',
      blockNumber: event.log?.blockNumber ?? 0,
      from,
      to,
      tokenId: tokenIdOrAmount?.toString(),
      timestamp: Date.now(),
    };

    eventBuffer.unshift(liveEvent);
    if (eventBuffer.length > MAX_BUFFER) eventBuffer.pop();

    persistEvent(liveEvent);

    console.log('[listener]', liveEvent.type, '|', watched.name, '| token #' + liveEvent.tokenId, '| tx', liveEvent.txHash.slice(0, 10) + '…');
  });

  console.log('[listener] Watching', watched.name, '(' + watched.address + ')');
}





let lastPolledBlock = 0;

async function startHttpPolling() {
  if (!httpProvider) httpProvider = new ethers.JsonRpcProvider(HTTP_RPC);

  const poll = async () => {
    try {
      const currentBlock = await httpProvider.getBlockNumber();
      if (lastPolledBlock === 0) lastPolledBlock = currentBlock - 100;

      for (const watched of watchedContracts) {
        const contract = new ethers.Contract(watched.address, TRANSFER_ABI, httpProvider);
        const logs = await contract.queryFilter(
          contract.filters.Transfer(),
          lastPolledBlock + 1,
          currentBlock,
        ) as ethers.EventLog[];

        for (const log of logs) {
          const from = (log.args as any)[0] as string;
          const to = (log.args as any)[1] as string;
          const tokenId = ((log.args as any)[2] as bigint)?.toString();
          const type = from === ethers.ZeroAddress ? 'Mint' : to === ethers.ZeroAddress ? 'Burn' : 'Transfer';

          const liveEvent: LiveEvent = {
            type,
            contractAddress: watched.address,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            from, to, tokenId,
            timestamp: Date.now(),
          };

          eventBuffer.unshift(liveEvent);
          if (eventBuffer.length > MAX_BUFFER) eventBuffer.pop();
          persistEvent(liveEvent);
        }
      }

      lastPolledBlock = currentBlock;
    } catch (err: any) {
      console.error('[listener] Poll error:', err.message);
    }
  };

  setInterval(poll, 10000);
  console.log('[listener] HTTP polling every 10s');
}





async function startApiServer() {
  const express = (await import('express')).default;
  const app = express();
  app.use(express.json());

  app.post('/watch', async (req: any, res: any) => {
    const { address, name = 'Unknown', type = 'ERC721', chainId = 25 } = req.body;
    if (!ethers.isAddress(address)) return res.status(400).json({ error: 'Invalid address' });

    const watched: WatchedContract = { address, name, type, chainId };
    if (!watchedContracts.find((c) => c.address.toLowerCase() === address.toLowerCase())) {
      watchedContracts.push(watched);
      await attachContractListener(watched);
    }
    res.json({ success: true, watching: watchedContracts.length });
  });

  app.delete('/watch/:address', (req: any, res: any) => {
    const idx = watchedContracts.findIndex((c) => c.address.toLowerCase() === req.params.address.toLowerCase());
    if (idx !== -1) {
      const contract = contractListeners.get(req.params.address.toLowerCase());
      if (contract) { contract.removeAllListeners(); contractListeners.delete(req.params.address.toLowerCase()); }
      watchedContracts.splice(idx, 1);
    }
    res.json({ success: true, watching: watchedContracts.length });
  });

  app.get('/events', (req: any, res: any) => {
    const { address, type, limit = '50' } = req.query;
    let events = eventBuffer;
    if (address) events = events.filter((e) => e.contractAddress.toLowerCase() === (address as string).toLowerCase());
    if (type) events = events.filter((e) => e.type === type);
    res.json(events.slice(0, parseInt(limit as string)));
  });

  app.get('/watching', (_req: any, res: any) => res.json(watchedContracts));

  app.get('/health', (_req: any, res: any) => res.json({
    status: 'ok',
    watching: watchedContracts.length,
    events: eventBuffer.length,
    wsConnected: wsProvider !== null,
    dbConnected: prisma !== null,
  }));

  app.listen(3002, () => console.log('[listener] API server on :3002'));
}





async function main() {
  console.log('[cronos-listener] Starting Cronos Studio Event Listener v7.1');

  await initDB();
  await startApiServer();

  const contractsEnv = process.env.WATCHED_CONTRACTS ?? '';
  for (const addr of contractsEnv.split(',').filter(Boolean)) {
    watchedContracts.push({
      address: addr.trim(),
      chainId: 25,
      name: 'Contract ' + addr.slice(0, 8),
      type: 'ERC721',
    });
  }

  await connectWebSocket();
}

main().catch((err) => {
  console.error('[cronos-listener] Fatal:', err);
  process.exit(1);
});
