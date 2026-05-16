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
    // ── THUMBNAIL ──────────────────────────────────────────────────────────────
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
        type: 'thumbnail',
      });
    }

    // ── AUDIO ONLY ─────────────────────────────────────────────────────────────
    if (parsed.type === 'audio') {
      const { directUrl, ext, title } = await getDownloadUrl(
        cleanUrl,
        'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best'
      );
      if (!directUrl) throw new Error('DOWNLOAD_URL_FAILED');

      const safeTitle = (title || 'audio').replace(/[^a-zA-Z0-9\s\-_]/g, '').slice(0, 80).trim() || 'fetchclip-audio';
      logDownload({ url: cleanUrl, platform, title, type: 'audio', ip, userAgent: req.headers['user-agent'], success: true }).catch(() => {});

      return res.json({
        success: true,
        directUrl,
        filename: `${safeTitle}.${ext || 'm4a'}`,
        ext: ext || 'm4a',
        type: 'audio',
      });
    }

    // ── VIDEO (with audio) ─────────────────────────────────────────────────────
    // CRITICAL: Most social platforms (Instagram, TikTok, Facebook, Twitter)
    // serve combined streams (video + audio in one file). We MUST pick a
    // format where acodec != 'none'. Picking a video-only stream causes
    // silent/muted downloads.
    //
    // Selector priority:
    //  1. Best single-file MP4 ≤1080p that has BOTH video AND audio
    //  2. Best single-file with both codecs (any resolution)
    //  3. Best mp4 (fallback)
    //  4. Absolute best (last resort)
    const combinedSelector =
      'best[ext=mp4][vcodec!=none][acodec!=none][height<=1080]' +
      '/best[ext=mp4][vcodec!=none][acodec!=none]' +
      '/best[vcodec!=none][acodec!=none][height<=1080]' +
      '/best[vcodec!=none][acodec!=none]' +
      '/best[ext=mp4]' +
      '/best';

    const { directUrl, ext, title } = await getDownloadUrl(cleanUrl, combinedSelector);
    if (!directUrl) throw new Error('DOWNLOAD_URL_FAILED');

    const safeTitle = (title || 'video').replace(/[^a-zA-Z0-9\s\-_]/g, '').slice(0, 80).trim() || 'fetchclip';
    logDownload({
      url: cleanUrl, platform, title,
      quality: 'best-combined-av',
      type: 'video', ip, userAgent: req.headers['user-agent'], success: true,
    }).catch(() => {});

    logger.info(`Video+Audio download for ${platform}: ${safeTitle}`);
    return res.json({
      success: true,
      directUrl,
      filename: `${safeTitle}.${ext || 'mp4'}`,
      ext: ext || 'mp4',
      type: 'video',
    });

  } catch (err) {
    logDownload({ url: cleanUrl, platform, success: false, error: err.message, ip }).catch(() => {});
    return next(err);
  }
});

module.exports = router;