const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const NodeCache = require('node-cache');
const { logger } = require('../utils/logger');
const { detectPlatform } = require('../utils/urlUtils');

const execFileAsync = promisify(execFile);

const metaCache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL) || 300,
  checkperiod: 60,
});

function getYtDlpPath() {
  if (
    process.env.YTDLP_PATH &&
    fs.existsSync(process.env.YTDLP_PATH)
  ) {
    return process.env.YTDLP_PATH;
  }

  const candidates = [
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    path.join(process.cwd(), 'node_modules', '.bin', 'yt-dlp'),
    'yt-dlp',
  ];

  for (const c of candidates) {
    try {
      if (c === 'yt-dlp' || fs.existsSync(c)) {
        return c;
      }
    } catch {}
  }

  return 'yt-dlp';
}

const YTDLP_PATH = getYtDlpPath();

function normalizeFormats(rawFormats, platform) {
  if (!Array.isArray(rawFormats)) return [];

  const seen = new Set();
  const normalized = [];

  // VIDEO FORMATS
  const videoFormats = rawFormats.filter(
    (f) =>
      f.vcodec &&
      f.vcodec !== 'none' &&
      f.url &&
      (f.ext === 'mp4' || f.ext === 'webm')
  );

  // AUDIO ONLY FORMATS
  const audioOnlyFormats = rawFormats.filter(
    (f) =>
      (!f.vcodec || f.vcodec === 'none') &&
      f.acodec &&
      f.acodec !== 'none' &&
      f.url
  );

  // SORT VIDEOS BY RESOLUTION
  const sortedVideo = videoFormats.sort(
    (a, b) => (b.height || 0) - (a.height || 0)
  );

  // NORMALIZE VIDEO FORMATS
  for (const f of sortedVideo) {
    const quality = f.height
      ? `${f.height}p-${f.ext || 'mp4'}-${f.fps || 30}`
      : f.format_note || 'unknown';

    if (seen.has(quality)) continue;

    seen.add(quality);

    normalized.push({
      formatId: f.format_id,
      quality,
      height: f.height || null,
      width: f.width || null,
      ext: f.ext || 'mp4',
      filesize: f.filesize || f.filesize_approx || null,
      fps: f.fps || null,
      vcodec: f.vcodec || null,
      acodec: f.acodec || null,
      url: f.url,
      type: 'video',
    });
  }

  // NORMALIZE AUDIO FORMATS
  audioOnlyFormats
    .sort(
      (a, b) =>
        (b.abr || b.tbr || 0) -
        (a.abr || a.tbr || 0)
    )
    .slice(0, 5)
    .forEach((f, index) => {
      normalized.push({
        formatId: f.format_id,
        quality: `Audio ${f.abr || f.tbr || 128}kbps`,
        height: null,
        width: null,
        ext: f.ext || 'm4a',
        filesize:
          f.filesize || f.filesize_approx || null,
        fps: null,
        vcodec: null,
        acodec: f.acodec || null,
        url: f.url,
        type: 'audio',
      });
    });

  return normalized.slice(0, 20);
}

async function extractMetadata(url) {
  const cached = metaCache.get(url);

  if (cached) {
    logger.debug(`Cache hit for: ${url}`);
    return cached;
  }

  logger.info(`Extracting metadata for: ${url}`);

  const platform = detectPlatform(url);

  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--flat-playlist',
    '--no-check-certificate',
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    '--add-header',
    'Accept-Language:en-US,en;q=0.9',
    url,
  ];

  let stdout;

  try {
    const result = await execFileAsync(
      YTDLP_PATH,
      args,
      {
        timeout: 45000,
        maxBuffer: 50 * 1024 * 1024,
      }
    );

    stdout = result.stdout;
  } catch (err) {
    logger.error(
      `yt-dlp execution failed: ${err.message}`
    );

    const msg = err.stderr || err.message || '';

    if (
      msg.includes('Private video') ||
      msg.includes('private')
    ) {
      throw new Error('PRIVATE_VIDEO');
    }

    if (
      msg.includes('not available') ||
      msg.includes('unavailable')
    ) {
      throw new Error('UNAVAILABLE_VIDEO');
    }

    if (
      msg.includes('removed') ||
      msg.includes('deleted')
    ) {
      throw new Error('DELETED_VIDEO');
    }

    if (msg.includes('copyright')) {
      throw new Error('COPYRIGHT_RESTRICTED');
    }

    if (msg.includes('age')) {
      throw new Error('AGE_RESTRICTED');
    }

    throw new Error('EXTRACTION_FAILED');
  }

  let info;

  try {
    const lines = stdout.trim().split('\n');

    info = JSON.parse(lines[lines.length - 1]);
  } catch (parseErr) {
    logger.error(
      `Failed to parse yt-dlp JSON: ${parseErr.message}`
    );

    throw new Error('PARSE_FAILED');
  }

  const formats = normalizeFormats(
    info.formats || [],
    platform
  );

  const result = {
    id: info.id || null,
    platform,
    title: info.title || 'Untitled',
    description: (info.description || '').slice(
      0,
      500
    ),
    thumbnail:
      info.thumbnail ||
      (info.thumbnails &&
        info.thumbnails[
          info.thumbnails.length - 1
        ]?.url) ||
      null,

    duration: info.duration || null,

    uploader:
      info.uploader ||
      info.channel ||
      info.creator ||
      null,

    uploaderUrl:
      info.uploader_url ||
      info.channel_url ||
      null,

    viewCount: info.view_count || null,
    likeCount: info.like_count || null,
    uploadDate: info.upload_date || null,

    webpage_url: info.webpage_url || url,

    formats,

    hasAudio: formats.some(
      (f) => f.type === 'audio'
    ),

    hasVideo: formats.some(
      (f) => f.type === 'video'
    ),

    extractedAt: Date.now(),
  };

  metaCache.set(url, result);

  logger.info(
    `Metadata extracted successfully for: ${platform} - ${result.title}`
  );

  return result;
}

async function getDownloadUrl(url, formatId) {
  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    '-f',
    formatId || 'best[ext=mp4]/best',
    url,
  ];

  try {
    const { stdout } = await execFileAsync(
      YTDLP_PATH,
      args,
      {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    const lines = stdout.trim().split('\n');

    const info = JSON.parse(
      lines[lines.length - 1]
    );

    return {
      directUrl: info.url || null,
      ext: info.ext || 'mp4',
      title: info.title || 'video',
    };
  } catch (err) {
    logger.error(
      `Failed to get download URL: ${err.message}`
    );

    throw new Error('DOWNLOAD_URL_FAILED');
  }
}

module.exports = {
  extractMetadata,
  getDownloadUrl,
  metaCache,
};