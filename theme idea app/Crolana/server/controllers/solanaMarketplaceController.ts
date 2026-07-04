

import { Request, Response } from 'express';
import { fromSolanaNFT } from '../../src/lib/unifiedNFT.js';
import { solanaLog, marketLog } from '../utils/logger.js';



function getHeliusRpc(cluster: 'mainnet' | 'devnet' = 'mainnet'): string | null {
  const key = process.env.HELIUS_API_KEY;
  if (!key) return null;
  return cluster === 'mainnet'
    ? `https://mainnet.helius-rpc.com/?api-key=${key}`
    : `https://devnet.helius-rpc.com/?api-key=${key}`;
}

function getSolRPCs(cluster: 'mainnet' | 'devnet' = 'mainnet'): string[] {
  return [
    process.env[cluster === 'mainnet' ? 'SOLANA_MAINNET_RPC' : 'SOLANA_DEVNET_RPC'],
    getHeliusRpc(cluster),
    cluster === 'mainnet' ? 'https://rpc.ankr.com/solana' : 'https://api.devnet.solana.com',
    cluster === 'mainnet' ? 'https://solana-rpc.publicnode.com' : null,
    'https://api.mainnet-beta.solana.com',
  ].filter(Boolean) as string[];
}

async function solRpc(method: string, params: unknown[], cluster: 'mainnet' | 'devnet' = 'mainnet'): Promise<unknown> {
  for (const rpc of getSolRPCs(cluster)) {
    const host = rpc.replace(/\?.*/, '').replace('https://', '');
    const t0 = Date.now();
    try {
      const res = await fetch(rpc, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(12_000),
      });
      const latencyMs = Date.now() - t0;
      if (!res.ok) { solanaLog.rpc(method, host, latencyMs, false); continue; }
      const json: any = await res.json();
      if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
      solanaLog.rpc(method, host, latencyMs, true);
      return json.result;
    } catch (e: any) {
      solanaLog.rpc(method, host, Date.now() - t0, false);
    }
  }
  throw new Error('All Solana RPC endpoints unavailable');
}



export const getSolanaNFTs = async (req: Request, res: Response): Promise<void> => {
  const wallet = req.query.wallet as string;
  const limit  = Math.min(Number(req.query.limit ?? 50), 100);
  const cursor = req.query.cursor as string | undefined;
  if (!wallet) { res.status(400).json({ error: 'wallet required' }); return; }

  try {
    const helius = getHeliusRpc('mainnet') ?? 'https://mainnet.helius-rpc.com/?api-key=public';
    const body: any = {
      jsonrpc: '2.0', id: 'get-assets', method: 'getAssetsByOwner',
      params: { ownerAddress: wallet, page: 1, limit, displayOptions: { showFungible: false, showNativeBalance: false } },
    };
    if (cursor) body.params.cursor = cursor;

    const r = await fetch(helius, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`Helius returned ${r.status}`);
    const json: any = await r.json();
    if (json.error) throw new Error(json.error.message ?? 'Helius DAS error');

    const items = (json.result?.items ?? []).filter((i: any) =>
      i.interface !== 'FungibleToken' && i.interface !== 'FungibleAsset'
    );
    const nfts = items.map((i: any) => fromSolanaNFT(i));
    solanaLog.info('NFT fetch complete', { chain: 'solana', wallet, total: nfts.length, source: 'helius' });
    res.json({ success: true, nfts, total: json.result?.total ?? nfts.length, cursor: json.result?.cursor });
  } catch (err: any) {
    
    try {
      const result: any = await solRpc('getTokenAccountsByOwner', [
        wallet,
        { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
        { encoding: 'jsonParsed' },
      ]);
      const accounts = (result?.value ?? []).filter((a: any) => {
        const amt = a.account?.data?.parsed?.info?.tokenAmount;
        return amt?.decimals === 0 && amt?.uiAmount === 1;
      });
      res.json({
        success: true,
        nfts: accounts.map((a: any) => ({
          chain: 'solana', mintAddress: a.account?.data?.parsed?.info?.mint ?? '',
          name: 'Unknown NFT', owner: wallet, isListed: false, attributes: [],
        })),
        total: accounts.length,
        note: 'Helius DAS unavailable — limited metadata',
      });
    } catch { res.status(502).json({ error: err.message }); }
  }
};



export const getSolanaNFTMetadata = async (req: Request, res: Response): Promise<void> => {
  const { mintAddress } = req.params;
  if (!mintAddress) { res.status(400).json({ error: 'mintAddress required' }); return; }
  try {
    const helius = getHeliusRpc('mainnet') ?? 'https://mainnet.helius-rpc.com/?api-key=public';
    const r = await fetch(helius, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mintAddress } }),
      signal: AbortSignal.timeout(12_000),
    });
    const json: any = await r.json();
    if (json.error || !json.result) { res.status(404).json({ error: 'NFT not found' }); return; }
    res.json(fromSolanaNFT(json.result));
  } catch (err: any) { res.status(502).json({ error: err.message }); }
};





export const buildMintTransaction = async (req: Request, res: Response): Promise<void> => {
  const { walletPublicKey, name, symbol = '', uri, sellerFeeBasisPoints = 500, collectionMint, cluster = 'mainnet' } = req.body;
  if (!walletPublicKey || !name || !uri) {
    res.status(400).json({ error: 'walletPublicKey, name, and uri are required' }); return;
  }

  try {
    
    const web3 = await import('@solana/web3.js');
    const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = web3;

    const endpoint = cluster === 'devnet' ? 'https://api.devnet.solana.com' : (getSolRPCs('mainnet')[0]);
    const connection = new Connection(endpoint, 'confirmed');
    const payer = new PublicKey(walletPublicKey);

    
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    
    
    
    
    const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
    const TOKEN_PROGRAM_ID    = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    
    
    marketLog.info('Mint tx built', { chain: 'solana', wallet: walletPublicKey, name, cluster });
    res.json({
      success: true,
      action: 'solana_mint',
      cluster,
      blockhash,
      lastValidBlockHeight,
      payer: walletPublicKey,
      metadataProgramId: METADATA_PROGRAM_ID.toBase58(),
      tokenProgramId: TOKEN_PROGRAM_ID.toBase58(),
      mintParams: {
        name: name.slice(0, 32),
        symbol: symbol.slice(0, 10),
        uri,
        sellerFeeBasisPoints: Number(sellerFeeBasisPoints),
        collection: collectionMint ? { key: collectionMint, verified: false } : null,
        creators: [{ address: walletPublicKey, verified: true, share: 100 }],
      },
      instructions: {
        note: 'Use @metaplex-foundation/js Metaplex.nfts().create() with the mintParams above.',
        quickMint: `// Example client code:\n// const metaplex = Metaplex.make(connection).use(walletAdapterIdentity(wallet));\n// const { nft } = await metaplex.nfts().create({ name: "${name}", uri: "${uri}", sellerFeeBasisPoints: ${sellerFeeBasisPoints} });`,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};



export const buildListTransaction = async (req: Request, res: Response): Promise<void> => {
  const { mintAddress, sellerPublicKey, lamports, cluster = 'mainnet' } = req.body;
  if (!mintAddress || !sellerPublicKey || !lamports) {
    res.status(400).json({ error: 'mintAddress, sellerPublicKey, and lamports are required' }); return;
  }

  try {
    const web3 = await import('@solana/web3.js');
    const { Connection, PublicKey, Transaction, SystemProgram } = web3;

    const endpoint  = cluster === 'devnet' ? 'https://api.devnet.solana.com' : getSolRPCs('mainnet')[0];
    const conn      = new Connection(endpoint, 'confirmed');
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    const priceSOL  = (Number(lamports) / 1e9).toFixed(4);

    
    
    
    marketLog.info('List tx built', { chain: 'solana', mintAddress, wallet: sellerPublicKey, priceSOL: `${priceSOL} SOL`, cluster });
    res.json({
      success: true,
      action: 'solana_list',
      cluster,
      blockhash,
      lastValidBlockHeight,
      listing: {
        mintAddress,
        seller: sellerPublicKey,
        price: lamports,
        priceSOL: `${priceSOL} SOL`,
        currency: 'SOL',
      },
      
      marketplaceLinks: {
        tensor:     `https://www.tensor.trade/item/${mintAddress}`,
        magicEden:  `https://magiceden.io/item-details/${mintAddress}`,
        instructions: 'List via Tensor or Magic Eden for production trading. Custom escrow requires a deployed Anchor program.',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};



export const buildBuyTransaction = async (req: Request, res: Response): Promise<void> => {
  const { mintAddress, buyerPublicKey, sellerPublicKey, lamports, cluster = 'mainnet' } = req.body;
  if (!mintAddress || !buyerPublicKey || !lamports) {
    res.status(400).json({ error: 'mintAddress, buyerPublicKey, and lamports are required' }); return;
  }

  try {
    const web3 = await import('@solana/web3.js');
    const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = web3;

    const endpoint  = cluster === 'devnet' ? 'https://api.devnet.solana.com' : getSolRPCs('mainnet')[0];
    const conn      = new Connection(endpoint, 'confirmed');
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');

    const buyer  = new PublicKey(buyerPublicKey);
    const priceSOL = (Number(lamports) / 1e9).toFixed(4);

    
    
    let serialisedTx: string | null = null;
    if (sellerPublicKey) {
      const seller = new PublicKey(sellerPublicKey);
      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: buyer,
      }).add(
        SystemProgram.transfer({
          fromPubkey: buyer,
          toPubkey:   seller,
          lamports:   BigInt(lamports),
        })
      );
      
      serialisedTx = tx.serialize({ requireAllSignatures: false }).toString('base64');
    }

    marketLog.info('Buy tx built', { chain: 'solana', mintAddress, wallet: buyerPublicKey, priceSOL: `${(Number(lamports) / 1e9).toFixed(4)} SOL`, hasSerialisedTx: !!serialisedTx });
    res.json({
      success: true,
      action: 'solana_buy',
      cluster,
      blockhash,
      lastValidBlockHeight,
      purchase: {
        mintAddress, buyer: buyerPublicKey,
        seller: sellerPublicKey ?? 'unknown',
        price: lamports, priceSOL: `${priceSOL} SOL`, currency: 'SOL',
      },
      
      serialisedTransaction: serialisedTx,
      marketplaceLinks: {
        tensor:    `https://www.tensor.trade/item/${mintAddress}`,
        magicEden: `https://magiceden.io/item-details/${mintAddress}`,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};



export const getSolanaTransaction = async (req: Request, res: Response): Promise<void> => {
  const { signature } = req.params;
  const cluster = req.query.cluster === 'devnet' ? 'devnet' : 'mainnet';
  try {
    const result: any = await solRpc(
      'getSignatureStatuses', [[signature], { searchTransactionHistory: true }], cluster,
    );
    const info = result?.value?.[0];
    if (!info) {
      res.json({ txHash: signature, chain: 'solana', status: 'pending', explorerUrl: `https://solscan.io/tx/${signature}` });
      return;
    }
    res.json({
      txHash: signature, chain: 'solana',
      status: info.err ? 'failed' : (info.confirmationStatus === 'confirmed' || info.confirmationStatus === 'finalized') ? 'confirmed' : 'pending',
      slot: info.slot, confirmationStatus: info.confirmationStatus,
      explorerUrl: `https://solscan.io/tx/${signature}`,
    });
  } catch (err: any) { res.status(502).json({ error: err.message }); }
};
