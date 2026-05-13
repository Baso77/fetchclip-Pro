const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const NodeCache = require('node-cache');
const YtDlpWrap = require('yt-dlp-wrap');
const { logger } = require('../utils/logger');
const { detectPlatform } = require('../utils/urlUtils');

const execFileAsync = promisify(execFile);
let cachedYtdlpPath = null;

async function resolveYtDlpPath() {
  if (cachedYtdlpPath) {
    return cachedYtdlpPath;
  }

  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) {
    cachedYtdlpPath = process.env.YTDLP_PATH;
    return cachedYtdlpPath;
  }

  const candidates = [
    path.join(process.cwd(), 'node_modules', '.bin', 'yt-dlp'),
    path.join(process.cwd(), 'node_modules', '.bin', 'yt-dlp.cmd'),
    path.join(process.cwd(), 'node_modules', '.bin', 'yt-dlp.exe'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    'yt-dlp',
    'yt-dlp.exe',
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        cachedYtdlpPath = candidate;
        return cachedYtdlpPath;
      }
    } catch {}
  }

  const fallbackBinary = path.join(process.cwd(), `yt-dlp${process.platform === 'win32' ? '.exe' : ''}`);
  if (fs.existsSync(fallbackBinary)) {
    cachedYtdlpPath = fallbackBinary;
    return cachedYtdlpPath;
  }

  try {
    logger.info(`yt-dlp not found locally; downloading binary to ${fallbackBinary}`);
    await YtDlpWrap.downloadFromGithub(fallbackBinary);
    cachedYtdlpPath = fallbackBinary;
    return cachedYtdlpPath;
  } catch (err) {
    logger.warn(`Failed to download yt-dlp binary: ${err.message}. Falling back to executable name.`);
    cachedYtdlpPath = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    return cachedYtdlpPath;
  }
}

const metaCache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL) || 300,
  checkperiod: 60,
});

function normalizeFormats(rawFormats, platform) {
  if (!Array.isArray(rawFormats)) {
    return { formats: [], hasAudio: false, hasVideo: false };
  }

  const seen = new Set();
  const normalized = [];

  const hasAudio = rawFormats.some(
    (f) =>
      ((f.acodec && f.acodec !== 'none') ||
        (f.acodec === null && /audio/i.test(f.format || f.format_note || '')))
      && f.url
  );

  const hasVideo = rawFormats.some(
    (f) =>
      ((f.vcodec && f.vcodec !== 'none') ||
        (f.vcodec === null && /video/i.test(f.format || f.format_note || '')))
      && f.url
  );

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

  return {
    formats: normalized.slice(0, 20),
    hasAudio,
    hasVideo,
  };
}

async function extractMetadata(url) {
  const cached = metaCache.get(url);

  if (cached) {
    logger.debug(`Cache hit for: ${url}`);
    return cached;
  }

  logger.info(`Extracting metadata for: ${url}`);

  const platform = detectPlatform(url);
  const YTDLP_PATH = await resolveYtDlpPath();

  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
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

  const { formats, hasAudio, hasVideo } = normalizeFormats(
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

    hasAudio,

    hasVideo,

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

  const YTDLP_PATH = await resolveYtDlpPath();

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