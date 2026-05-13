const rateLimit = require('express-rate-limit');

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000;
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 30;

const rateLimiter = rateLimit({
  windowMs,
  max: maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please wait a moment and try again.',
    code: 'RATE_LIMITED',
  },
  skip: (req) => req.path === '/api/health',
});

const strictRateLimiter = rateLimit({
  windowMs: 60000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many download requests. Please wait a minute and try again.',
    code: 'RATE_LIMITED',
  },
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
  },
});

module.exports = { rateLimiter, strictRateLimiter };
