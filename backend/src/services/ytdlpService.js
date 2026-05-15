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
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) {
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
      if (c === 'yt-dlp' || fs.existsSync(c)) return c;
    } catch {}
  }
  return 'yt-dlp';
}

const YTDLP_PATH = getYtDlpPath();

function normalizeFormats(rawFormats, platform) {
  if (!Array.isArray(rawFormats) || rawFormats.length === 0) return [];

  const seen = new Set();
  const normalized = [];

  // Identify formats that have BOTH video and audio (muxed)
  const muxedFormats = rawFormats.filter(
    (f) =>
      f.vcodec && f.vcodec !== 'none' &&
      f.acodec && f.acodec !== 'none' &&
      f.url &&
      (f.ext === 'mp4' || f.ext === 'webm' || f.ext === 'm4v')
  );

  // Video-only streams (for merging with audio via ffmpeg on download)
  const videoOnlyFormats = rawFormats.filter(
    (f) =>
      f.vcodec && f.vcodec !== 'none' &&
      (!f.acodec || f.acodec === 'none') &&
      f.url
  );

  // Audio-only formats
  const audioOnlyFormats = rawFormats.filter(
    (f) =>
      (!f.vcodec || f.vcodec === 'none') &&
      f.acodec && f.acodec !== 'none' &&
      f.url
  );

  // Prefer muxed (video+audio) formats first — these download WITH audio directly
  const sortedMuxed = muxedFormats.sort((a, b) => (b.height || 0) - (a.height || 0));

  for (const f of sortedMuxed) {
    const quality = f.height
      ? `${f.height}p-${f.ext || 'mp4'}`
      : f.format_note || 'unknown';

    if (seen.has(quality)) continue;
    seen.add(quality);

    normalized.push({
      formatId: f.format_id,
      quality: f.height ? `${f.height}p` : (f.format_note || 'Best'),
      height: f.height || null,
      width: f.width || null,
      ext: f.ext || 'mp4',
      filesize: f.filesize || f.filesize_approx || null,
      fps: f.fps || null,
      vcodec: f.vcodec || null,
      acodec: f.acodec || null,
      url: f.url,
      type: 'video',
      hasAudio: true, // muxed = has audio
      needsMerge: false,
    });
  }

  // If we have video-only streams, mark them as needing ffmpeg merge
  // We add them as options but flag them so download route can handle merging
  const sortedVideoOnly = videoOnlyFormats.sort((a, b) => (b.height || 0) - (a.height || 0));

  for (const f of sortedVideoOnly) {
    const qualityKey = f.height ? `${f.height}p-vo` : `vo-${f.format_id}`;
    if (seen.has(qualityKey)) continue;

    // Only add if we don't already have a muxed version at this resolution
    const alreadyHaveMuxed = normalized.some(
      (n) => n.type === 'video' && n.height === f.height && n.hasAudio
    );
    if (alreadyHaveMuxed) continue;

    seen.add(qualityKey);

    normalized.push({
      formatId: f.format_id,
      quality: f.height ? `${f.height}p` : (f.format_note || 'HD'),
      height: f.height || null,
      width: f.width || null,
      ext: f.ext || 'mp4',
      filesize: f.filesize || f.filesize_approx || null,
      fps: f.fps || null,
      vcodec: f.vcodec || null,
      acodec: null,
      url: f.url,
      type: 'video',
      hasAudio: false, // video-only, needs merge
      needsMerge: true,
    });
  }

  // Audio-only formats (top 3 by bitrate)
  audioOnlyFormats
    .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))
    .slice(0, 3)
    .forEach((f) => {
      normalized.push({
        formatId: f.format_id,
        quality: `Audio ${Math.round(f.abr || f.tbr || 128)}kbps`,
        height: null,
        width: null,
        ext: f.ext || 'm4a',
        filesize: f.filesize || f.filesize_approx || null,
        fps: null,
        vcodec: null,
        acodec: f.acodec || null,
        url: f.url,
        type: 'audio',
        hasAudio: true,
        needsMerge: false,
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

  // Optimized args for speed — remove slow flags
  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    '--socket-timeout', '10',         // fail fast on network issues
    '--retries', '2',                  // fewer retries = faster failure
    '--fragment-retries', '2',
    '--concurrent-fragments', '4',
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '--add-header', 'Accept-Language:en-US,en;q=0.9',
    '--extractor-args', 'youtube:skip=dash,hls',  // skip slow DASH/HLS parsing for YouTube
    url,
  ];

  let stdout;
  try {
    const result = await execFileAsync(YTDLP_PATH, args, {
      timeout: 30000,       // 30s hard timeout (down from 45s)
      maxBuffer: 20 * 1024 * 1024, // 20MB (down from 50MB)
    });
    stdout = result.stdout;
  } catch (err) {
    logger.error(`yt-dlp execution failed: ${err.message}`);
    const msg = (err.stderr || err.message || '').toLowerCase();
    if (msg.includes('private')) throw new Error('PRIVATE_VIDEO');
    if (msg.includes('not available') || msg.includes('unavailable')) throw new Error('UNAVAILABLE_VIDEO');
    if (msg.includes('removed') || msg.includes('deleted')) throw new Error('DELETED_VIDEO');
    if (msg.includes('copyright')) throw new Error('COPYRIGHT_RESTRICTED');
    if (msg.includes('age')) throw new Error('AGE_RESTRICTED');
    throw new Error('EXTRACTION_FAILED');
  }

  let info;
  try {
    const lines = stdout.trim().split('\n');
    info = JSON.parse(lines[lines.length - 1]);
  } catch (parseErr) {
    logger.error(`Failed to parse yt-dlp JSON: ${parseErr.message}`);
    throw new Error('PARSE_FAILED');
  }

  const formats = normalizeFormats(info.formats || [], platform);

  const result = {
    id: info.id || null,
    platform,
    title: info.title || 'Untitled',
    description: (info.description || '').slice(0, 500),
    thumbnail:
      info.thumbnail ||
      (info.thumbnails && info.thumbnails[info.thumbnails.length - 1]?.url) ||
      null,
    duration: info.duration || null,
    uploader: info.uploader || info.channel || info.creator || null,
    uploaderUrl: info.uploader_url || info.channel_url || null,
    viewCount: info.view_count || null,
    likeCount: info.like_count || null,
    uploadDate: info.upload_date || null,
    webpage_url: info.webpage_url || url,
    formats,
    hasAudio: formats.some((f) => f.type === 'audio') || formats.some((f) => f.type === 'video' && f.hasAudio),
    hasVideo: formats.some((f) => f.type === 'video'),
    extractedAt: Date.now(),
  };

  metaCache.set(url, result);
  logger.info(`Metadata extracted successfully for: ${platform} - ${result.title}`);
  return result;
}

/**
 * Get download URL — CRITICAL FIX:
 * For video downloads, always use format that includes audio.
 * Use "bestvideo+bestaudio/best" and let yt-dlp merge via ffmpeg,
 * OR use a muxed format if available.
 */
async function getDownloadUrl(url, formatId, type = 'video') {
  let formatSelector;

  if (type === 'audio') {
    // Audio only — best audio stream
    formatSelector = 'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio/best';
  } else if (type === 'video') {
    if (formatId && formatId !== 'best') {
      // If user selected a specific format, check if it needs audio merged
      // Always merge with best audio to ensure sound
      // Use +bestaudio to merge audio into the selected video stream
      formatSelector = `${formatId}+bestaudio[ext=m4a]/${formatId}+bestaudio/bestvideo[height<=${getHeightFromFormatId(formatId)}]+bestaudio/best[ext=mp4]/best`;
    } else {
      // Default: best quality WITH audio
      formatSelector = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best';
    }
  } else {
    formatSelector = 'best[ext=mp4]/best';
  }

  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    '--socket-timeout', '10',
    '--retries', '2',
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '-f', formatSelector,
    url,
  ];

  try {
    const { stdout } = await execFileAsync(YTDLP_PATH, args, {
      timeout: 25000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const lines = stdout.trim().split('\n');
    const info = JSON.parse(lines[lines.length - 1]);

    // yt-dlp returns requested_downloads when merging formats
    const downloadInfo = (info.requested_downloads && info.requested_downloads[0]) || info;

    return {
      directUrl: downloadInfo.url || info.url || null,
      ext: downloadInfo.ext || info.ext || (type === 'audio' ? 'm4a' : 'mp4'),
      title: info.title || 'video',
      // Flag if this is a manifest URL (needs special handling)
      isManifest: (downloadInfo.url || info.url || '').includes('.m3u8') ||
                  (downloadInfo.url || info.url || '').includes('manifest'),
    };
  } catch (err) {
    logger.error(`Failed to get download URL: ${err.message}`);
    throw new Error('DOWNLOAD_URL_FAILED');
  }
}

/**
 * For merged formats (video+audio), we need to use yt-dlp to pipe
 * the merged output directly. This uses --get-url with format merging.
 */
async function getMergedDownloadUrl(url, formatId, type = 'video') {
  let formatSelector;

  if (type === 'audio') {
    formatSelector = 'bestaudio[ext=m4a]/bestaudio/best';
  } else {
    // ALWAYS include audio track in video download
    if (formatId && formatId !== 'best') {
      formatSelector = `${formatId}+bestaudio[ext=m4a]/${formatId}+bestaudio/best[ext=mp4]/best`;
    } else {
      formatSelector = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[ext=mp4]/best';
    }
  }

  // Use --get-url to get the actual CDN URLs (returns 2 lines for merged: video\naudio)
  const args = [
    '--get-url',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    '--socket-timeout', '10',
    '--retries', '2',
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '-f', formatSelector,
    url,
  ];

  const titleArgs = [
    '--get-title',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    '-f', formatSelector,
    url,
  ];

  try {
    const [urlResult, titleResult] = await Promise.all([
      execFileAsync(YTDLP_PATH, args, { timeout: 20000, maxBuffer: 5 * 1024 * 1024 }),
      execFileAsync(YTDLP_PATH, titleArgs, { timeout: 20000, maxBuffer: 1 * 1024 * 1024 }).catch(() => ({ stdout: 'video' })),
    ]);

    const urls = urlResult.stdout.trim().split('\n').filter(Boolean);
    const title = titleResult.stdout.trim().split('\n')[0] || 'video';

    return {
      // If 2 URLs returned, first is video, second is audio (needs client-side or server merge)
      // If 1 URL returned, it's already muxed
      videoUrl: urls[0] || null,
      audioUrl: urls[1] || null, // null if muxed
      isMerged: urls.length > 1,
      title,
    };
  } catch (err) {
    logger.error(`Failed to get merged download URL: ${err.message}`);
    throw new Error('DOWNLOAD_URL_FAILED');
  }
}

// Helper to extract height from format_id for format selectors
function getHeightFromFormatId(formatId) {
  // Common YouTube format IDs: 137=1080p, 136=720p, 135=480p, etc.
  const heightMap = {
    '137': 1080, '248': 1080, '299': 1080,
    '136': 720, '247': 720, '298': 720,
    '135': 480, '244': 480,
    '134': 360, '243': 360,
    '133': 240, '242': 240,
  };
  return heightMap[formatId] || 1080;
}

module.exports = {
  extractMetadata,
  getDownloadUrl,
  getMergedDownloadUrl,
  metaCache,
};