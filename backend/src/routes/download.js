const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { getDownloadUrl } = require('../services/ytdlpService');
const { logDownload } = require('../services/supabaseService');
const { urlSchema, sanitizeUrl, isSupportedUrl, detectPlatform } = require('../utils/urlUtils');
const { logger } = require('../utils/logger');

const downloadSchema = z.object({
  url: z.string().url().max(2048),
  formatId: z.string().max(50).optional(),
  type: z.enum(['video', 'audio', 'thumbnail']).optional().default('video'),
});

router.post('/', async (req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;

  let parsed;
  try {
    parsed = downloadSchema.parse(req.body);
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.errors?.[0]?.message || 'Invalid request',
      code: 'VALIDATION_ERROR',
    });
  }

  const cleanUrl = sanitizeUrl(parsed.url);
  if (!cleanUrl || !isSupportedUrl(cleanUrl)) {
    return res.status(400).json({ success: false, error: 'Invalid or unsupported URL', code: 'INVALID_URL' });
  }

  const platform = detectPlatform(cleanUrl);

  try {
    if (parsed.type === 'thumbnail') {
      const { extractMetadata } = require('../services/ytdlpService');
      const meta = await extractMetadata(cleanUrl);
      if (!meta.thumbnail) {
        return res.status(404).json({ success: false, error: 'No thumbnail available', code: 'NO_THUMBNAIL' });
      }
      logDownload({ url: cleanUrl, platform, title: meta.title, type: 'thumbnail', ip, success: true }).catch(() => {});
      return res.json({ success: true, directUrl: meta.thumbnail, filename: `thumbnail.jpg`, type: 'thumbnail' });
    }

    const formatId = parsed.type === 'audio'
      ? 'bestaudio[ext=m4a]/bestaudio/best'
      : (parsed.formatId || 'best[ext=mp4][height<=1080]/best[ext=mp4]/best');

    const { directUrl, ext, title } = await getDownloadUrl(cleanUrl, formatId);

    if (!directUrl) {
      throw new Error('DOWNLOAD_URL_FAILED');
    }

    const safeTitle = (title || 'video').replace(/[^a-zA-Z0-9\s\-_]/g, '').slice(0, 80).trim();
    const filename = `${safeTitle}.${ext}`;

    logDownload({
      url: cleanUrl, platform, title, quality: parsed.formatId || 'best',
      type: parsed.type, ip, userAgent: req.headers['user-agent'], success: true,
    }).catch(() => {});

    logger.info(`Download URL generated for ${platform}: ${safeTitle}`);

    return res.json({
      success: true,
      directUrl,
      filename,
      ext,
      type: parsed.type,
    });
  } catch (err) {
    logDownload({ url: cleanUrl, platform, success: false, error: err.message, ip }).catch(() => {});
    return next(err);
  }
});

module.exports = router;
