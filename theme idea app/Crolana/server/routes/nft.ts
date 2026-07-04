

import { Router, Request, Response } from 'express';
import {
  generateNFTCollection,
  buildNFTMetadata,
  getRarityLabel,
  type GenerateCollectionInput,
} from '../services/engines/nftEngineAdapter.js';

const router = Router();


router.post('/generate', async (req: Request, res: Response) => {
  const { collectionName, collectionDescription, totalSupply, layers, seed } = req.body;

  if (!collectionName || typeof collectionName !== 'string') {
    return res.status(400).json({ error: 'collectionName is required' });
  }
  if (!totalSupply || typeof totalSupply !== 'number' || totalSupply < 1) {
    return res.status(400).json({ error: 'totalSupply must be a positive number' });
  }
  if (!layers || !Array.isArray(layers) || layers.length === 0) {
    return res.status(400).json({ error: 'layers must be a non-empty array' });
  }

  try {
    const input: GenerateCollectionInput = {
      collectionName,
      collectionDescription: collectionDescription ?? '',
      totalSupply,
      layers,
      seed,
    };

    const result = await generateNFTCollection(input);

    res.json({
      success: true,
      totalGenerated:  result.totalGenerated,
      uniqueCount:     result.uniqueCount,
      rarityBreakdown: result.rarityBreakdown,
      distribution:    result.distribution,
      
      nfts: result.nfts.map((n) => ({
        id:          n.id,
        name:        n.name,
        description: n.description,
        dnaHash:     n.dnaHash,
        attributes:  n.attributes,
        rarity:      n.rarity,
        rarityRank:  n.rarityRank,
        rarityLabel: getRarityLabel(n.rarity),
        isLegendary: n.isLegendary,
      })),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? 'Collection generation failed' });
  }
});


router.post('/metadata', (req: Request, res: Response) => {
  const { nft, ipfsImagesCid, options } = req.body;

  if (!nft || !ipfsImagesCid) {
    return res.status(400).json({ error: 'nft and ipfsImagesCid are required' });
  }

  try {
    const metadata = buildNFTMetadata(nft, ipfsImagesCid, options);
    res.json(metadata);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
