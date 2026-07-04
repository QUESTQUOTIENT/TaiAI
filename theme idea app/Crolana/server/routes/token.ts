import { Router, Request, Response } from 'express';
import { getPrisma } from '../db.js';
import {
  generateTokenContract,
  compileTokenContract,
  saveTokenDeployment,
  getTokenTemplatesHandler,
  validateTokenHandler,
  generateTokenV2,
} from '../controllers/tokenController.js';

const router = Router();

router.post('/generate',      generateTokenContract);
router.post('/generate-v2',   generateTokenV2);
router.post('/compile',       compileTokenContract);
router.post('/save-deployment', saveTokenDeployment);
router.get('/templates',      getTokenTemplatesHandler);
router.post('/validate',      validateTokenHandler);


router.get('/list', async (req: Request, res: Response) => {
  try {
    const { chainId = 25, includeUnverified = 'false' } = req.query;
    const prisma = await getPrisma();

    const where: any = {
      chainId: Number(chainId),
    };
    if (includeUnverified !== 'true') {
      where.verified = true;
    }

    const tokens = await prisma.token.findMany({
      where,
      orderBy: {
        symbol: 'asc',
      },
      select: {
        id: true,
        address: true,
        name: true,
        symbol: true,
        decimals: true,
        logoUrl: true,
        logoMode: true,
        logoCid: true,
        chainId: true,
        verified: true,
        deployedAt: true,
      },
    });

    
    const METADATA_SERVICE_URL = process.env.METADATA_SERVICE_URL || 'http://localhost:3001';
    const resolvedTokens = await Promise.all(
      tokens.map(async (token) => {
        let logoURI: string | null = null;

        if (token.logoUrl) {
          
          logoURI = token.logoUrl;
        } else if (token.logoCid && token.logoMode === 'IPFS') {
          
          try {
            const response = await fetch(`${METADATA_SERVICE_URL}/api/metadata/${encodeURIComponent(token.logoCid)}`);
            if (response.ok) {
              const data = await response.json();
              logoURI = data.data?.image || null;
            }
          } catch (error) {
            console.error(`Failed to resolve IPFS logo for token ${token.symbol}:`, error);
            
            logoURI = `https://cloudflare-ipfs.com/ipfs/${token.logoCid}`;
          }
        }

        
        if (!logoURI && token.address) {
          const networkSlug = token.chainId === 25 ? 'cronos' : 'cronos-testnet';
          const trustWalletUrl = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${networkSlug}/assets/${token.address}/logo.png`;
          try {
            const logoRes = await fetch(trustWalletUrl, { method: 'HEAD' });
            if (logoRes.ok) {
              logoURI = trustWalletUrl;
            }
          } catch {
            
          }
        }

        return {
          ...token,
          logoURI,
        };
      })
    );

    res.json({
      success: true,
      total: resolvedTokens.length,
      chainId: Number(chainId),
      tokens: resolvedTokens,
      
      tokenList: {
        name: 'Crolana Token List',
        timestamp: new Date().toISOString(),
        version: {
          major: 1,
          minor: 0,
          patch: 0,
        },
        tokens: resolvedTokens.map(t => ({
          address: t.address,
          chainId: t.chainId,
          name: t.name,
          symbol: t.symbol,
          decimals: t.decimals,
          logoURI: t.logoURI,
        })),
      },
    });
  } catch (error: any) {
    console.error('Token list error:', error);
    res.status(500).json({
      success: false,
      error: 'TOKEN_LIST_FAILED',
      message: error.message,
    });
  }
});


router.get('/token-list.json', async (req: Request, res: Response) => {
  try {
    const response = await fetch(`${req.protocol}://${req.get('host')}/api/tokens/list`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch token list');
    }

    
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(data.tokenList, null, 2));
  } catch (error: any) {
    console.error('Token list JSON error:', error);
    res.status(500).json({
      name: 'Crolana Token List',
      timestamp: new Date().toISOString(),
      version: { major: 1, minor: 0, patch: 0 },
      tokens: [],
      error: error.message,
    });
  }
});

export default router;
