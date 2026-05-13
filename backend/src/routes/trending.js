const express = require('express');
const router = express.Router();
const { getTrendingDownloads } = require('../services/supabaseService');

router.get('/', async (req, res) => {
  try {
    const data = await getTrendingDownloads(10);
    res.json({ success: true, data });
  } catch {
    res.json({ success: true, data: [] });
  }
});

module.exports = router;
