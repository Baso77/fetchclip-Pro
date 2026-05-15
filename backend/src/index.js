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

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      return callback(null, true);
    }
    logger.warn(`CORS rejected origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
  credentials: true,
  maxAge: 86400,
}));

app.options('*', cors());
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(morgan('combined', { stream: { write: msg => logger.http(msg.trim()) } }));

// ============================================================
// PING ENDPOINT — Keep Render free tier alive (used by UptimeRobot)
// Must be BEFORE rate limiters so pings are never blocked
// ============================================================
app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});

// Also respond on root so UptimeRobot can ping base URL
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'FetchClip Pro API' });
});

// ============================================================
// API ROUTES
// ============================================================
app.use('/api/fetch', strictRateLimiter, fetchRouter);
app.use('/api/download', strictRateLimiter, downloadRouter);
app.use('/api/health', healthRouter);
app.use('/api/log', rateLimiter, logRouter);
app.use('/api/contact', rateLimiter, contactRouter);
app.use('/api/trending', rateLimiter, trendingRouter);
app.use('/api/admin', adminRouter);

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

app.use(errorHandler);

const server = app.listen(PORT, () => {
  logger.info(`FetchClip Pro backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

// Increased timeouts — yt-dlp can take up to 30s
server.timeout = 120000;
server.keepAliveTimeout = 65000;
server.headersTimeout = 70000;

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