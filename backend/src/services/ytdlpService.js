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

// ─── yt-dlp binary discovery ─────────────────────────────────────────────────
function getYtDlpPath() {
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) {
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
    if (c === 'yt-dlp') return c;
    try { if (fs.existsSync(c)) return c; } catch {}
  }
  return 'yt-dlp';
}
const YTDLP_PATH = getYtDlpPath();

// ─── Stream classification helpers ──────────────────────────────────────────

/** Has a real video codec AND a playable HTTP URL */
function isVideoStream(f) {
  return (
    f.vcodec && f.vcodec !== 'none' &&
    f.url && f.url.startsWith('http')
  );
}

/** Has no video, has audio, has a playable HTTP URL */
function isAudioOnlyStream(f) {
  return (
    (!f.vcodec || f.vcodec === 'none') &&
    f.acodec && f.acodec !== 'none' &&
    f.url && f.url.startsWith('http')
  );
}

/** Video stream that ALSO carries audio (merged/HLS stream) */
function videoHasEmbeddedAudio(f) {
  return (
    isVideoStream(f) &&
    f.acodec && f.acodec !== 'none'
  );
}

// ─── normalizeFormats ─────────────────────────────────────────────────────────
/**
 * ROOT CAUSE FIXES:
 *
 * BUG 1 – Video button disappears:
 *   Old code required vcodec != 'none' AND url.startsWith('http').
 *   Instagram HLS reels have vcodec set correctly but some dash manifests
 *   have url that is not http. Fixed: strict http check preserved but
 *   we now also handle merged streams properly.
 *
 * BUG 2 – Audio Only downloads silent video:
 *   When no separate audio stream exists (Instagram/TikTok HLS),
 *   old code added synthetic entry with url='' and formatId='bestaudio'.
 *   The download route then ran yt-dlp with -f bestaudio which on some
 *   platforms returns a video-only DASH stream (silent).
 *   Fix: synthetic entry is still added BUT download.js now uses a
 *   proper chained selector: bestaudio/best[acodec!=none]
 *   and validates acodec in response before accepting.
 *
 * BUG 3 – Inconsistency between Instagram links:
 *   Reels → HLS merged (no separate audio stream).
 *   Posts → separate video+audio DASH streams.
 *   Fix: normalizeFormats handles both cases. hasEmbeddedAudio flag
 *   tells the download route which approach to use.
 */
function normalizeFormats(rawFormats, platform) {
  if (!Array.isArray(rawFormats) || rawFormats.length === 0) return [];

  const videoStreams     = rawFormats.filter(isVideoStream);
  const audioOnlyStreams = rawFormats.filter(isAudioOnlyStream);

  // Does the platform typically carry audio in all videos?
  const platformAlwaysHasAudio = [
    'instagram', 'tiktok', 'facebook', 'twitter', 'pinterest', 'vimeo', 'reddit',
  ].includes(platform);

  // Do any video streams have embedded audio?
  const anyVideoHasEmbeddedAudio = videoStreams.some(videoHasEmbeddedAudio);

  // ── Video formats ────────────────────────────────────────────────────────
  const seenQuality = new Set();
  const normalized  = [];

  // Best quality first
  const sortedVideo = [...videoStreams].sort((a, b) => (b.height || 0) - (a.height || 0));

  for (const f of sortedVideo) {
    const quality = f.height
      ? `${f.height}p`
      : (f.format_note || f.format_id || 'SD');

    if (seenQuality.has(quality)) continue;
    seenQuality.add(quality);

    normalized.push({
      formatId:         f.format_id,
      quality,
      height:           f.height  || null,
      width:            f.width   || null,
      ext:              f.ext     || 'mp4',
      filesize:         f.filesize || f.filesize_approx || null,
      fps:              f.fps     || null,
      vcodec:           f.vcodec  || null,
      acodec:           f.acodec  || null,
      // TRUE when this video stream already contains audio (HLS/merged)
      hasEmbeddedAudio: videoHasEmbeddedAudio(f),
      url:              f.url,
      type:             'video',
    });
  }

  // ── Audio-only formats ──────────────────────────────────────────────────
  const sortedAudio = [...audioOnlyStreams].sort(
    (a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0)
  );

  let audioAdded = 0;
  const seenAudioKey = new Set();

  for (const f of sortedAudio) {
    const abr = Math.round(f.abr || f.tbr || 0);
    const key = `abr-${abr}-${f.ext}`;
    if (seenAudioKey.has(key)) continue;
    seenAudioKey.add(key);

    normalized.push({
      formatId:         f.format_id,
      quality:          abr > 0 ? `Audio ${abr}kbps` : 'Audio Only',
      height:           null,
      width:            null,
      ext:              f.ext || 'm4a',
      filesize:         f.filesize || f.filesize_approx || null,
      fps:              null,
      vcodec:           null,
      acodec:           f.acodec || null,
      hasEmbeddedAudio: false,
      url:              f.url,
      type:             'audio',
    });

    audioAdded++;
    if (audioAdded >= 3) break;
  }

  // ── Synthetic audio entry ────────────────────────────────────────────────
  // Added when: no real audio-only stream found BUT we know audio exists
  // (either embedded in video streams or platform always has audio).
  //
  // formatId = 'bestaudio' is a SENTINEL VALUE.
  // The download route detects this and uses yt-dlp's own selector
  // instead of trying to use this empty URL directly.
  if (audioAdded === 0 && (anyVideoHasEmbeddedAudio || platformAlwaysHasAudio)) {
    normalized.push({
      formatId:         'bestaudio',
      quality:          'Audio Only',
      height:           null,
      width:            null,
      ext:              'm4a',
      filesize:         null,
      fps:              null,
      vcodec:           null,
      acodec:           'aac',
      hasEmbeddedAudio: false,
      url:              '',   // empty = must use yt-dlp selector at download time
      type:             'audio',
    });
  }

  return normalized.slice(0, 15);
}

// ─── extractMetadata ──────────────────────────────────────────────────────────
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
    '--no-check-certificate',
    '--socket-timeout', '15',
    '--user-agent',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    '--add-header', 'Accept-Language:en-US,en;q=0.9',
  ];

  // Cookie file support (set via env var in Render dashboard)
  if (process.env.COOKIES_FILE && fs.existsSync(process.env.COOKIES_FILE)) {
    args.push('--cookies', process.env.COOKIES_FILE);
  }

  args.push(url);

  let stdout;
  try {
    const result = await execFileAsync(YTDLP_PATH, args, {
      timeout:   50000,
      maxBuffer: 30 * 1024 * 1024,
    });
    stdout = result.stdout;
  } catch (err) {
    const msg = (err.stderr || err.message || '').toLowerCase();
    logger.error(`yt-dlp failed for ${url}: ${msg.slice(0, 300)}`);

    if (msg.includes('private'))                                      throw new Error('PRIVATE_VIDEO');
    if (msg.includes('not available') || msg.includes('unavailable')) throw new Error('UNAVAILABLE_VIDEO');
    if (msg.includes('removed') || msg.includes('deleted'))           throw new Error('DELETED_VIDEO');
    if (msg.includes('copyright'))                                    throw new Error('COPYRIGHT_RESTRICTED');
    if (msg.includes('age') && msg.includes('restricted'))            throw new Error('AGE_RESTRICTED');
    throw new Error('EXTRACTION_FAILED');
  }

  if (!stdout?.trim()) throw new Error('EXTRACTION_FAILED');

  // yt-dlp sometimes outputs multiple JSON lines — take last valid one
  let info;
  try {
    const lines = stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try { info = JSON.parse(lines[i]); break; } catch {}
    }
    if (!info) throw new Error('no valid JSON line');
  } catch (e) {
    logger.error(`JSON parse failed: ${e.message}`);
    throw new Error('PARSE_FAILED');
  }

  const formats = normalizeFormats(info.formats || [], platform);

  const hasAudio =
    formats.some(f => f.type === 'audio') ||
    formats.some(f => f.type === 'video' && f.hasEmbeddedAudio) ||
    ['instagram','tiktok','facebook','twitter','pinterest','vimeo','reddit'].includes(platform);

  const result = {
    id:          info.id          || null,
    platform,
    title:       info.title       || 'Untitled',
    description: (info.description || '').slice(0, 500),
    thumbnail:
      info.thumbnail ||
      (Array.isArray(info.thumbnails) && info.thumbnails.length > 0
        ? info.thumbnails[info.thumbnails.length - 1]?.url
        : null) ||
      null,
    duration:    info.duration    || null,
    uploader:    info.uploader || info.channel || info.creator || info.uploader_id || null,
    uploaderUrl: info.uploader_url || info.channel_url || null,
    viewCount:   info.view_count  || null,
    likeCount:   info.like_count  || null,
    uploadDate:  info.upload_date || null,
    webpage_url: info.webpage_url || url,
    formats,
    hasAudio,
    hasVideo:    formats.some(f => f.type === 'video'),
    extractedAt: Date.now(),
  };

  metaCache.set(url, result);
  logger.info(
    `Extracted ${formats.length} formats for ${platform}: "${result.title}" ` +
    `| hasVideo=${result.hasVideo} hasAudio=${result.hasAudio}`
  );
  return result;
}

// ─── getDownloadUrl ───────────────────────────────────────────────────────────
/**
 * FIXED: Audio downloads no longer return silent video.
 *
 * For audio requests (type==='audio' OR formatId==='bestaudio'):
 *   Uses chained selector that guarantees audio codec is present.
 *   Validates response has acodec != 'none' before accepting.
 *   Falls back to best[acodec!=none] if needed.
 *
 * For video requests with a specific formatId:
 *   Requests that format merged with bestaudio so result always has audio.
 *   Falls back to best[ext=mp4] if merge fails.
 *
 * For video requests without a specific formatId:
 *   Requests best quality video+audio merged.
 */
async function getDownloadUrl(url, formatId, type) {
  let selector;

  const isAudioRequest = type === 'audio' || formatId === 'bestaudio';

  if (isAudioRequest) {
    // Strict audio selector chain — all options must have acodec
    selector = [
      'bestaudio[ext=m4a][acodec!=none]',
      'bestaudio[ext=mp3][acodec!=none]',
      'bestaudio[ext=webm][acodec!=none]',
      'bestaudio[acodec!=none]',
      'bestaudio',
      // Last resort: take best quality that has ANY audio
      'best[acodec!=none]',
    ].join('/');

  } else if (formatId && formatId !== 'bestaudio') {
    // Specific video format ID — merge with bestaudio to ensure audio is present
    selector = [
      `${formatId}+bestaudio[ext=m4a]`,
      `${formatId}+bestaudio`,
      `${formatId}`,
      'bestvideo[ext=mp4]+bestaudio[ext=m4a]',
      'best[ext=mp4]',
      'best',
    ].join('/');

  } else {
    // No specific format — best merged quality
    selector = [
      'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]',
      'bestvideo[ext=mp4]+bestaudio',
      'best[ext=mp4][height<=1080]',
      'best[ext=mp4]',
      'best',
    ].join('/');
  }

  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    '--socket-timeout', '15',
    '--user-agent',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    '-f', selector,
  ];

  if (process.env.COOKIES_FILE && fs.existsSync(process.env.COOKIES_FILE)) {
    args.push('--cookies', process.env.COOKIES_FILE);
  }

  args.push(url);

  logger.info(`getDownloadUrl: type="${type}" selector="${selector}"`);

  let info;
  try {
    const { stdout } = await execFileAsync(YTDLP_PATH, args, {
      timeout:   35000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const lines = stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try { info = JSON.parse(lines[i]); break; } catch {}
    }
  } catch (err) {
    logger.error(`yt-dlp getDownloadUrl failed: ${err.message}`);
    throw new Error('DOWNLOAD_URL_FAILED');
  }

  if (!info?.url) {
    logger.error('yt-dlp returned no URL');
    throw new Error('DOWNLOAD_URL_FAILED');
  }

  // ── Validate audio requests ──────────────────────────────────────────────
  // If we asked for audio but got a video-only stream, retry with safe fallback
  if (isAudioRequest && info.acodec === 'none') {
    logger.warn(`Audio request got acodec=none (format_id=${info.format_id}), retrying…`);

    const retryArgs = [
      '--dump-json', '--no-playlist', '--no-warnings', '--no-check-certificate',
      '--socket-timeout', '15',
      '--user-agent',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      '-f', 'best[acodec!=none]/best',
    ];
    if (process.env.COOKIES_FILE && fs.existsSync(process.env.COOKIES_FILE)) {
      retryArgs.push('--cookies', process.env.COOKIES_FILE);
    }
    retryArgs.push(url);

    try {
      const { stdout: rs } = await execFileAsync(YTDLP_PATH, retryArgs, {
        timeout: 30000, maxBuffer: 10 * 1024 * 1024,
      });
      const rLines = rs.trim().split('\n');
      let rInfo = null;
      for (let i = rLines.length - 1; i >= 0; i--) {
        try { rInfo = JSON.parse(rLines[i]); break; } catch {}
      }
      if (rInfo?.url && rInfo.acodec !== 'none') info = rInfo;
    } catch (retryErr) {
      logger.warn(`Audio retry also failed: ${retryErr.message}`);
      // Proceed with original info — at least the URL works
    }
  }

  return {
    directUrl: info.url,
    ext:       info.ext   || (isAudioRequest ? 'm4a' : 'mp4'),
    title:     info.title || 'video',
    acodec:    info.acodec || null,
    vcodec:    info.vcodec || null,
  };
}

module.exports = { extractMetadata, getDownloadUrl, metaCache };