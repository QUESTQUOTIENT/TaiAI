

import express from 'express';
import {
  generateContract,
  compileContractController,
  verifyContract,
  saveDeployment,
  getDeployments,
  estimateGas,
  buildDeployTx,
} from '../controllers/contractController.js';

const router = express.Router();

router.post('/generate', generateContract);
router.post('/compile', compileContractController);
router.post('/build-deploy-tx', buildDeployTx);
router.post('/verify', verifyContract);
router.post('/estimate-gas', estimateGas);
router.post('/deployments', saveDeployment);
router.get('/deployments', getDeployments);

export default router;
