const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { getDownloadUrl, extractAudioUrl } = require('../services/ytdlpService');
const { logDownload } = require('../services/supabaseService');
const { sanitizeUrl, isSupportedUrl, detectPlatform } = require('../utils/urlUtils');
const { logger } = require('../utils/logger');

const downloadSchema = z.object({
  url:      z.string().url().max(2048),
  formatId: z.string().max(50).optional(),
  type:     z.enum(['video', 'audio', 'thumbnail']).optional().default('video'),
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
    return res.status(400).json({
      success: false,
      error: 'Invalid or unsupported URL',
      code: 'INVALID_URL',
    });
  }

  const platform = detectPlatform(cleanUrl);

  try {

    // ── THUMBNAIL ─────────────────────────────────────────────────────────
    if (parsed.type === 'thumbnail') {
      const { extractMetadata } = require('../services/ytdlpService');
      const meta = await extractMetadata(cleanUrl);
      if (!meta.thumbnail) {
        return res.status(404).json({ success: false, error: 'No thumbnail available', code: 'NO_THUMBNAIL' });
      }
      logDownload({ url: cleanUrl, platform, title: meta.title, type: 'thumbnail', ip, success: true }).catch(() => {});
      return res.json({
        success: true,
        directUrl: meta.thumbnail,
        filename: `thumbnail-${Date.now()}.jpg`,
        ext: 'jpg',
        type: 'thumbnail',
      });
    }

    // ── AUDIO ONLY ────────────────────────────────────────────────────────
    if (parsed.type === 'audio') {
      logger.info(`Audio download: ${platform} — ${cleanUrl}`);
      const { directUrl, ext, title } = await extractAudioUrl(cleanUrl);

      const safeTitle = (title || 'audio')
        .replace(/[^a-zA-Z0-9\s\-_]/g, '').slice(0, 80).trim() || 'fetchclip-audio';

      logDownload({ url: cleanUrl, platform, title, type: 'audio', ip, userAgent: req.headers['user-agent'], success: true }).catch(() => {});

      return res.json({
        success: true,
        directUrl,
        filename: `${safeTitle}.${ext || 'm4a'}`,
        ext: ext || 'm4a',
        type: 'audio',
      });
    }

    // ── VIDEO (always with audio) ─────────────────────────────────────────
    // getDownloadUrl() ignores the formatId and uses a safe combined-stream
    // selector that guarantees acodec != none. No more silent downloads.
    logger.info(`Video download: ${platform} — ${cleanUrl}`);
    const { directUrl, ext, title } = await getDownloadUrl(cleanUrl, parsed.formatId);

    if (!directUrl) throw new Error('DOWNLOAD_URL_FAILED');

    const safeTitle = (title || 'video')
      .replace(/[^a-zA-Z0-9\s\-_]/g, '').slice(0, 80).trim() || 'fetchclip';

    logDownload({
      url: cleanUrl, platform, title,
      quality: 'best-combined-av',
      type: 'video', ip, userAgent: req.headers['user-agent'], success: true,
    }).catch(() => {});

    return res.json({
      success: true,
      directUrl,
      filename: `${safeTitle}.${ext || 'mp4'}`,
      ext: ext || 'mp4',
      type: 'video',
    });

  } catch (err) {
    logger.error(`Download error [${platform}]: ${err.message}`);
    logDownload({ url: cleanUrl, platform, success: false, error: err.message, ip }).catch(() => {});
    return next(err);
  }
});

module.exports = router;