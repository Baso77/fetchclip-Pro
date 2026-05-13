const express = require('express');
const router = express.Router();
const { execFile } = require('child_process');
const { getSupabase } = require('../services/supabaseService');

router.get('/', async (req, res) => {
  const checks = { status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0', checks: {} };

  await new Promise(resolve => {
  execFile(
    process.env.YTDLP_PATH || 'yt-dlp',
    ['--version'],
    { timeout: 5000 },
    (err, stdout) => {
      checks.checks.ytdlp = err
        ? { status: 'error', message: err.message }
        : { status: 'ok', version: stdout.trim() };

      resolve();
    }
  );
});

  try {
    const db = getSupabase();
    const { error } = await db.from('downloads').select('id').limit(1);
    checks.checks.database = error ? { status: 'error', message: error.message } : { status: 'ok' };
  } catch (err) {
    checks.checks.database = { status: 'error', message: err.message };
  }

  const allOk = Object.values(checks.checks).every(c => c.status === 'ok');
  checks.status = allOk ? 'ok' : 'degraded';

  res.status(allOk ? 200 : 503).json(checks);
});

module.exports = router;
