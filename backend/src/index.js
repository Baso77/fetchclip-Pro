require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const { validateEnv } = require('./utils/validateEnv');
const { logger } = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');
const { rateLimiter, strictRateLimiter } = require('./middleware/rateLimiter');

const fetchRouter = require('./routes/fetch');
const downloadRouter = require('./routes/download');
const healthRouter = require('./routes/health');
const logRouter = require('./routes/log');
const contactRouter = require('./routes/contact');
const trendingRouter = require('./routes/trending');
const adminRouter = require('./routes/admin');

validateEnv();

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean);

logger.info(`CORS allowed origins: ${allowedOrigins.join(', ')}`);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin
    // (mobile apps, curl, Postman, server-side requests)
    if (!origin) {
      return callback(null, true);
    }

    // Exact match OR allow all Vercel preview domains
    const isAllowed =
      allowedOrigins.includes(origin) ||
      origin.endsWith('.vercel.app');

    if (isAllowed) {
      return callback(null, true);
    }

    logger.warn(`CORS blocked origin: ${origin}`);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },

  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Admin-Key',
  ],

  credentials: true,

  optionsSuccessStatus: 200,
}));

// Explicit OPTIONS handling
app.options('*', cors());

app.use(compression());

app.use(express.json({
  limit: '10kb',
}));

app.use(express.urlencoded({
  extended: false,
  limit: '10kb',
}));

app.use(morgan('combined', {
  stream: {
    write: msg => logger.http(msg.trim()),
  },
}));

// Routes
app.use('/api/fetch', strictRateLimiter, fetchRouter);
app.use('/api/download', strictRateLimiter, downloadRouter);
app.use('/api/health', healthRouter);
app.use('/api/log', rateLimiter, logRouter);
app.use('/api/contact', rateLimiter, contactRouter);
app.use('/api/trending', rateLimiter, trendingRouter);
app.use('/api/admin', adminRouter);

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// Error handler
app.use(errorHandler);

const server = app.listen(PORT, () => {
  logger.info(
    `FetchClip Pro backend running on port ${PORT} [${process.env.NODE_ENV}]`
  );
});

server.timeout = 120000;
server.keepAliveTimeout = 65000;

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server gracefully');

  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});

module.exports = app;