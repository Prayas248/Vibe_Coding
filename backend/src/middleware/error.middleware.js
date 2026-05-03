import logger from '../config/logger.js';

export const errorHandler = (err, req, res, next) => {
  logger.error(`Error: ${err.message}`, { stack: err.stack });

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.name || 'Error',
    message: err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};
