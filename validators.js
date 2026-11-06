'use strict';
/**
 * Input validation & sanitization helpers.
 * Every piece of user input passes through here before touching the database.
 * Output is escaped by EJS (<%= %>), queries use prepared statements — together
 * these close the door on XSS and SQL injection.
 */

const stripControl = (s) => String(s ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
const clamp = (s, max) => stripControl(s).slice(0, max);

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v ?? '').trim()) && String(v).length <= 160;

const isStrongPassword = (pw) => {
  const s = String(pw ?? '');
  return s.length >= 8 && s.length <= 128 && /[a-z]/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s);
};

const passwordProblems = (pw) => {
  const s = String(pw ?? '');
  const p = [];
  if (s.length < 8) p.push('at least 8 characters');
  if (s.length > 128) p.push('at most 128 characters');
  if (!/[a-z]/.test(s)) p.push('a lowercase letter');
  if (!/[A-Z]/.test(s)) p.push('an uppercase letter');
  if (!/[0-9]/.test(s)) p.push('a digit');
  return p;
};

const isSlug = (v) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(v ?? '')) && v.length <= 80;

const isPhone = (v) => {
  const s = String(v ?? '').trim();
  return s === '' || /^[+()\-\s.\d]{7,20}$/.test(s);
};

/** Normalize a 1–5 rating, defaulting to 5. */
const toRating = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 5;
};

/** Safely parse the services.features JSON column → string[] */
const parseFeatures = (json) => {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr.filter((f) => typeof f === 'string') : [];
  } catch {
    return [];
  }
};

/** Minimal CSV escaping (quotes doubled, fields wrapped in quotes). */
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

module.exports = {
  clamp,
  stripControl,
  isEmail,
  isStrongPassword,
  passwordProblems,
  isSlug,
  isPhone,
  toRating,
  parseFeatures,
  csvCell,
};
