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

  // VIDEO FORMATS: allow video-only streams (acodec may be 'none' for high quality YouTube)
  const videoFormats = rawFormats.filter(f =>
    f.vcodec &&
    f.vcodec !== 'none' &&
    f.url &&
    f.url.startsWith('http')
  );

  // AUDIO-ONLY FORMATS: no video codec, has audio codec, has url
  const audioOnlyFormats = rawFormats.filter(f =>
    (!f.vcodec || f.vcodec === 'none') &&
    f.acodec &&
    f.acodec !== 'none' &&
    f.url &&
    f.url.startsWith('http')
  );

  // Sort video by resolution descending
  const sortedVideo = videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0));

  for (const f of sortedVideo) {
    const quality = f.height ? `${f.height}p` : (f.format_note || f.format_id || 'unknown');
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

  // Pick best audio-only format by bitrate
  const sortedAudio = audioOnlyFormats.sort((a, b) =>
    (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0)
  );

  // Add up to 3 audio options
  const audioAdded = new Set();
  for (const f of sortedAudio) {
    const abr = Math.round(f.abr || f.tbr || 0);
    const audioKey = `audio-${abr}`;
    if (audioAdded.has(audioKey)) continue;
    audioAdded.add(audioKey);

    normalized.push({
      formatId: f.format_id,
      quality: abr > 0 ? `Audio ${abr}kbps` : 'Audio Only',
      height: null,
      width: null,
      ext: f.ext || 'm4a',
      filesize: f.filesize || f.filesize_approx || null,
      fps: null,
      vcodec: null,
      acodec: f.acodec || null,
      url: f.url,
      type: 'audio',
    });

    if (audioAdded.size >= 3) break;
  }

  // If NO audio-only formats found but video has audio, flag it
  // The download route will use bestaudio selector at download time
  if (audioAdded.size === 0 && videoFormats.some(f => f.acodec && f.acodec !== 'none')) {
    // Push a synthetic audio entry so the button appears
    normalized.push({
      formatId: 'bestaudio',
      quality: 'Audio Only',
      height: null,
      width: null,
      ext: 'm4a',
      filesize: null,
      fps: null,
      vcodec: null,
      acodec: 'aac',
      url: '',
      type: 'audio',
    });
  }

  return normalized.slice(0, 12);
}

async function extractMetadata(url) {
  const cached = metaCache.get(url);
  if (cached) {
    logger.debug(`Cache hit for: ${url}`);
    return cached;
  }

  logger.info(`Extracting metadata for: ${url}`);
  const platform = detectPlatform(url);

  // REMOVED --flat-playlist — it strips format data
  // REMOVED --flat-playlist because it prevents full format extraction
  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '--add-header', 'Accept-Language:en-US,en;q=0.9',
    '--extractor-args', 'youtube:skip=dash,hls',
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
    logger.error(`yt-dlp execution failed: ${err.message}`);
    const msg = (err.stderr || err.message || '').toLowerCase();

    if (msg.includes('private video') || msg.includes('private')) throw new Error('PRIVATE_VIDEO');
    if (msg.includes('not available') || msg.includes('unavailable')) throw new Error('UNAVAILABLE_VIDEO');
    if (msg.includes('removed') || msg.includes('deleted')) throw new Error('DELETED_VIDEO');
    if (msg.includes('copyright')) throw new Error('COPYRIGHT_RESTRICTED');
    if (msg.includes('age') && msg.includes('restricted')) throw new Error('AGE_RESTRICTED');
    if (msg.includes('sign in') || msg.includes('login')) throw new Error('LOGIN_REQUIRED');

    throw new Error('EXTRACTION_FAILED');
  }

  if (!stdout || !stdout.trim()) {
    throw new Error('EXTRACTION_FAILED');
  }

  let info;
  try {
    // yt-dlp can output multiple lines; take the last valid JSON line
    const lines = stdout.trim().split('\n');
    let parsed = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        parsed = JSON.parse(lines[i]);
        break;
      } catch {}
    }
    if (!parsed) throw new Error('No valid JSON found');
    info = parsed;
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
    hasAudio: formats.some(f => f.type === 'audio'),
    hasVideo: formats.some(f => f.type === 'video'),
    extractedAt: Date.now(),
  };

  metaCache.set(url, result);
  logger.info(`Extracted ${formats.length} formats for ${platform}: ${result.title}`);
  return result;
}

async function getDownloadUrl(url, formatId) {
  // For audio, use yt-dlp's best audio selector
  const formatSelector = formatId && formatId !== 'bestaudio'
    ? formatId
    : 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio';

  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '-f', formatSelector,
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
      try {
        info = JSON.parse(lines[i]);
        break;
      } catch {}
    }

    if (!info || !info.url) {
      throw new Error('No URL in response');
    }

    return {
      directUrl: info.url,
      ext: info.ext || 'mp4',
      title: info.title || 'video',
    };
  } catch (err) {
    logger.error(`Failed to get download URL: ${err.message}`);
    throw new Error('DOWNLOAD_URL_FAILED');
  }
}

module.exports = { extractMetadata, getDownloadUrl, metaCache };