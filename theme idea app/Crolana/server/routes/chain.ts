
import { Router, Request, Response } from 'express';
import {
  getSolanaNFTs, getSolanaNFTMetadata,
  buildMintTransaction, buildListTransaction, buildBuyTransaction, getSolanaTransaction,
} from '../controllers/solanaMarketplaceController.js';
import { getSolanaNonce, verifySolanaAuth, getSolanaSession } from '../controllers/solanaAuthController.js';
import { TxTracker } from '../services/txTracker.js';
import { fetchAndParseMetadata, autoParseMetadata } from '../services/metadataParser.js';
import { requireAuth, requireChain } from '../middleware/authMiddleware.js';
import { OwnershipSyncer } from '../services/ownershipSync.js';

const router  = Router();
const tracker = TxTracker.getInstance();
const syncer  = OwnershipSyncer.getInstance();


router.get('/solana/nfts', async (req: Request, res: Response) => {
  const wallet       = req.query.wallet as string;
  const limit        = Math.min(Number(req.query.limit ?? 50), 200);
  const forceRefresh = req.query.forceRefresh === 'true';
  if (!wallet) { res.status(400).json({ error: 'wallet is required' }); return; }
  try {
    const result = await syncer.syncWallet({ wallet, chain: 'solana', forceRefresh });
    res.json({ success: true, nfts: result.nfts.slice(0, limit), total: result.total, source: result.source, syncedAt: result.syncedAt });
  } catch (err: any) { res.status(502).json({ error: err.message }); }
});

router.get('/solana/nft/:mintAddress', getSolanaNFTMetadata);
router.post('/solana/marketplace/mint', requireChain('solana'), buildMintTransaction);
router.post('/solana/marketplace/list', requireChain('solana'), buildListTransaction);
router.post('/solana/marketplace/buy',  requireAuth,            buildBuyTransaction);
router.get('/solana/tx/:signature',     getSolanaTransaction);


router.get('/cronos/nfts', async (req: Request, res: Response) => {
  const { wallet, contract, forceRefresh } = req.query as Record<string, string>;
  if (!wallet) { res.status(400).json({ error: 'wallet is required' }); return; }
  try {
    const result = await syncer.syncWallet({ wallet, chain: 'cronos', contractAddress: contract, forceRefresh: forceRefresh === 'true' });
    res.json({ success: true, nfts: result.nfts, total: result.total, source: result.source, syncedAt: result.syncedAt, ...(result.error && { warning: result.error }) });
  } catch (err: any) { res.status(502).json({ error: err.message }); }
});

router.get('/cronos/nft/:contractAddress/:tokenId', async (req: Request, res: Response) => {
  const { contractAddress, tokenId } = req.params;
  const covalentKey = process.env.COVALENT_API_KEY;
  try {
    let raw: any = null;
    if (covalentKey) {
      const r = await fetch(`https://api.covalenthq.com/v1/25/tokens/${contractAddress}/nft_metadata/${tokenId}/`, {
        headers: { Authorization: `Bearer ${covalentKey}` }, signal: AbortSignal.timeout(12_000),
      });
      if (r.ok) raw = (await r.json())?.data?.items?.[0] ?? null;
    }
    if (!raw) { res.status(404).json({ error: 'NFT not found' }); return; }
    const tokenURI = raw?.external_data?.token_url ?? raw?.tokenURI;
    const normalisedMetadata = tokenURI ? await fetchAndParseMetadata(tokenURI).catch(() => null) : null;
    res.json({ ...raw, normalisedMetadata });
  } catch (err: any) { res.status(502).json({ error: err.message }); }
});

router.post('/cronos/marketplace/list', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'EVM listing is performed via direct ethers.js contract call from frontend.' });
});

router.get('/cronos/tx/:txHash', async (req: Request, res: Response) => {
  const { txHash } = req.params;
  try {
    const rpc = process.env.CRONOS_MAINNET_RPC ?? 'https://evm.cronos.org';
    const r = await fetch(rpc, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
      signal: AbortSignal.timeout(12_000),
    });
    const receipt = (await r.json())?.result;
    if (!receipt) { res.json({ txHash, chain: 'cronos', status: 'pending', explorerUrl: `https://explorer.cronos.org/tx/${txHash}` }); return; }
    res.json({ txHash, chain: 'cronos', status: receipt.status === '0x1' ? 'confirmed' : 'failed', blockNumber: parseInt(receipt.blockNumber, 16), explorerUrl: `https://explorer.cronos.org/tx/${txHash}` });
  } catch (err: any) { res.status(502).json({ error: err.message }); }
});


router.get('/auth/solana/nonce',   getSolanaNonce);
router.post('/auth/solana/verify', verifySolanaAuth);
router.get('/auth/solana/me',      getSolanaSession);


router.post('/tx/track', async (req: Request, res: Response) => {
  const { chain, txHash, walletAddress, metadata } = req.body;
  if (!chain || !txHash || !walletAddress) { res.status(400).json({ error: 'chain, txHash, and walletAddress are required' }); return; }
  if (chain !== 'cronos' && chain !== 'solana') { res.status(400).json({ error: 'chain must be "cronos" or "solana"' }); return; }
  const record = tracker.track({ chain, txHash, walletAddress, metadata });
  tracker.persistToDb(record).catch((e: any) => console.warn('[txTracker] DB persist failed:', e?.message));
  res.json({ success: true, record });
});


router.get('/tx/by-hash/:txHash', (req: Request, res: Response) => {
  const record = tracker.getByHash(req.params.txHash);
  if (!record) { res.status(404).json({ error: 'Not tracking this transaction' }); return; }
  res.json(record);
});

router.get('/tx/wallet/:walletAddress', (req: Request, res: Response) => {
  res.json({ records: tracker.getByWallet(req.params.walletAddress), total: tracker.getByWallet(req.params.walletAddress).length });
});


router.get('/tx/:id', (req: Request, res: Response) => {
  const record = tracker.getStatus(req.params.id);
  if (!record) { res.status(404).json({ error: 'Transaction record not found' }); return; }
  res.json(record);
});


router.get('/metadata/resolve', async (req: Request, res: Response) => {
  const uri = req.query.uri as string;
  if (!uri) { res.status(400).json({ error: 'uri required' }); return; }
  try { res.json(await fetchAndParseMetadata(uri)); }
  catch (err: any) { res.status(502).json({ error: err.message }); }
});

router.post('/metadata/parse', (req: Request, res: Response) => {
  try { res.json(autoParseMetadata(req.body)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.post('/ownership/invalidate', (req: Request, res: Response) => {
  const { wallet, chain } = req.body;
  if (!wallet || !chain) { res.status(400).json({ error: 'wallet and chain required' }); return; }
  syncer.invalidate(wallet, chain as 'cronos' | 'solana');
  res.json({ success: true });
});

export default router;
