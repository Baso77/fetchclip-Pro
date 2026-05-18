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
    logger.info(`Using yt-dlp from YTDLP_PATH: ${process.env.YTDLP_PATH}`);
    return process.env.YTDLP_PATH;
  }
  const candidates = [
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    path.join(process.cwd(), 'bin', 'yt-dlp'),
    path.join(process.cwd(), 'node_modules', '.bin', 'yt-dlp'),
    'yt-dlp',
  ];
  for (const c of candidates) {
    try {
      if (c === 'yt-dlp') { logger.info('Using yt-dlp from PATH'); return c; }
      if (fs.existsSync(c)) { logger.info(`Found yt-dlp at: ${c}`); return c; }
    } catch {}
  }
  return 'yt-dlp';
}

const YTDLP_PATH = getYtDlpPath();

// Build common yt-dlp args used in every call
function buildBaseArgs() {
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    '--socket-timeout', '15',
    '--retries', '3',
    '--fragment-retries', '3',
    // Modern browser user agent — helps bypass bot detection
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    '--add-header', 'Accept-Language:en-US,en;q=0.9',
    '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  ];

  // Cookies support
  if (process.env.COOKIES_FILE && fs.existsSync(process.env.COOKIES_FILE)) {
    args.push('--cookies', process.env.COOKIES_FILE);
    logger.info('Using cookies file');
  }
  if (process.env.COOKIES_FROM_BROWSER) {
    args.push('--cookies-from-browser', process.env.COOKIES_FROM_BROWSER);
  }

  return args;
}

// =============================================================================
// normalizeFormats
// Key rule: show ALL formats that have a video stream in the dropdown.
// Audio is guaranteed at download time by backend selector — not by filtering.
// =============================================================================
function normalizeFormats(rawFormats, platform) {
  if (!Array.isArray(rawFormats) || rawFormats.length === 0) return [];

  const seen = new Set();
  const normalized = [];

  // All formats with a video stream
  const videoFormats = rawFormats.filter(f =>
    f.vcodec &&
    f.vcodec !== 'none' &&
    f.url &&
    f.url.startsWith('http')
  );

  // Audio-only streams
  const audioOnlyFormats = rawFormats.filter(f =>
    (!f.vcodec || f.vcodec === 'none') &&
    f.acodec &&
    f.acodec !== 'none' &&
    f.url &&
    f.url.startsWith('http')
  );

  // Sort by height descending
  const sortedVideo = videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0));

  for (const f of sortedVideo) {
    const quality = f.height
      ? `${f.height}p`
      : (f.format_note || f.format_id || 'best');
    if (seen.has(quality)) continue;
    seen.add(quality);

    normalized.push({
      formatId: f.format_id,
      quality,
      height:   f.height   || null,
      width:    f.width    || null,
      ext:      f.ext      || 'mp4',
      filesize: f.filesize || f.filesize_approx || null,
      fps:      f.fps      || null,
      vcodec:   f.vcodec   || null,
      acodec:   f.acodec   || null,
      url:      f.url,
      type:     'video',
    });
  }

  // Audio-only entries
  const sortedAudio = audioOnlyFormats.sort(
    (a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0)
  );
  const audioAdded = new Set();
  for (const f of sortedAudio) {
    const abr = Math.round(f.abr || f.tbr || 0);
    const key = `audio-${abr}`;
    if (audioAdded.has(key)) continue;
    audioAdded.add(key);
    normalized.push({
      formatId: f.format_id,
      quality:  abr > 0 ? `Audio ${abr}kbps` : 'Audio Only',
      height: null, width: null,
      ext: f.ext || 'm4a',
      filesize: f.filesize || f.filesize_approx || null,
      fps: null, vcodec: null, acodec: f.acodec || null,
      url: f.url, type: 'audio',
    });
    if (audioAdded.size >= 3) break;
  }

  // Synthetic audio entry for Instagram/TikTok/Twitter
  if (audioAdded.size === 0 && videoFormats.length > 0) {
    normalized.push({
      formatId: '__bestaudio__',
      quality: 'Audio Only',
      height: null, width: null, ext: 'm4a',
      filesize: null, fps: null, vcodec: null, acodec: 'aac',
      url: '', type: 'audio',
    });
  }

  return normalized.slice(0, 12);
}

// =============================================================================
// extractMetadata
// =============================================================================
async function extractMetadata(url) {
  const cached = metaCache.get(url);
  if (cached) {
    logger.debug(`Cache hit: ${url}`);
    return cached;
  }

  logger.info(`Extracting metadata: ${url}`);
  const platform = detectPlatform(url);

  const args = [
    '--dump-json',
    ...buildBaseArgs(),
    url,
  ];

  let stdout;
  try {
    const result = await execFileAsync(YTDLP_PATH, args, {
      timeout: 60000,
      maxBuffer: 50 * 1024 * 1024,
    });
    stdout = result.stdout;
  } catch (err) {
    logger.error(`yt-dlp metadata failed: ${err.message}`);
    if (err.stderr) logger.error(`yt-dlp stderr: ${err.stderr}`);
    const msg = (err.stderr || err.message || '').toLowerCase();
    if (msg.includes('private video') || msg.includes('private')) throw new Error('PRIVATE_VIDEO');
    if (msg.includes('not available') || msg.includes('unavailable'))  throw new Error('UNAVAILABLE_VIDEO');
    if (msg.includes('removed') || msg.includes('deleted'))            throw new Error('DELETED_VIDEO');
    if (msg.includes('copyright'))                                      throw new Error('COPYRIGHT_RESTRICTED');
    if (msg.includes('age') && msg.includes('restricted'))             throw new Error('AGE_RESTRICTED');
    if (msg.includes('sign in') || msg.includes('login'))              throw new Error('LOGIN_REQUIRED');
    if (msg.includes('unable to extract') || msg.includes('extraction'))  throw new Error('EXTRACTION_FAILED');
    throw new Error('EXTRACTION_FAILED');
  }

  if (!stdout || !stdout.trim()) throw new Error('EXTRACTION_FAILED');

  let info;
  try {
    const lines = stdout.trim().split('\n');
    let parsed = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      try { parsed = JSON.parse(lines[i]); break; } catch {}
    }
    if (!parsed) throw new Error('No valid JSON');
    info = parsed;
  } catch {
    throw new Error('PARSE_FAILED');
  }

  const formats = normalizeFormats(info.formats || [], platform);

  // If no formats found at all, create one fallback entry
  // so the Download Video button always appears
  if (formats.filter(f => f.type === 'video').length === 0) {
    logger.warn(`No video formats found for ${platform}, adding fallback`);
    formats.unshift({
      formatId: 'best',
      quality:  'Best Available',
      height: null, width: null, ext: 'mp4',
      filesize: null, fps: null, vcodec: 'avc1', acodec: 'mp4a',
      url: '', type: 'video',
    });
  }

  const result = {
    id:          info.id        || null,
    platform,
    title:       info.title     || 'Untitled',
    description: (info.description || '').slice(0, 500),
    thumbnail:
      info.thumbnail ||
      (Array.isArray(info.thumbnails) && info.thumbnails.length > 0
        ? info.thumbnails[info.thumbnails.length - 1]?.url
        : null) ||
      null,
    duration:    info.duration       || null,
    uploader:    info.uploader || info.channel || info.creator || info.uploader_id || null,
    uploaderUrl: info.uploader_url   || info.channel_url || null,
    viewCount:   info.view_count     || null,
    likeCount:   info.like_count     || null,
    uploadDate:  info.upload_date    || null,
    webpage_url: info.webpage_url    || url,
    formats,
    hasAudio: true,
    hasVideo: true,
    extractedAt: Date.now(),
  };

  metaCache.set(url, result);
  logger.info(`Extracted ${formats.length} formats for ${platform}: ${result.title}`);
  return result;
}

// =============================================================================
// getDownloadUrl — VIDEO (always with audio)
// Ignores frontend formatId, always picks combined stream
// =============================================================================
async function getDownloadUrl(url) {
  // Priority: combined MP4 with both video+audio codecs
  const selector =
    'best[ext=mp4][vcodec!=none][acodec!=none][height<=1080]' +
    '/best[ext=mp4][vcodec!=none][acodec!=none]' +
    '/best[vcodec!=none][acodec!=none][height<=1080]' +
    '/best[vcodec!=none][acodec!=none]' +
    '/best[ext=mp4]' +
    '/best';

  const args = [
    '--dump-json',
    ...buildBaseArgs(),
    '-f', selector,
    url,
  ];

  try {
    const { stdout } = await execFileAsync(YTDLP_PATH, args, {
      timeout: 45000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const lines = stdout.trim().split('\n');
    let info = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      try { info = JSON.parse(lines[i]); break; } catch {}
    }
    if (!info || !info.url) throw new Error('No URL in response');
    return { directUrl: info.url, ext: info.ext || 'mp4', title: info.title || 'video' };
  } catch (err) {
    logger.error(`getDownloadUrl failed: ${err.message}`);
    throw new Error('DOWNLOAD_URL_FAILED');
  }
}

// =============================================================================
// extractAudioUrl — AUDIO ONLY
// Stage 1: bestaudio (YouTube/Facebook/Vimeo)
// Stage 2: best combined stream (Instagram/TikTok/Twitter)
// =============================================================================
async function extractAudioUrl(url) {
  const baseArgs = buildBaseArgs();

  // Stage 1: explicit audio-only stream
  try {
    const { stdout } = await execFileAsync(YTDLP_PATH, [
      '--dump-json',
      ...baseArgs,
      '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
      url,
    ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });

    const lines = stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const info = JSON.parse(lines[i]);
        if (info && info.url) {
          logger.info('Audio: explicit audio-only stream found');
          return { directUrl: info.url, ext: info.ext || 'm4a', title: info.title || 'audio' };
        }
      } catch {}
    }
  } catch (err) {
    logger.warn(`Audio stage 1 failed: ${err.message}`);
  }

  // Stage 2: best combined stream with audio
  try {
    const { stdout } = await execFileAsync(YTDLP_PATH, [
      '--dump-json',
      ...baseArgs,
      '-f',
      'best[ext=mp4][vcodec!=none][acodec!=none]/best[vcodec!=none][acodec!=none]/best',
      url,
    ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });

    const lines = stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const info = JSON.parse(lines[i]);
        if (info && info.url) {
          logger.info('Audio: using combined stream fallback');
          return { directUrl: info.url, ext: 'm4a', title: info.title || 'audio' };
        }
      } catch {}
    }
  } catch (err) {
    logger.warn(`Audio stage 2 failed: ${err.message}`);
  }

  throw new Error('AUDIO_EXTRACTION_FAILED');
}

module.exports = { extractMetadata, getDownloadUrl, extractAudioUrl, metaCache };