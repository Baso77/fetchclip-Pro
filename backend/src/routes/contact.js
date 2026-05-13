const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { saveContactMessage } = require('../services/supabaseService');

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200),
  message: z.string().min(10).max(2000),
});

router.post('/', async (req, res) => {
  try {
    const parsed = contactSchema.parse(req.body);
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
    await saveContactMessage({ ...parsed, ip });
    res.json({ success: true, message: 'Message sent successfully' });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0]?.message || 'Invalid input' });
    }
    res.status(500).json({ success: false, error: 'Failed to send message. Please try again.' });
  }
});

module.exports = router;
