import { arcjetEnabled } from '../config/arcjet.js';
import logger from '../config/logger.js';

function reasonResponse(decision) {
  if (decision.reason.isRateLimit()) {
    return {
      status: 429,
      body: {
        error: 'Rate limit exceeded. Please slow down and try again later.',
        retryAfter: decision.reason.resetTime
          ? Math.max(1, Math.floor((decision.reason.resetTime - Date.now()) / 1000))
          : null,
      },
    };
  }
  if (decision.reason.isBot()) {
    return {
      status: 403,
      body: { error: 'Automated traffic blocked.' },
    };
  }
  if (decision.reason.isShield()) {
    return {
      status: 403,
      body: { error: 'Request blocked by security policy.' },
    };
  }
  return { status: 403, body: { error: 'Request blocked.' } };
}

export function arcjetGuard(client, { requested = 1 } = {}) {
  return async (req, res, next) => {
    if (!arcjetEnabled) return next();

    try {
      const decision = await client.protect(req, {
        userId: req.user?.id ?? req.ip ?? 'anonymous',
        requested,
      });

      if (decision.isDenied()) {
        const { status, body } = reasonResponse(decision);
        if (body.retryAfter) res.setHeader('Retry-After', body.retryAfter);
        logger.info(
          `[ARCJET] denied ${req.method} ${req.originalUrl} → ${decision.reason.type}`
        );
        return res.status(status).json(body);
      }

      return next();
    } catch (err) {
      logger.warn(`[ARCJET] check errored, failing open: ${err.message}`);
      return next();
    }
  };
}
