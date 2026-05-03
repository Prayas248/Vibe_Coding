import express from 'express';
import multer from 'multer';
import { analyzePaper } from '../controllers/analyze.controller.js';

const router = express.Router();

// Configure multer to use memory storage
let upload;
try {
  upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB limit
    }
  });
  console.log('[MULTER] initialized ok');
} catch (err) {
  console.error('[MULTER INIT ERROR]', err.message);
}

router.post('/', (req, res, next) => {
  if (upload) {
    upload.single('file')(req, res, next);
  } else {
    next(new Error('Multer not initialized'));
  }
}, analyzePaper);

export default router;
