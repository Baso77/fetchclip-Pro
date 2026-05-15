const { urlSchema, isSupportedUrl, sanitizeUrl } = require('../utils/urlUtils');
const { extractMetadata } = require('../services/ytdlpService');
const { logDownload, logAnalyticsEvent } = require('../services/supabaseService');
const { logger } = require('../utils/logger');

async function fetchController(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;

  let parsed;
  try {
    parsed = urlSchema.parse(req.body);
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.errors?.[0]?.message || 'Invalid URL provided',
      code: 'VALIDATION_ERROR',
    });
  }

  const cleanUrl = sanitizeUrl(parsed.url);
  if (!cleanUrl) {
    return res.status(400).json({ success: false, error: 'Malformed URL', code: 'INVALID_URL' });
  }

  if (!isSupportedUrl(cleanUrl)) {
    return res.status(422).json({
      success: false,
      error: 'This platform is not supported. Supported: YouTube, Instagram, TikTok, Facebook, Twitter/X, Pinterest, Vimeo, Reddit.',
      code: 'UNSUPPORTED_PLATFORM',
    });
  }

  try {
    const metadata = await extractMetadata(cleanUrl);

    // Fire analytics in background — don't await
    logAnalyticsEvent({
      event: 'fetch',
      platform: metadata.platform,
      metadata: { title: metadata.title, hasFormats: metadata.formats.length > 0 },
      ip,
    }).catch(() => {});

    return res.json({
      success: true,
      data: metadata,
    });
  } catch (err) {
    logDownload({
      url: cleanUrl,
      platform: 'unknown',
      success: false,
      error: err.message,
      ip,
      userAgent: req.headers['user-agent'],
    }).catch(() => {});

    return next(err);
  }
}

module.exports = { fetchController };