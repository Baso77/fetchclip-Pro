const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/adminAuth');
const { getAdminStats } = require('../services/supabaseService');
const { metaCache } = require('../services/ytdlpService');

router.use(adminAuth);

router.get('/stats', async (req, res) => {
  try {
    const stats = await getAdminStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/cache', (req, res) => {
  const keys = metaCache.keys();
  res.json({ success: true, data: { cachedEntries: keys.length, keys } });
});

router.post('/cache/clear', (req, res) => {
  metaCache.flushAll();
  res.json({ success: true, message: 'Cache cleared' });
});

module.exports = router;
