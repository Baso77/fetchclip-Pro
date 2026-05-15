const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const { getMergedDownloadUrl } = require('../services/ytdlpService');
const { logDownload } = require('../services/supabaseService');
const { urlSchema, sanitizeUrl, isSupportedUrl, detectPlatform } = require('../utils/urlUtils');
const { logger } = require('../utils/logger');

const execFileAsync = promisify(execFile);

function getYtDlpPath() {
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) {
    return process.env.YTDLP_PATH;
  }
  const candidates = ['/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp', 'yt-dlp'];
  for (const c of candidates) {
    try {
      if (c === 'yt-dlp' || fs.existsSync(c)) return c;
    } catch {}
  }
  return 'yt-dlp';
}

const YTDLP_PATH = getYtDlpPath();

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
    // Handle thumbnail separately
    if (parsed.type === 'thumbnail') {
      const { extractMetadata } = require('../services/ytdlpService');
      const meta = await extractMetadata(cleanUrl);
      if (!meta.thumbnail) {
        return res.status(404).json({ success: false, error: 'No thumbnail available', code: 'NO_THUMBNAIL' });
      }
      logDownload({ url: cleanUrl, platform, title: meta.title, type: 'thumbnail', ip, success: true }).catch(() => {});
      return res.json({ success: true, directUrl: meta.thumbnail, filename: `thumbnail.jpg`, type: 'thumbnail' });
    }

    // For audio downloads
    if (parsed.type === 'audio') {
      const formatSelector = 'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio/best';
      
      const args = [
        '--dump-json',
        '--no-playlist',
        '--no-warnings',
        '--no-check-certificate',
        '--socket-timeout', '10',
        '--retries', '2',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '-f', formatSelector,
        cleanUrl,
      ];

      const { stdout } = await execFileAsync(YTDLP_PATH, args, {
        timeout: 25000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const lines = stdout.trim().split('\n');
      const info = JSON.parse(lines[lines.length - 1]);
      const downloadInfo = (info.requested_downloads && info.requested_downloads[0]) || info;
      const directUrl = downloadInfo.url || info.url;

      if (!directUrl) throw new Error('DOWNLOAD_URL_FAILED');

      const safeTitle = (info.title || 'audio').replace(/[^a-zA-Z0-9\s\-_]/g, '').slice(0, 80).trim();
      const ext = downloadInfo.ext || info.ext || 'm4a';

      logDownload({ url: cleanUrl, platform, title: info.title, type: 'audio', ip, success: true }).catch(() => {});

      return res.json({
        success: true,
        directUrl,
        filename: `${safeTitle}.${ext}`,
        ext,
        type: 'audio',
      });
    }

    // VIDEO DOWNLOAD — CRITICAL: Always include audio
    // Build format selector that ALWAYS merges audio
    let formatSelector;
    if (parsed.formatId && parsed.formatId !== 'best') {
      // User picked a specific format — merge with best audio
      // This ensures video always has sound
      formatSelector = [
        `${parsed.formatId}+bestaudio[ext=m4a]`,
        `${parsed.formatId}+bestaudio`,
        `bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]`,
        `bestvideo[height<=1080]+bestaudio`,
        `best[ext=mp4]`,
        `best`,
      ].join('/');
    } else {
      formatSelector = [
        'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]',
        'bestvideo[height<=1080][ext=mp4]+bestaudio',
        'bestvideo[height<=1080]+bestaudio[ext=m4a]',
        'bestvideo[height<=1080]+bestaudio',
        'bestvideo+bestaudio',
        'best[ext=mp4]',
        'best',
      ].join('/');
    }

    const args = [
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificate',
      '--socket-timeout', '10',
      '--retries', '2',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '-f', formatSelector,
      cleanUrl,
    ];

    logger.info(`Video download format: ${formatSelector} for ${platform}`);

    const { stdout } = await execFileAsync(YTDLP_PATH, args, {
      timeout: 25000,
      maxBuffer: 15 * 1024 * 1024,
    });

    const lines = stdout.trim().split('\n');
    const info = JSON.parse(lines[lines.length - 1]);

    // When yt-dlp merges formats, it returns requested_downloads
    const downloadInfo = (info.requested_downloads && info.requested_downloads[0]) || info;
    const directUrl = downloadInfo.url || info.url;

    if (!directUrl) {
      logger.error('No direct URL found in yt-dlp output');
      throw new Error('DOWNLOAD_URL_FAILED');
    }

    const safeTitle = (info.title || 'video').replace(/[^a-zA-Z0-9\s\-_]/g, '').slice(0, 80).trim();
    const ext = downloadInfo.ext || info.ext || 'mp4';

    // Log what format was actually selected
    const selectedFormat = downloadInfo.format || info.format || 'unknown';
    const hasAudio = selectedFormat.includes('+') || 
                     (downloadInfo.acodec && downloadInfo.acodec !== 'none') ||
                     (info.acodec && info.acodec !== 'none');
    
    logger.info(`Download URL generated: ${platform} | format: ${selectedFormat} | hasAudio: ${hasAudio} | title: ${safeTitle}`);

    logDownload({
      url: cleanUrl,
      platform,
      title: info.title,
      quality: parsed.formatId || 'best',
      type: 'video',
      ip,
      userAgent: req.headers['user-agent'],
      success: true,
    }).catch(() => {});

    return res.json({
      success: true,
      directUrl,
      filename: `${safeTitle}.${ext}`,
      ext,
      type: 'video',
    });

  } catch (err) {
    logDownload({ url: cleanUrl, platform, success: false, error: err.message, ip }).catch(() => {});
    return next(err);
  }
});

module.exports = router;