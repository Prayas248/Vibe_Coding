import express from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { arcjetGuard } from '../middleware/arcjet.middleware.js';
import { arcjetHistory } from '../config/arcjet.js';
import {
  listHistory,
  getHistoryItem,
  deleteHistoryItem,
} from '../controllers/history.controller.js';

const router = express.Router();

router.use(requireAuth);
router.use(arcjetGuard(arcjetHistory));

router.get('/', listHistory);
router.get('/:id', getHistoryItem);
router.delete('/:id', deleteHistoryItem);

export default router;
