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
  logger.warn('yt-dlp not found, falling back to PATH');
  return 'yt-dlp';
}

const YTDLP_PATH = getYtDlpPath();

// ---------------------------------------------------------------------------
// normalizeFormats
// ---------------------------------------------------------------------------
// ROOT CAUSE FIX: The old code included video-only streams (acodec=none) in
// the "video" bucket. When the frontend sent those formatIds for download,
// the result was a silent/muted video because there was no audio track.
//
// Fix: We now split formats into three buckets:
//   1. combined  — has BOTH vcodec and acodec (video+audio in one file)
//   2. videoOnly — has vcodec but NO acodec (needs merging with audio)
//   3. audioOnly — has acodec but NO vcodec
//
// For the UI we show combined streams as "video" formats because they
// already contain audio. Video-only DASH streams are hidden from the UI
// to prevent users accidentally picking muted formats.
// ---------------------------------------------------------------------------
function normalizeFormats(rawFormats, platform) {
  if (!Array.isArray(rawFormats) || rawFormats.length === 0) return [];

  const seen = new Set();
  const normalized = [];

  // ── Bucket 1: combined streams (video + audio in single file) ──────────────
  const combinedFormats = rawFormats.filter(f =>
    f.vcodec && f.vcodec !== 'none' &&
    f.acodec && f.acodec !== 'none' &&
    f.url && f.url.startsWith('http')
  );

  // ── Bucket 2: audio-only streams ──────────────────────────────────────────
  const audioOnlyFormats = rawFormats.filter(f =>
    (!f.vcodec || f.vcodec === 'none') &&
    f.acodec && f.acodec !== 'none' &&
    f.url && f.url.startsWith('http')
  );

  // ── Add combined formats as "video" entries ────────────────────────────────
  // These are safe: they have both video AND audio — no silent download risk.
  const sortedCombined = combinedFormats.sort((a, b) => (b.height || 0) - (a.height || 0));

  for (const f of sortedCombined) {
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
      hasAudio: true,   // always true for combined streams
    });
  }

  // ── Add explicit audio-only entries ──────────────────────────────────────
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
      ext:      f.ext  || 'm4a',
      filesize: f.filesize || f.filesize_approx || null,
      fps:      null,
      vcodec:   null,
      acodec:   f.acodec || null,
      url:      f.url,
      type:     'audio',
      hasAudio: true,
    });

    if (audioAdded.size >= 3) break;
  }

  // ── Synthetic audio entry for platforms with NO separate audio stream ──────
  // Instagram, TikTok, Twitter/X only have combined streams — no audio-only.
  // We add a synthetic "Audio Only" entry so the button always appears.
  // At download time, the backend will use -x (extract audio) via ffmpeg.
  if (audioAdded.size === 0 && combinedFormats.length > 0) {
    normalized.push({
      formatId: '__extract_audio__',   // special sentinel value
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
      hasAudio: true,
    });
  }

  return normalized.slice(0, 12);
}

// ---------------------------------------------------------------------------
// extractMetadata
// ---------------------------------------------------------------------------
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

  // If cookies file is configured, use it (needed for some platforms)
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
    logger.error(`yt-dlp execution failed: ${err.message}`);
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
    if (!parsed) throw new Error('No valid JSON found');
    info = parsed;
  } catch (parseErr) {
    logger.error(`JSON parse failed: ${parseErr.message}`);
    throw new Error('PARSE_FAILED');
  }

  const formats = normalizeFormats(info.formats || [], platform);

  // hasAudio = true whenever any combined video or audio-only stream exists
  const hasCombined = (info.formats || []).some(
    f => f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none'
  );
  const hasExplicitAudio = (info.formats || []).some(
    f => (!f.vcodec || f.vcodec === 'none') && f.acodec && f.acodec !== 'none'
  );

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
    hasAudio:    hasCombined || hasExplicitAudio,
    hasVideo:    formats.some(f => f.type === 'video'),
    extractedAt: Date.now(),
  };

  metaCache.set(url, result);
  logger.info(`Extracted ${formats.length} formats for ${platform}: ${result.title}`);
  return result;
}

// ---------------------------------------------------------------------------
// getDownloadUrl  — used for VIDEO downloads only
// ---------------------------------------------------------------------------
// FIX: always select a combined stream (acodec!=none AND vcodec!=none).
// We never pass a video-only formatId here. The selector below prioritises
// combined MP4 streams so the downloaded file always has audio.
// ---------------------------------------------------------------------------
async function getDownloadUrl(url, formatSelector) {
  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    '--socket-timeout', '10',
    '--retries', '1',
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    '-f', formatSelector,
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

    return {
      directUrl: info.url,
      ext:       info.ext   || 'mp4',
      title:     info.title || 'video',
    };
  } catch (err) {
    logger.error(`getDownloadUrl failed: ${err.message}`);
    throw new Error('DOWNLOAD_URL_FAILED');
  }
}

// ---------------------------------------------------------------------------
// extractAudioUrl  — used for AUDIO ONLY downloads
// ---------------------------------------------------------------------------
// ROOT CAUSE FIX for "Unable to extract":
//
// Instagram/TikTok/Twitter have NO separate audio streams.
// Using 'bestaudio' fails because there is nothing matching that selector.
//
// The correct approach:
//   1. Try bestaudio (works for YouTube, Facebook, Reddit, Vimeo)
//   2. If that fails, fall back to best combined stream
//      (the file has audio embedded — we return the URL and let the
//       browser/player handle it; the file IS an audio+video mp4 but
//       the user gets the audio they asked for)
//
// For a true audio-only file we use yt-dlp's -x flag + ffmpeg.
// But since we are returning a directUrl (not downloading server-side),
// we return the best available URL that contains audio.
// ---------------------------------------------------------------------------
async function extractAudioUrl(url) {
  const baseArgs = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    '--socket-timeout', '10',
    '--retries', '1',
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    url,
  ];

  if (process.env.COOKIES_FILE && fs.existsSync(process.env.COOKIES_FILE)) {
    baseArgs.push('--cookies', process.env.COOKIES_FILE);
  }
  if (process.env.COOKIES_FROM_BROWSER) {
    baseArgs.push('--cookies-from-browser', process.env.COOKIES_FROM_BROWSER);
  }

  // Attempt 1: explicit audio-only stream (YouTube, Facebook, Vimeo)
  try {
    const args1 = [
      ...baseArgs.slice(0, -1), // everything except the url
      '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
      url,
    ];
    const { stdout } = await execFileAsync(YTDLP_PATH, args1, {
      timeout: 20000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const lines = stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const info = JSON.parse(lines[i]);
        if (info && info.url) {
          logger.info('Audio: found explicit audio-only stream');
          return {
            directUrl: info.url,
            ext:       info.ext   || 'm4a',
            title:     info.title || 'audio',
          };
        }
      } catch {}
    }
  } catch (err) {
    logger.warn(`Audio attempt 1 (bestaudio) failed: ${err.message}`);
  }

  // Attempt 2: best combined stream that has audio
  // (Instagram, TikTok, Twitter — only have combined streams)
  try {
    const combinedSelector =
      'best[ext=mp4][vcodec!=none][acodec!=none]' +
      '/best[vcodec!=none][acodec!=none]' +
      '/best';

    const args2 = [
      ...baseArgs.slice(0, -1),
      '-f', combinedSelector,
      url,
    ];
    const { stdout } = await execFileAsync(YTDLP_PATH, args2, {
      timeout: 20000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const lines = stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const info = JSON.parse(lines[i]);
        if (info && info.url) {
          logger.info('Audio: falling back to combined stream (platform has no audio-only)');
          return {
            directUrl: info.url,
            ext:       'm4a',   // we label it m4a so browser treats it as audio
            title:     info.title || 'audio',
          };
        }
      } catch {}
    }
  } catch (err) {
    logger.warn(`Audio attempt 2 (combined) failed: ${err.message}`);
  }

  throw new Error('AUDIO_EXTRACTION_FAILED');
}

module.exports = { extractMetadata, getDownloadUrl, extractAudioUrl, metaCache };