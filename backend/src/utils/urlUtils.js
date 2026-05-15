const { z } = require('zod');

// YouTube REMOVED — coming soon, requires cookies/bot prevention
const SUPPORTED_DOMAINS = [
  'instagram.com', 'www.instagram.com',
  'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'm.tiktok.com',
  'facebook.com', 'www.facebook.com', 'fb.watch', 'm.facebook.com',
  'twitter.com', 'www.twitter.com', 'x.com', 'www.x.com',
  'pinterest.com', 'www.pinterest.com', 'pin.it',
  'vimeo.com', 'www.vimeo.com',
  'reddit.com', 'www.reddit.com', 'v.redd.it',
];

const urlSchema = z.object({
  url: z.string()
    .url('Invalid URL format')
    .max(2048, 'URL too long')
    .refine(url => {
      try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    }, 'URL must use HTTP or HTTPS protocol'),
});

function detectPlatform(url) {
  try {
    const { hostname } = new URL(url);
    const clean = hostname.replace(/^www\./, '').toLowerCase();

    // YouTube intentionally excluded
    if (['instagram.com'].includes(clean)) return 'instagram';
    if (['tiktok.com', 'vm.tiktok.com', 'm.tiktok.com'].includes(clean)) return 'tiktok';
    if (['facebook.com', 'fb.watch', 'm.facebook.com'].includes(clean)) return 'facebook';
    if (['twitter.com', 'x.com'].includes(clean)) return 'twitter';
    if (['pinterest.com', 'pin.it'].includes(clean)) return 'pinterest';
    if (['vimeo.com'].includes(clean)) return 'vimeo';
    if (['reddit.com', 'v.redd.it'].includes(clean)) return 'reddit';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function isSupportedUrl(url) {
  try {
    const { hostname } = new URL(url);
    const clean = hostname.replace(/^www\./, '').toLowerCase();
    return SUPPORTED_DOMAINS.some(d => d.replace(/^www\./, '') === clean || hostname === d);
  } catch {
    return false;
  }
}

// Check if URL is YouTube (to give specific "coming soon" error)
function isYouTubeUrl(url) {
  try {
    const { hostname } = new URL(url);
    const clean = hostname.replace(/^www\./, '').toLowerCase();
    return ['youtube.com', 'youtu.be', 'm.youtube.com'].includes(clean);
  } catch {
    return false;
  }
}

function sanitizeUrl(url) {
  try {
    const parsed = new URL(url.trim());
    return parsed.href;
  } catch {
    return null;
  }
}

module.exports = { urlSchema, detectPlatform, isSupportedUrl, isYouTubeUrl, sanitizeUrl, SUPPORTED_DOMAINS };