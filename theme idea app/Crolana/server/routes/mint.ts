

import express from 'express';
import {
  generateMerkleTree,
  getMerkleProof,
  createMintPhase,
  getMintPhases,
  updateMintPhase,
  deleteMintPhase,
  addWhitelistEntries,
  getWhitelistEntries,
  checkWhitelistStatus,
  removeWhitelistEntry,
  recordWalletMint,
  getWalletMintStatus,
  getActivePhase,
} from '../controllers/mintController.js';
import { requireAuth, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();


router.post('/merkle/generate', generateMerkleTree);
router.post('/merkle/proof', getMerkleProof);


router.post('/phases', requireAuth, createMintPhase);
router.get('/phases/:collectionId', getMintPhases);
router.put('/phases/:id', requireAuth, updateMintPhase);
router.delete('/phases/:id', requireAuth, deleteMintPhase);
router.get('/phases/:collectionId/active', getActivePhase);


router.post('/whitelist', requireAuth, addWhitelistEntries);
router.get('/whitelist/:collectionId', getWhitelistEntries);
router.get('/whitelist/check', checkWhitelistStatus);
router.delete('/whitelist', requireAuth, removeWhitelistEntry);


router.post('/record', optionalAuth, recordWalletMint);
router.get('/status', getWalletMintStatus);

export default router;
