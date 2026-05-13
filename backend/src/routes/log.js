const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { logAnalyticsEvent } = require('../services/supabaseService');

router.post('/', async (req, res) => {
  try {
    const schema = z.object({
      event: z.string().max(50),
      platform: z.string().max(30).optional(),
      metadata: z.record(z.unknown()).optional(),
    });
    const parsed = schema.parse(req.body);
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
    await logAnalyticsEvent({ ...parsed, ip });
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});

module.exports = router;
