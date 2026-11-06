'use strict';
/**
 * Public JSON API (rate-limited, CSRF-protected for writes).
 *   GET  /api/health    — liveness + DB check
 *   GET  /api/services  — active services as JSON
 *   POST /api/newsletter — subscribe { email } as JSON
 */
const express = require('express');
const { db } = require('../db');
const v = require('../validators');
const { subscribeLimiter } = require('../middleware/security');

const router = express.Router();

router.get('/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', db: 'ok', uptime: Math.round(process.uptime()) });
  } catch (e) {
    res.status(503).json({ status: 'error', db: 'unavailable' });
  }
});

router.get('/services', (req, res) => {
  const services = db.prepare('SELECT slug, title, tagline, price, icon FROM services WHERE is_active = 1 ORDER BY sort_order, id').all();
  res.json({ count: services.length, services });
});

router.post('/newsletter', subscribeLimiter, (req, res) => {
  const email = v.clamp(req.body.email, 160).toLowerCase();
  if (!v.isEmail(email)) return res.status(422).json({ ok: false, error: 'Please provide a valid email address.' });
  try {
    db.prepare('INSERT INTO subscribers (email) VALUES (?)').run(email);
    return res.status(201).json({ ok: true, message: 'Subscribed successfully.' });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.json({ ok: true, message: 'Already subscribed.' });
    console.error('[api/newsletter]', e);
    return res.status(500).json({ ok: false, error: 'Could not subscribe right now.' });
  }
});

module.exports = router;
