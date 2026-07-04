

import { Router } from 'express';
import {
  getAnalyticsData,
  getCollectionAnalytics,
  getRevenueAnalytics,
  getHolderAnalytics,
} from '../controllers/analyticsController.js';

const router = Router();


router.get('/', getAnalyticsData);


router.get('/collection', getCollectionAnalytics);
router.get('/revenue', getRevenueAnalytics);
router.get('/holders', getHolderAnalytics);

export default router;
