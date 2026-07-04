

import { Request, Response } from 'express';
import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';
import { ethers } from 'ethers';





function isValidAddress(addr: string): boolean {
  try { ethers.getAddress(addr); return true; } catch { return false; }
}





let prismaClient: any = null;

async function getPrisma() {
  if (!prismaClient) {
    try {
      const { PrismaClient } = await import('@prisma/client');
      prismaClient = new PrismaClient();
    } catch {
      return null;
    }
  }
  return prismaClient;
}





export const generateMerkleTree = async (req: Request, res: Response) => {
  try {
    const { addresses } = req.body;

    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return res.status(400).json({ error: 'addresses must be a non-empty array' });
    }
    if (addresses.length > 10000) {
      return res.status(400).json({ error: 'Maximum 10,000 addresses per Merkle tree' });
    }

    const invalidAddresses: string[] = [];
    const normalized: string[] = [];

    for (const addr of addresses) {
      if (typeof addr !== 'string' || !isValidAddress(addr)) {
        invalidAddresses.push(addr);
      } else {
        normalized.push(ethers.getAddress(addr));
      }
    }

    if (invalidAddresses.length > 0) {
      return res.status(400).json({
        error: 'Invalid Ethereum addresses found',
        invalidAddresses: invalidAddresses.slice(0, 10),
        totalInvalid: invalidAddresses.length,
      });
    }

    const unique = [...new Set(normalized)];
    const leaves = unique.map((addr) => keccak256(addr));
    const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    const root = tree.getHexRoot();

    res.json({
      root,
      totalAddresses: unique.length,
      duplicatesRemoved: addresses.length - unique.length,
      leaves: leaves.map((l) => '0x' + l.toString('hex')),
    });
  } catch (error: any) {
    console.error('[mintController] generateMerkleTree error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getMerkleProof = async (req: Request, res: Response) => {
  try {
    const { address, addresses } = req.body;

    if (!address || !addresses || !Array.isArray(addresses)) {
      return res.status(400).json({ error: 'address and addresses array are required' });
    }
    if (!isValidAddress(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address: ' + address });
    }

    const normalizedTarget = ethers.getAddress(address);
    const normalized = addresses.map((a: string) => ethers.getAddress(a));
    const leaves = normalized.map((addr: string) => keccak256(addr));
    const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    const leaf = keccak256(normalizedTarget);
    const proof = tree.getHexProof(leaf);
    const root = tree.getHexRoot();
    const isValid = tree.verify(proof, leaf, root);

    res.json({ proof, root, isValid });
  } catch (error: any) {
    console.error('[mintController] getMerkleProof error:', error);
    res.status(500).json({ error: error.message });
  }
};





export const createMintPhase = async (req: Request, res: Response) => {
  try {
    const { collectionId, name, phaseType, startTime, endTime, price, maxPerWallet, maxSupply, merkleRoot, order } = req.body;

    if (!collectionId || !name || !startTime) {
      return res.status(400).json({ error: 'collectionId, name, and startTime are required' });
    }

    const prisma = await getPrisma();
    if (!prisma) {
      return res.status(503).json({ error: 'Database not configured. Set DATABASE_URL in .env' });
    }

    const phase = await prisma.mintPhase.create({
      data: {
        collectionId,
        name,
        phaseType: phaseType ?? 'PUBLIC',
        startTime: new Date(startTime),
        endTime: endTime ? new Date(endTime) : null,
        price: price ?? '0',
        maxPerWallet: maxPerWallet ?? 0,
        maxSupply: maxSupply ?? null,
        merkleRoot: merkleRoot ?? null,
        order: order ?? 0,
        isActive: false,
      },
    });

    res.status(201).json({ success: true, phase });
  } catch (error: any) {
    console.error('[mintController] createMintPhase error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getMintPhases = async (req: Request, res: Response) => {
  try {
    const { collectionId } = req.params;
    if (!collectionId) return res.status(400).json({ error: 'collectionId is required' });

    const prisma = await getPrisma();
    if (!prisma) return res.status(503).json({ error: 'Database not configured' });

    const phases = await prisma.mintPhase.findMany({
      where: { collectionId },
      orderBy: { order: 'asc' },
    });

    res.json({ phases });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateMintPhase = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const prisma = await getPrisma();
    if (!prisma) return res.status(503).json({ error: 'Database not configured' });

    const phase = await prisma.mintPhase.update({
      where: { id },
      data: {
        ...updates,
        startTime: updates.startTime ? new Date(updates.startTime) : undefined,
        endTime: updates.endTime ? new Date(updates.endTime) : undefined,
      },
    });

    res.json({ success: true, phase });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteMintPhase = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const prisma = await getPrisma();
    if (!prisma) return res.status(503).json({ error: 'Database not configured' });

    await prisma.mintPhase.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};





export const addWhitelistEntries = async (req: Request, res: Response) => {
  try {
    const { collectionId, addresses, maxMints = 1 } = req.body;

    if (!collectionId || !addresses || !Array.isArray(addresses)) {
      return res.status(400).json({ error: 'collectionId and addresses array are required' });
    }

    const prisma = await getPrisma();
    if (!prisma) return res.status(503).json({ error: 'Database not configured' });

    const invalid: string[] = [];
    const normalized: string[] = [];

    for (const addr of addresses) {
      if (!isValidAddress(addr)) invalid.push(addr);
      else normalized.push(ethers.getAddress(addr).toLowerCase());
    }

    if (invalid.length > 0) {
      return res.status(400).json({ error: 'Invalid addresses', invalidAddresses: invalid.slice(0, 10) });
    }

    const unique = [...new Set(normalized)];

    const result = await prisma.whitelistEntry.createMany({
      data: unique.map((address) => ({ collectionId, address, maxMints })),
      skipDuplicates: true,
    });

    res.status(201).json({ success: true, added: result.count, total: unique.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getWhitelistEntries = async (req: Request, res: Response) => {
  try {
    const { collectionId } = req.params;
    const { page = '1', limit = '100' } = req.query as Record<string, string>;

    const prisma = await getPrisma();
    if (!prisma) return res.status(503).json({ error: 'Database not configured' });

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [entries, total] = await Promise.all([
      prisma.whitelistEntry.findMany({
        where: { collectionId },
        skip,
        take: parseInt(limit),
        orderBy: { addedAt: 'desc' },
      }),
      prisma.whitelistEntry.count({ where: { collectionId } }),
    ]);

    res.json({ entries, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const checkWhitelistStatus = async (req: Request, res: Response) => {
  try {
    const { collectionId, address } = req.query as Record<string, string>;

    if (!collectionId || !address) {
      return res.status(400).json({ error: 'collectionId and address are required' });
    }
    if (!isValidAddress(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    const prisma = await getPrisma();
    if (!prisma) return res.status(503).json({ error: 'Database not configured' });

    const normalizedAddr = ethers.getAddress(address).toLowerCase();

    const [entry, mintCount] = await Promise.all([
      prisma.whitelistEntry.findUnique({
        where: { collectionId_address: { collectionId, address: normalizedAddr } },
      }),
      prisma.walletMint.aggregate({
        where: { collectionId, walletAddress: normalizedAddr },
        _sum: { quantity: true },
      }),
    ]);

    const totalMinted = mintCount._sum.quantity ?? 0;

    res.json({
      isWhitelisted: !!entry,
      maxMints: entry?.maxMints ?? 0,
      totalMinted,
      remainingMints: entry ? Math.max(0, entry.maxMints - totalMinted) : 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const removeWhitelistEntry = async (req: Request, res: Response) => {
  try {
    const { collectionId, address } = req.body;

    if (!collectionId || !address) {
      return res.status(400).json({ error: 'collectionId and address are required' });
    }

    const prisma = await getPrisma();
    if (!prisma) return res.status(503).json({ error: 'Database not configured' });

    await prisma.whitelistEntry.deleteMany({
      where: { collectionId, address: address.toLowerCase() },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};





export const recordWalletMint = async (req: Request, res: Response) => {
  try {
    const { collectionId, phaseId, walletAddress, quantity, txHash } = req.body;

    if (!collectionId || !walletAddress) {
      return res.status(400).json({ error: 'collectionId and walletAddress are required' });
    }
    if (!isValidAddress(walletAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    const prisma = await getPrisma();
    if (!prisma) return res.status(503).json({ error: 'Database not configured' });

    const normalizedAddr = ethers.getAddress(walletAddress).toLowerCase();

    
    if (phaseId) {
      const phase = await prisma.mintPhase.findUnique({ where: { id: phaseId } });
      if (!phase) return res.status(404).json({ error: 'Mint phase not found' });

      const now = new Date();
      if (now < phase.startTime) return res.status(400).json({ error: 'Mint phase not started yet' });
      if (phase.endTime && now > phase.endTime) return res.status(400).json({ error: 'Mint phase has ended' });

      if (phase.maxPerWallet > 0) {
        const existing = await prisma.walletMint.aggregate({
          where: { collectionId, phaseId, walletAddress: normalizedAddr },
          _sum: { quantity: true },
        });
        const minted = existing._sum.quantity ?? 0;
        if (minted + (quantity ?? 1) > phase.maxPerWallet) {
          return res.status(400).json({
            error: 'Exceeds phase mint limit',
            limit: phase.maxPerWallet,
            alreadyMinted: minted,
          });
        }
      }
    }

    const record = await prisma.walletMint.create({
      data: {
        collectionId,
        phaseId: phaseId ?? null,
        walletAddress: normalizedAddr,
        quantity: quantity ?? 1,
        txHash: txHash ?? null,
      },
    });

    res.status(201).json({ success: true, record });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getWalletMintStatus = async (req: Request, res: Response) => {
  try {
    const { collectionId, walletAddress } = req.query as Record<string, string>;

    if (!collectionId || !walletAddress) {
      return res.status(400).json({ error: 'collectionId and walletAddress are required' });
    }

    const prisma = await getPrisma();
    if (!prisma) return res.status(503).json({ error: 'Database not configured' });

    const normalizedAddr = walletAddress.toLowerCase();

    const [totalMinted, byPhase] = await Promise.all([
      prisma.walletMint.aggregate({
        where: { collectionId, walletAddress: normalizedAddr },
        _sum: { quantity: true },
      }),
      prisma.walletMint.groupBy({
        by: ['phaseId'],
        where: { collectionId, walletAddress: normalizedAddr },
        _sum: { quantity: true },
      }),
    ]);

    res.json({
      walletAddress: normalizedAddr,
      collectionId,
      totalMinted: totalMinted._sum.quantity ?? 0,
      byPhase: byPhase.map((p) => ({ phaseId: p.phaseId, quantity: p._sum.quantity ?? 0 })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};





export const getActivePhase = async (req: Request, res: Response) => {
  try {
    const { collectionId } = req.params;

    const prisma = await getPrisma();
    if (!prisma) return res.status(503).json({ error: 'Database not configured' });

    const now = new Date();

    const phase = await prisma.mintPhase.findFirst({
      where: {
        collectionId,
        startTime: { lte: now },
        OR: [
          { endTime: null },
          { endTime: { gte: now } },
        ],
      },
      orderBy: { order: 'asc' },
    });

    if (!phase) {
      return res.json({ activePhase: null, message: 'No active mint phase' });
    }

    res.json({ activePhase: phase });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
