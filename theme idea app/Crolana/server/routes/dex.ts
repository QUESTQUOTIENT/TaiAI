import { Router } from 'express';
import { getQuote, getPairInfo, getTokenInfo, searchTokens } from '../controllers/dexController.js';

const router = Router();

router.get('/quote', getQuote);
router.get('/pair', getPairInfo);
router.get('/token', getTokenInfo);
router.get('/tokens/search', searchTokens);

export default router;
