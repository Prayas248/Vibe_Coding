import express from 'express';
import logger from './config/logger.js';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import analyzeRoutes from './routes/analyze.route.js';
import { errorHandler } from './middleware/error.middleware.js';

const app = express();

app.use((req, res, next) => {
  console.log('[RAW REQUEST]', req.method, req.url, req.headers['content-type']);
  next();
});

app.get('/debug/openalex', async (req, res) => {
  try {
    const response = await fetch(
      'https://api.openalex.org/works?search=transformer+attention+mechanism&per-page=1',
      { headers: { 'User-Agent': 'Vibe/1.0 (mailto:your@email.com)' } }
    );
    const data = await response.json();
    res.json({
      status: response.status,
      rateLimitRemaining: response.headers.get('x-ratelimit-remaining'),
      rateLimitReset: response.headers.get('x-ratelimit-reset'),
      resultCount: data.meta?.count ?? null,
      error: data.error ?? null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  morgan('combined', {
    stream: {
      write: message => logger.info(message.trim()),
    },
  })
);

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});
app.use('/analyze', analyzeRoutes);

app.use((req, res) => {
  res.status(404).send({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('[EXPRESS ERROR]', err.message);
  console.error('[EXPRESS STACK]', err.stack);
  res.status(500).json({ error: err.message });
});

export default app;
