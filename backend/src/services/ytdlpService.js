const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const NodeCache = require('node-cache');
const { logger } = require('../utils/logger');
const { detectPlatform } = require('../utils/urlUtils');

const execFileAsync = promisify(execFile);
const metaCache = new NodeCache({ stdTTL: parseInt(process.env.CACHE_TTL) || 300, checkperiod: 60 });

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
    try {
      if (c === 'yt-dlp') return c;
      if (fs.existsSync(c)) { logger.info(`Found yt-dlp at: ${c}`); return c; }
    } catch {}
  }
  return 'yt-dlp';
}

const YTDLP_PATH = getYtDlpPath();

function normalizeFormats(rawFormats, platform) {
  if (!Array.isArray(rawFormats) || rawFormats.length === 0) return [];

  const seen = new Set();
  const normalized = [];

  // Combined streams: has both video AND audio codec
  const combinedFormats = rawFormats.filter(f =>
    f.vcodec && f.vcodec !== 'none' &&
    f.acodec && f.acodec !== 'none' &&
    f.url && f.url.startsWith('http')
  );

  // Video-only streams (no audio)
  const videoOnlyFormats = rawFormats.filter(f =>
    f.vcodec && f.vcodec !== 'none' &&
    (!f.acodec || f.acodec === 'none') &&
    f.url && f.url.startsWith('http')
  );

  // Audio-only streams
  const audioOnlyFormats = rawFormats.filter(f =>
    (!f.vcodec || f.vcodec === 'none') &&
    f.acodec && f.acodec !== 'none' &&
    f.url && f.url.startsWith('http')
  );

  // Prefer combined formats (they have audio built-in — no merging needed)
  const videoSource = combinedFormats.length > 0 ? combinedFormats : videoOnlyFormats;
  const sortedVideo = videoSource.sort((a, b) => (b.height || 0) - (a.height || 0));

  for (const f of sortedVideo) {
    const quality = f.height ? `${f.height}p` : (f.format_note || f.format_id || 'best');
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
      hasAudio: !!(f.acodec && f.acodec !== 'none'),
    });
  }

  // Audio-only formats
  const sortedAudio = audioOnlyFormats.sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));
  const audioAdded = new Set();
  for (const f of sortedAudio) {
    const abr = Math.round(f.abr || f.tbr || 0);
    const audioKey = `audio-${abr}`;
    if (audioAdded.has(audioKey)) continue;
    audioAdded.add(audioKey);
    normalized.push({
      formatId: f.format_id,
      quality: abr > 0 ? `Audio ${abr}kbps` : 'Audio Only',
      height: null, width: null,
      ext: f.ext || 'm4a',
      filesize: f.filesize || f.filesize_approx || null,
      fps: null,
      vcodec: null,
      acodec: f.acodec || null,
      url: f.url,
      type: 'audio',
      hasAudio: true,
    });
    if (audioAdded.size >= 3) break;
  }

  // If no audio-only but combined streams exist, add synthetic audio entry
  // so the Audio Only button always appears
  if (audioAdded.size === 0 && combinedFormats.length > 0) {
    normalized.push({
      formatId: 'bestaudio',
      quality: 'Audio Only',
      height: null, width: null,
      ext: 'm4a', filesize: null, fps: null,
      vcodec: null, acodec: 'aac',
      url: '', type: 'audio', hasAudio: true,
    });
  }

  return normalized.slice(0, 12);
}

async function extractMetadata(url) {
  const cached = metaCache.get(url);
  if (cached) {
    logger.debug(`Cache hit: ${url}`);
    return cached;
  }

  logger.info(`Extracting metadata: ${url}`);
  const platform = detectPlatform(url);

  // SPEED OPTIMIZATIONS:
  // --no-check-certificate  — skip SSL handshake validation
  // --socket-timeout 10     — don't wait forever on network
  // --no-playlist           — single item only
  // --skip-download         — metadata only, never download
  // Removed --extractor-args youtube:skip=dash,hls for non-YouTube
  // Use shorter timeout (30s instead of 60s)
  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    '--socket-timeout', '10',
    '--retries', '2',
    '--fragment-retries', '2',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    '--add-header', 'Accept-Language:en-US,en;q=0.9',
    url,
  ];

  let stdout;
  try {
    const result = await execFileAsync(YTDLP_PATH, args, {
      timeout: 30000, // 30s max (was 60s)
      maxBuffer: 30 * 1024 * 1024, // 30MB (was 50MB)
    });
    stdout = result.stdout;
  } catch (err) {
    logger.error(`yt-dlp failed: ${err.message}`);
    const msg = (err.stderr || err.message || '').toLowerCase();
    if (msg.includes('private video') || msg.includes('private')) throw new Error('PRIVATE_VIDEO');
    if (msg.includes('not available') || msg.includes('unavailable')) throw new Error('UNAVAILABLE_VIDEO');
    if (msg.includes('removed') || msg.includes('deleted')) throw new Error('DELETED_VIDEO');
    if (msg.includes('copyright')) throw new Error('COPYRIGHT_RESTRICTED');
    if (msg.includes('age') && msg.includes('restricted')) throw new Error('AGE_RESTRICTED');
    if (msg.includes('sign in') || msg.includes('login')) throw new Error('LOGIN_REQUIRED');
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
  } catch (parseErr) {
    logger.error(`JSON parse failed: ${parseErr.message}`);
    throw new Error('PARSE_FAILED');
  }

  const formats = normalizeFormats(info.formats || [], platform);

  // hasAudio = true if any combined video format OR any audio-only format exists
  const hasCombinedVideo = (info.formats || []).some(f =>
    f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none'
  );
  const hasAudioOnly = formats.some(f => f.type === 'audio');

  const result = {
    id: info.id || null,
    platform,
    title: info.title || 'Untitled',
    description: (info.description || '').slice(0, 500),
    // Thumbnail: try multiple sources
    thumbnail:
      info.thumbnail ||
      (Array.isArray(info.thumbnails) && info.thumbnails.length > 0
        ? info.thumbnails[info.thumbnails.length - 1]?.url
        : null) ||
      null,
    duration: info.duration || null,
    uploader: info.uploader || info.channel || info.creator || info.uploader_id || null,
    uploaderUrl: info.uploader_url || info.channel_url || null,
    viewCount: info.view_count || null,
    likeCount: info.like_count || null,
    uploadDate: info.upload_date || null,
    webpage_url: info.webpage_url || url,
    formats,
    // FIXED: hasAudio is true whenever there is any audio source
    hasAudio: hasCombinedVideo || hasAudioOnly,
    hasVideo: formats.some(f => f.type === 'video'),
    extractedAt: Date.now(),
  };

  metaCache.set(url, result);
  logger.info(`Extracted ${formats.length} formats for ${platform}: ${result.title}`);
  return result;
}

async function getDownloadUrl(url, formatId) {
  // SPEED: use --no-check-certificate, shorter timeout, retries=1
  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    '--socket-timeout', '10',
    '--retries', '1',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    '-f', formatId || 'best',
    url,
  ];

  try {
    const { stdout } = await execFileAsync(YTDLP_PATH, args, {
      timeout: 25000, // 25s (was 45s)
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
      ext: info.ext || 'mp4',
      title: info.title || 'video',
    };
  } catch (err) {
    logger.error(`getDownloadUrl failed: ${err.message}`);
    throw new Error('DOWNLOAD_URL_FAILED');
  }
}

module.exports = { extractMetadata, getDownloadUrl, metaCache };