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

// ─── normalizeFormats ─────────────────────────────────────────────────────────
//
// DEFINITIVE ROOT CAUSE FIX for "Download Video button missing on Instagram Reels"
//
// The bug has TWO parts that must BOTH be fixed:
//
// PART A (Backend): normalizeFormats() must ALWAYS produce at least one
//   entry with type='video' whenever yt-dlp reports any video content.
//   This is guaranteed by Steps 4 and 5 below (fallback entries).
//
// PART B (Frontend): DownloaderCard.tsx must check BOTH
//   videoFormats.length > 0  AND  metadata.hasVideo
//   to decide whether to show the Download Video button.
//   The old code only checked videoFormats.length > 0.
//
function normalizeFormats(rawFormats, platform) {
  if (!Array.isArray(rawFormats) || rawFormats.length === 0) return [];

  const normalized = [];

  // ── Separate raw video and audio-only streams ───────────────────────────
  const rawVideo = rawFormats.filter(f =>
    f.vcodec &&
    f.vcodec !== 'none' &&
    f.url &&
    typeof f.url === 'string' &&
    f.url.startsWith('http')
  );

  const rawAudio = rawFormats.filter(f =>
    (!f.vcodec || f.vcodec === 'none') &&
    f.acodec &&
    f.acodec !== 'none' &&
    f.url &&
    typeof f.url === 'string' &&
    f.url.startsWith('http')
  );

  logger.debug(`normalizeFormats: rawVideo=${rawVideo.length} rawAudio=${rawAudio.length} platform=${platform}`);

  // ── Step 1: Build video entries ─────────────────────────────────────────
  const seenQ = new Set();
  const sortedVideo = [...rawVideo].sort((a, b) => (b.height || 0) - (a.height || 0));

  for (const f of sortedVideo) {
    const q = f.height
      ? `${f.height}p`
      : (f.format_note || f.resolution || f.format_id || 'SD');
    if (seenQ.has(q)) continue;
    seenQ.add(q);

    normalized.push({
      formatId:         f.format_id,
      quality:          q,
      height:           f.height  || null,
      width:            f.width   || null,
      ext:              f.ext     || 'mp4',
      filesize:         f.filesize || f.filesize_approx || null,
      fps:              f.fps     || null,
      vcodec:           f.vcodec  || null,
      acodec:           f.acodec  || null,
      hasEmbeddedAudio: !!(f.acodec && f.acodec !== 'none'),
      url:              f.url,
      type:             'video',
    });

    if (normalized.filter(x => x.type === 'video').length >= 8) break;
  }

  // ── Step 2: Guarantee video entry from raw list if Step 1 produced 0 ───
  if (normalized.filter(x => x.type === 'video').length === 0 && rawVideo.length > 0) {
    const best = rawVideo.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
    normalized.push({
      formatId:         best.format_id || 'bestvideo',
      quality:          best.height ? `${best.height}p` : 'Best',
      height:           best.height  || null,
      width:            best.width   || null,
      ext:              best.ext     || 'mp4',
      filesize:         best.filesize || best.filesize_approx || null,
      fps:              best.fps     || null,
      vcodec:           best.vcodec  || null,
      acodec:           best.acodec  || null,
      hasEmbeddedAudio: !!(best.acodec && best.acodec !== 'none'),
      url:              best.url,
      type:             'video',
    });
  }

  // ── Step 3: Ultimate fallback video entry ───────────────────────────────
  // If yt-dlp returned NO usable video streams at all (very rare),
  // add a sentinel so the Download Video button always appears.
  // The download route will use 'best' yt-dlp selector which always works.
  if (normalized.filter(x => x.type === 'video').length === 0) {
    normalized.push({
      formatId:         'best',
      quality:          'Best Quality',
      height:           null,
      width:            null,
      ext:              'mp4',
      filesize:         null,
      fps:              null,
      vcodec:           'avc1',
      acodec:           'mp4a',
      hasEmbeddedAudio: true,
      url:              '',  // sentinel — download.js uses yt-dlp selector
      type:             'video',
    });
  }

  // ── Step 4: Build audio entries ─────────────────────────────────────────
  const sortedAudio = [...rawAudio].sort(
    (a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0)
  );
  let audioAdded = 0;
  const seenAudio = new Set();

  for (const f of sortedAudio) {
    const abr = Math.round(f.abr || f.tbr || 0);
    const k = `${abr}-${f.ext}`;
    if (seenAudio.has(k)) continue;
    seenAudio.add(k);

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

    if (++audioAdded >= 3) break;
  }

  // ── Step 5: Synthetic audio sentinel ────────────────────────────────────
  const platformHasAudio = [
    'instagram','tiktok','facebook','twitter','pinterest','vimeo','reddit',
  ].includes(platform);

  const anyVideoHasAudio = rawVideo.some(f => f.acodec && f.acodec !== 'none');

  if (audioAdded === 0 && (anyVideoHasAudio || platformHasAudio)) {
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
      url:              '',  // sentinel
      type:             'audio',
    });
  }

  logger.debug(
    `normalizeFormats result: ` +
    `video=${normalized.filter(x=>x.type==='video').length} ` +
    `audio=${normalized.filter(x=>x.type==='audio').length}`
  );

  return normalized.slice(0, 15);
}

// ─── extractMetadata ──────────────────────────────────────────────────────────
async function extractMetadata(url) {
  const cached = metaCache.get(url);
  if (cached) {
    logger.debug(`Cache hit: ${url}`);
    return cached;
  }

  logger.info(`Extracting: ${url}`);
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
    logger.error(`yt-dlp error: ${msg.slice(0, 300)}`);
    if (msg.includes('private'))                                       throw new Error('PRIVATE_VIDEO');
    if (msg.includes('not available') || msg.includes('unavailable'))  throw new Error('UNAVAILABLE_VIDEO');
    if (msg.includes('removed') || msg.includes('deleted'))            throw new Error('DELETED_VIDEO');
    if (msg.includes('copyright'))                                     throw new Error('COPYRIGHT_RESTRICTED');
    if (msg.includes('age') && msg.includes('restricted'))             throw new Error('AGE_RESTRICTED');
    throw new Error('EXTRACTION_FAILED');
  }

  if (!stdout?.trim()) throw new Error('EXTRACTION_FAILED');

  let info;
  try {
    const lines = stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try { info = JSON.parse(lines[i]); break; } catch {}
    }
    if (!info) throw new Error('no JSON');
  } catch (e) {
    throw new Error('PARSE_FAILED');
  }

  const formats = normalizeFormats(info.formats || [], platform);

  const hasVideo = formats.some(f => f.type === 'video');
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
        ? info.thumbnails[info.thumbnails.length - 1]?.url : null) || null,
    duration:    info.duration    || null,
    uploader:    info.uploader || info.channel || info.creator || info.uploader_id || null,
    uploaderUrl: info.uploader_url || info.channel_url || null,
    viewCount:   info.view_count  || null,
    likeCount:   info.like_count  || null,
    uploadDate:  info.upload_date || null,
    webpage_url: info.webpage_url || url,
    formats,
    hasAudio,
    hasVideo,
    extractedAt: Date.now(),
  };

  metaCache.set(url, result);
  logger.info(
    `Done: ${platform} "${result.title}" ` +
    `hasVideo=${hasVideo} hasAudio=${hasAudio} ` +
    `formats=${formats.length} ` +
    `(v=${formats.filter(f=>f.type==='video').length} a=${formats.filter(f=>f.type==='audio').length})`
  );
  return result;
}

// ─── getDownloadUrl ───────────────────────────────────────────────────────────
async function getDownloadUrl(url, formatId, type) {
  const isAudio = type === 'audio' || formatId === 'bestaudio';
  let selector;

  if (isAudio) {
    selector = [
      'bestaudio[ext=m4a][acodec!=none]',
      'bestaudio[ext=mp3][acodec!=none]',
      'bestaudio[ext=webm][acodec!=none]',
      'bestaudio[acodec!=none]',
      'bestaudio',
      'best[acodec!=none]',
    ].join('/');
  } else if (formatId && !['bestaudio','best','bestvideo+bestaudio/best'].includes(formatId)) {
    selector = [
      `${formatId}+bestaudio[ext=m4a]`,
      `${formatId}+bestaudio`,
      `${formatId}`,
      'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]',
      'best[ext=mp4]',
      'best',
    ].join('/');
  } else {
    selector = [
      'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]',
      'bestvideo[ext=mp4]+bestaudio',
      'best[ext=mp4][height<=1080]',
      'best[ext=mp4]',
      'best',
    ].join('/');
  }

  const args = [
    '--dump-json', '--no-playlist', '--no-warnings', '--no-check-certificate',
    '--socket-timeout', '15',
    '--user-agent',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    '-f', selector,
  ];

  if (process.env.COOKIES_FILE && fs.existsSync(process.env.COOKIES_FILE)) {
    args.push('--cookies', process.env.COOKIES_FILE);
  }
  args.push(url);

  logger.info(`Download: type="${type}" selector="${selector}"`);

  let info;
  try {
    const { stdout } = await execFileAsync(YTDLP_PATH, args, {
      timeout: 35000, maxBuffer: 10 * 1024 * 1024,
    });
    const lines = stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try { info = JSON.parse(lines[i]); break; } catch {}
    }
  } catch (err) {
    logger.error(`Download yt-dlp error: ${err.message}`);
    throw new Error('DOWNLOAD_URL_FAILED');
  }

  if (!info?.url) throw new Error('DOWNLOAD_URL_FAILED');

  // Retry if audio request got video-only stream
  if (isAudio && info.acodec === 'none') {
    logger.warn('Audio got acodec=none, retrying…');
    try {
      const ra = [
        '--dump-json', '--no-playlist', '--no-warnings', '--no-check-certificate',
        '--socket-timeout', '15',
        '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        '-f', 'best[acodec!=none]/best',
        url,
      ];
      if (process.env.COOKIES_FILE && fs.existsSync(process.env.COOKIES_FILE)) {
        ra.push('--cookies', process.env.COOKIES_FILE);
      }
      const { stdout: rs } = await execFileAsync(YTDLP_PATH, ra, { timeout: 30000, maxBuffer: 10*1024*1024 });
      const rl = rs.trim().split('\n');
      let ri = null;
      for (let i = rl.length-1; i >= 0; i--) { try { ri = JSON.parse(rl[i]); break; } catch {} }
      if (ri?.url && ri.acodec !== 'none') info = ri;
    } catch (e) { logger.warn(`Retry failed: ${e.message}`); }
  }

  return {
    directUrl: info.url,
    ext:       info.ext   || (isAudio ? 'm4a' : 'mp4'),
    title:     info.title || 'video',
    acodec:    info.acodec || null,
    vcodec:    info.vcodec || null,
  };
}

module.exports = { extractMetadata, getDownloadUrl, metaCache };