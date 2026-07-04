import express from 'express';
import multer from 'multer';
import {
  uploadImages,
  uploadMetadata,
  validateCID,
  getPinStatus,
  uploadHiddenImage,
  uploadHiddenMetadata,
  prepareReveal,
  saveConfig,
  getConfig,
  replaceCID,
  getPreview,
  getJobStatus,
  getUploads,
} from '../controllers/ipfsController.js';
import { validateMetadataMiddleware } from '../middleware/metadataValidation.js';

const router = express.Router();


const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, 'uploads/'),
    filename: (_req, file, cb) => {
      const ext = file.originalname.split('.').pop() ?? 'bin';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, 
});


router.post('/config', saveConfig);
router.get('/config', getConfig);


router.post('/upload/images', upload.array('files', 500), uploadImages);
router.post('/upload/metadata', upload.array('files', 500), validateMetadataMiddleware, uploadMetadata);
router.post('/upload/hidden-image', upload.single('file'), uploadHiddenImage);
router.post('/upload/hidden-metadata', upload.single('file'), uploadHiddenMetadata);


router.get('/job/:jobId', getJobStatus);


router.get('/uploads', getUploads);


router.post('/validate', validateCID);
router.get('/pin-status/:cid', getPinStatus);
router.get('/preview/:cid', getPreview);


router.post('/prepare-reveal', prepareReveal);
router.post('/replace-cid', replaceCID);

export default router;
