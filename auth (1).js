'use strict';
/**
 * Authentication: register, login (session regeneration, bcrypt, is_active check),
 * logout. Brute-force resistant via authLimiter; open-redirect safe via `next`
 * validation; timing-safe-ish login via dummy compare for unknown emails.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { db, logActivity } = require('../db');
const v = require('../validators');
const { authLimiter } = require('../middleware/security');

const router = express.Router();
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

/** Only allow local redirect targets (prevents open-redirect phishing). */
const safeNext = (raw) => {
  const s = String(raw || '');
  return s.startsWith('/') && !s.startsWith('//') && !s.includes('\\') ? s : null;
};

router.get('/login', (req, res) => {
  if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/dashboard');
  res.render('login', {
    title: 'Sign In — Nexora Digital',
    description: 'Sign in to your Nexora Digital client account to view enquiries, manage your profile and track projects.',
    active: '',
    next: safeNext(req.query.next) || '',
    form: { email: '' },
    errors: [],
  });
});

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('register', {
    title: 'Create Account — Nexora Digital',
    description: 'Create your Nexora Digital client account in under a minute.',
    active: '',
    form: { name: '', email: '' },
    errors: [],
  });
});

router.post('/register', authLimiter, (req, res) => {
  const name = v.clamp(req.body.name, 80);
  const email = v.clamp(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirm || '');

  const errors = [];
  if (name.length < 2) errors.push('Please enter your full name.');
  if (!v.isEmail(email)) errors.push('Please enter a valid email address.');
  const pwProblems = v.passwordProblems(password);
  if (pwProblems.length) errors.push(`Password must include ${pwProblems.join(', ')}.`);
  if (password !== confirm) errors.push('Passwords do not match.');
  if (req.body.terms !== 'on') errors.push('You must accept the Terms & Conditions to register.');

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) errors.push('An account with this email already exists. Try signing in instead.');

  if (errors.length) {
    return res.status(422).render('register', {
      title: 'Create Account — Nexora Digital',
      description: 'Create your Nexora Digital client account.',
      active: '',
      form: { name, email },
      errors,
    });
  }

  const hash = bcrypt.hashSync(password, 12);
  const info = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name, email, hash, 'user');

  // Prevent session fixation: brand-new session for the authenticated user.
  req.session.regenerate((err) => {
    if (err) {
      console.error('[register] session regenerate failed:', err);
      return res.status(500).render('error', { title: 'Something went wrong', code: 500, message: 'Your account was created but we could not sign you in. Please log in manually.' });
    }
    req.session.userId = info.lastInsertRowid;
    req.session.flash = { type: 'success', message: `Welcome to Nexora Digital, ${name.split(' ')[0]}! Your account is ready.` };
    res.redirect('/dashboard');
  });
});

router.post('/login', authLimiter, (req, res) => {
  const email = v.clamp(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || '');
  const next = safeNext(req.body.next);

  const fail = (msg) => res.status(401).render('login', {
    title: 'Sign In — Nexora Digital',
    description: 'Sign in to your Nexora Digital client account.',
    active: '',
    next: next || '',
    form: { email },
    errors: [msg],
  });

  if (!v.isEmail(email) || !password) return fail('Please enter a valid email and password.');

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const ok = bcrypt.compareSync(password, row ? row.password_hash : DUMMY_HASH);
  if (!row || !ok) return fail('Invalid email or password.');
  if (!row.is_active) return fail('This account has been deactivated. Please contact support.');

  req.session.regenerate((err) => {
    if (err) {
      console.error('[login] session regenerate failed:', err);
      return res.status(500).render('error', { title: 'Something went wrong', code: 500, message: 'Could not start your session. Please try again.' });
    }
    req.session.userId = row.id;
    db.prepare(`UPDATE users SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(row.id);
    if (row.role === 'admin') logActivity(row.id, row.name, 'admin_login', row.email);
    req.session.flash = { type: 'success', message: `Welcome back, ${row.name.split(' ')[0]}!` };
    res.redirect(next || (row.role === 'admin' ? '/admin' : '/dashboard'));
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('nexora.sid', { path: '/' });
    res.redirect('/');
  });
});

module.exports = router;
