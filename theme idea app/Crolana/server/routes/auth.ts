import { Router } from 'express';
import { getNonce, verifySignature, getSession, logout } from '../controllers/authController.js';

const router = Router();

router.get('/nonce', getNonce);
router.post('/verify', verifySignature);
router.get('/me', getSession);
router.post('/logout', logout);

export default router;
