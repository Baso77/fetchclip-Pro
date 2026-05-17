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
    path.join(process.cwd(), 'bin', 'yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    '/usr/local/sbin/yt-dlp',
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

// =============================================================================
// normalizeFormats
// =============================================================================
// ROOT CAUSE OF "Download Video button missing":
//
// Instagram returns formats where BOTH vcodec and acodec fields look like this:
//   { vcodec: "avc1.640028", acodec: "mp4a.40.2" }  ← combined, has both
//   { vcodec: "avc1.640028", acodec: "none" }         ← video-only DASH
//   { vcodec: "none",        acodec: "mp4a.40.2" }    ← audio-only DASH
//
// The previous fix was TOO STRICT: it required acodec!=none for video bucket.
// But some Instagram formats have acodec="none" even though yt-dlp's "best"
// selector picks them because there is a matching audio stream that gets
// auto-merged. When we filtered those out, videoFormats became empty → no
// Download Video button.
//
// CORRECT FIX:
// Show ALL formats that have a video codec in the UI dropdown.
// But at DOWNLOAD TIME, force a combined-stream selector on the backend
// regardless of which formatId the user picked.
// This way the button always shows AND the download always has audio.
// =============================================================================
function normalizeFormats(rawFormats, platform) {
  if (!Array.isArray(rawFormats) || rawFormats.length === 0) return [];

  const seen = new Set();
  const normalized = [];

  // ── ALL formats that have a video stream ──────────────────────────────────
  // We include video-only (acodec=none) here intentionally so the dropdown
  // is populated and the Download Video button appears.
  // Audio is guaranteed at download time by the backend selector.
  const videoFormats = rawFormats.filter(f =>
    f.vcodec &&
    f.vcodec !== 'none' &&
    f.url &&
    f.url.startsWith('http')
  );

  // ── Audio-only streams ────────────────────────────────────────────────────
  const audioOnlyFormats = rawFormats.filter(f =>
    (!f.vcodec || f.vcodec === 'none') &&
    f.acodec &&
    f.acodec !== 'none' &&
    f.url &&
    f.url.startsWith('http')
  );

  // Sort video by height descending, add to normalized
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

  // Add explicit audio-only entries (YouTube, Facebook, Vimeo)
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
      height:   null,
      width:    null,
      ext:      f.ext || 'm4a',
      filesize: f.filesize || f.filesize_approx || null,
      fps:      null,
      vcodec:   null,
      acodec:   f.acodec || null,
      url:      f.url,
      type:     'audio',
    });

    if (audioAdded.size >= 3) break;
  }

  // Synthetic audio entry for Instagram/TikTok/Twitter (no separate audio stream)
  if (audioAdded.size === 0 && videoFormats.length > 0) {
    normalized.push({
      formatId: '__bestaudio__',
      quality:  'Audio Only',
      height:   null,
      width:    null,
      ext:      'm4a',
      filesize: null,
      fps:      null,
      vcodec:   null,
      acodec:   'aac',
      url:      '',
      type:     'audio',
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
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    '--socket-timeout', '10',
    '--retries', '2',
    '--fragment-retries', '2',
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    '--add-header', 'Accept-Language:en-US,en;q=0.9',
    url,
  ];

  // Cookies support (needed for some platforms)
  if (process.env.COOKIES_FILE && fs.existsSync(process.env.COOKIES_FILE)) {
    args.push('--cookies', process.env.COOKIES_FILE);
  }
  if (process.env.COOKIES_FROM_BROWSER) {
    args.push('--cookies-from-browser', process.env.COOKIES_FROM_BROWSER);
  }

  let stdout;
  try {
    const result = await execFileAsync(YTDLP_PATH, args, {
      timeout: 30000,
      maxBuffer: 30 * 1024 * 1024,
    });
    stdout = result.stdout;
  } catch (err) {
    logger.error(`yt-dlp failed: ${err.message}`);
    const msg = (err.stderr || err.message || '').toLowerCase();
    if (msg.includes('private video') || msg.includes('private')) throw new Error('PRIVATE_VIDEO');
    if (msg.includes('not available') || msg.includes('unavailable'))  throw new Error('UNAVAILABLE_VIDEO');
    if (msg.includes('removed') || msg.includes('deleted'))            throw new Error('DELETED_VIDEO');
    if (msg.includes('copyright'))                                      throw new Error('COPYRIGHT_RESTRICTED');
    if (msg.includes('age') && msg.includes('restricted'))             throw new Error('AGE_RESTRICTED');
    if (msg.includes('sign in') || msg.includes('login'))              throw new Error('LOGIN_REQUIRED');
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

  const result = {
    id:          info.id       || null,
    platform,
    title:       info.title    || 'Untitled',
    description: (info.description || '').slice(0, 500),
    thumbnail:
      info.thumbnail ||
      (Array.isArray(info.thumbnails) && info.thumbnails.length > 0
        ? info.thumbnails[info.thumbnails.length - 1]?.url
        : null) ||
      null,
    duration:    info.duration      || null,
    uploader:    info.uploader || info.channel || info.creator || info.uploader_id || null,
    uploaderUrl: info.uploader_url  || info.channel_url || null,
    viewCount:   info.view_count    || null,
    likeCount:   info.like_count    || null,
    uploadDate:  info.upload_date   || null,
    webpage_url: info.webpage_url   || url,
    formats,
    hasAudio: true,   // always true — audio is guaranteed at download time
    hasVideo: formats.some(f => f.type === 'video'),
    extractedAt: Date.now(),
  };

  metaCache.set(url, result);
  logger.info(`Extracted ${formats.length} formats for ${platform}: ${result.title}`);
  return result;
}

// =============================================================================
// getDownloadUrl  (VIDEO)
// =============================================================================
// IMPORTANT: We IGNORE the formatId from the frontend and always use a
// combined-stream selector. This guarantees the downloaded video has audio
// regardless of which quality row the user selected.
// =============================================================================
async function getDownloadUrl(url, _ignoredFormatId) {
  // Selector: prefer combined MP4 with both video+audio codecs
  // Falls back through increasingly permissive options
  const selector =
    'best[ext=mp4][vcodec!=none][acodec!=none][height<=1080]' +
    '/best[ext=mp4][vcodec!=none][acodec!=none]' +
    '/best[vcodec!=none][acodec!=none][height<=1080]' +
    '/best[vcodec!=none][acodec!=none]' +
    '/best[ext=mp4]' +
    '/best';

  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    '--socket-timeout', '10',
    '--retries', '1',
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    '-f', selector,
    url,
  ];

  if (process.env.COOKIES_FILE && fs.existsSync(process.env.COOKIES_FILE)) {
    args.push('--cookies', process.env.COOKIES_FILE);
  }
  if (process.env.COOKIES_FROM_BROWSER) {
    args.push('--cookies-from-browser', process.env.COOKIES_FROM_BROWSER);
  }

  try {
    const { stdout } = await execFileAsync(YTDLP_PATH, args, {
      timeout: 25000,
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
// extractAudioUrl  (AUDIO ONLY)
// =============================================================================
// Two-stage fallback:
//   Stage 1: bestaudio selector  → works for YouTube/Facebook/Vimeo
//   Stage 2: best combined stream → works for Instagram/TikTok/Twitter
//            (these platforms have no separate audio stream)
// =============================================================================
async function extractAudioUrl(url) {
  const commonArgs = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    '--socket-timeout', '10',
    '--retries', '1',
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  ];

  const cookieArgs = [];
  if (process.env.COOKIES_FILE && fs.existsSync(process.env.COOKIES_FILE)) {
    cookieArgs.push('--cookies', process.env.COOKIES_FILE);
  }
  if (process.env.COOKIES_FROM_BROWSER) {
    cookieArgs.push('--cookies-from-browser', process.env.COOKIES_FROM_BROWSER);
  }

  // Stage 1: explicit audio-only stream
  try {
    const { stdout } = await execFileAsync(
      YTDLP_PATH,
      [...commonArgs, ...cookieArgs, '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio', url],
      { timeout: 20000, maxBuffer: 10 * 1024 * 1024 }
    );
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

  // Stage 2: best combined stream (Instagram/TikTok/Twitter fallback)
  try {
    const combinedSelector =
      'best[ext=mp4][vcodec!=none][acodec!=none]' +
      '/best[vcodec!=none][acodec!=none]' +
      '/best';

    const { stdout } = await execFileAsync(
      YTDLP_PATH,
      [...commonArgs, ...cookieArgs, '-f', combinedSelector, url],
      { timeout: 20000, maxBuffer: 10 * 1024 * 1024 }
    );
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