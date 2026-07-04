
import { Router } from 'express';
import multer from 'multer';
import {
  storageUploadAsset,
  storageUploadMetadata,
  storageGetCID,
} from '../controllers/ipfsController.js';
import { validateMetadataMiddleware } from '../middleware/metadataValidation.js';

const router = Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, 'uploads/'),
    filename: (_req, file, cb) => {
      const ext = file.originalname.split('.').pop() ?? 'bin';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, 
});

router.post('/uploadAsset',    upload.single('file'),          storageUploadAsset);
router.post('/uploadMetadata', upload.array('files', 10000), validateMetadataMiddleware, storageUploadMetadata);
router.get('/getCID/:jobId',   storageGetCID);

export default router;
