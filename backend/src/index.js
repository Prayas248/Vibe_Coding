process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT]', err.message);
  console.error('[UNCAUGHT STACK]', err.stack);
});

process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]', err.message);
  console.error('[UNHANDLED STACK]', err.stack);
});

import 'dotenv/config.js';
import './server.js';

