// This script runs at container startup to update yt-dlp to latest version
// It uses the yt-dlp binary's own --update flag — no pip3 needed
const { execFile } = require('child_process');

const ytdlpPath = process.env.YTDLP_PATH || 'yt-dlp';

console.log('[yt-dlp] Checking for updates...');

execFile(ytdlpPath, ['--update'], { timeout: 30000 }, (err, stdout, stderr) => {
  if (err) {
    // Not a fatal error — yt-dlp still works even if update fails
    console.warn('[yt-dlp] Update check failed (non-fatal):', err.message);
  } else {
    console.log('[yt-dlp] Update result:', stdout.trim() || 'Already up to date');
  }
});