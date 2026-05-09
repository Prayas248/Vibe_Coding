import express from 'express';
import multer from 'multer';
import { analyzePaper } from '../controllers/analyze.controller.js';
import { progressEmitter } from '../utils/progressEmitter.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { arcjetGuard } from '../middleware/arcjet.middleware.js';
import { arcjetAnalyze } from '../config/arcjet.js';

const router = express.Router();

// SSE endpoint for live progress updates
router.get('/progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const onProgress = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  progressEmitter.on(sessionId, onProgress);

  req.on('close', () => {
    progressEmitter.removeListener(sessionId, onProgress);
  });
});

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

router.post('/', requireAuth, arcjetGuard(arcjetAnalyze), (req, res, next) => {
  if (upload) {
    upload.single('file')(req, res, next);
  } else {
    next(new Error('Multer not initialized'));
  }
}, analyzePaper);

export default router;
