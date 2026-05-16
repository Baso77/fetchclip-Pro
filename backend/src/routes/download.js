const express = require('express');
const router  = express.Router();
const { z }   = require('zod');
const { getDownloadUrl }                          = require('../services/ytdlpService');
const { logDownload }                             = require('../services/supabaseService');
const { urlSchema, sanitizeUrl, isSupportedUrl, detectPlatform } = require('../utils/urlUtils');
const { logger }                                  = require('../utils/logger');

const downloadSchema = z.object({
  url:      z.string().url().max(2048),
  formatId: z.string().max(50).optional(),
  type:     z.enum(['video', 'audio', 'thumbnail']).optional().default('video'),
});

router.post('/', async (req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;

  // ── Validate input ─────────────────────────────────────────────────────
  let parsed;
  try {
    parsed = downloadSchema.parse(req.body);
  } catch (err) {
    return res.status(400).json({
      success: false,
      error:   err.errors?.[0]?.message || 'Invalid request',
      code:    'VALIDATION_ERROR',
    });
  }

  const cleanUrl = sanitizeUrl(parsed.url);
  if (!cleanUrl || !isSupportedUrl(cleanUrl)) {
    return res.status(400).json({
      success: false,
      error:   'Invalid or unsupported URL',
      code:    'INVALID_URL',
    });
  }

  const platform = detectPlatform(cleanUrl);
  const type     = parsed.type; // 'video' | 'audio' | 'thumbnail'

  try {

    // ── Thumbnail ──────────────────────────────────────────────────────────
    if (type === 'thumbnail') {
      const { extractMetadata } = require('../services/ytdlpService');
      const meta = await extractMetadata(cleanUrl);
      if (!meta.thumbnail) {
        return res.status(404).json({
          success: false,
          error:   'No thumbnail available',
          code:    'NO_THUMBNAIL',
        });
      }
      logDownload({ url: cleanUrl, platform, title: meta.title, type: 'thumbnail', ip, success: true }).catch(() => {});
      return res.json({
        success:   true,
        directUrl: meta.thumbnail,
        filename:  `thumbnail.jpg`,
        ext:       'jpg',
        type:      'thumbnail',
      });
    }

    // ── Audio or Video ─────────────────────────────────────────────────────
    //
    // FIX: We now pass both (formatId, type) to getDownloadUrl.
    // getDownloadUrl uses type to decide the yt-dlp selector:
    //   - type='audio' → bestaudio selector chain (guaranteed acodec present)
    //   - type='video' with formatId → merge that format with bestaudio
    //   - type='video' without formatId → bestvideo+bestaudio merged
    //
    // The old bug was: formatId was passed but type was ignored in getDownloadUrl,
    // so audio requests sometimes used a video format selector.

    const { directUrl, ext, title, acodec, vcodec } = await getDownloadUrl(
      cleanUrl,
      parsed.formatId,  // may be undefined, a format_id string, or 'bestaudio'
      type              // 'video' or 'audio'
    );

    if (!directUrl) throw new Error('DOWNLOAD_URL_FAILED');

    // ── Build filename ─────────────────────────────────────────────────────
    // Determine correct extension based on actual returned format
    let finalExt = ext || 'mp4';
    if (type === 'audio') {
      // Prefer m4a/mp3 for audio; if yt-dlp returned webm that's fine too
      finalExt = ['m4a', 'mp3', 'webm', 'ogg', 'opus'].includes(ext) ? ext : 'm4a';
    }

    const safeTitle = (title || 'video')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')  // remove illegal filename chars
      .replace(/\s+/g, '_')
      .slice(0, 80)
      .trim() || 'fetchclip';

    const filename = `${safeTitle}.${finalExt}`;

    // ── Log ────────────────────────────────────────────────────────────────
    logDownload({
      url:       cleanUrl,
      platform,
      title,
      quality:   parsed.formatId || 'best',
      type,
      ip,
      userAgent: req.headers['user-agent'],
      success:   true,
    }).catch(() => {});

    logger.info(
      `Download ready: platform=${platform} type=${type} ` +
      `ext=${finalExt} acodec=${acodec} vcodec=${vcodec} title="${safeTitle}"`
    );

    // ── Respond ────────────────────────────────────────────────────────────
    return res.json({
      success:   true,
      directUrl,
      filename,
      ext:       finalExt,
      type,
    });

  } catch (err) {
    logDownload({ url: cleanUrl, platform, success: false, error: err.message, ip }).catch(() => {});
    return next(err);
  }
});

module.exports = router;