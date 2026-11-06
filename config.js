'use strict';
/**
 * Central configuration.
 * Everything sensitive comes from environment variables — never hard-code secrets.
 * Copy .env.example to .env and adjust. See README.md for details.
 */
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

// Session secret: mandatory in production; a loud random dev fallback otherwise.
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  if (isProd) {
    throw new Error('SESSION_SECRET must be set to a random string of at least 32 characters in production. See .env.example');
  }
  sessionSecret = 'dev-only-insecure-secret-do-not-use-in-production';
  // eslint-disable-next-line no-console
  console.warn('[config] WARNING: SESSION_SECRET missing/short — using an insecure development fallback. Set one in .env (see .env.example).');
}

const ROOT = path.join(__dirname, '..');

module.exports = {
  root: ROOT,
  env: NODE_ENV,
  isProd,
  port: Number.parseInt(process.env.PORT || '3000', 10),
  sessionSecret,
  sessionTtlMs: Number.parseInt(process.env.SESSION_TTL_HOURS || '168', 10) * 60 * 60 * 1000,
  dbPath: path.resolve(ROOT, process.env.DB_PATH || './data/nexora.db'),
  uploadDir: path.join(ROOT, 'public', 'uploads'),
  admin: {
    name: process.env.ADMIN_NAME || 'Site Administrator',
    email: (process.env.ADMIN_EMAIL || 'admin@nexora.digital').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'Admin@12345',
  },
  demoUser: {
    enabled: (process.env.DEMO_USER_ENABLED || 'true') === 'true',
    name: process.env.DEMO_USER_NAME || 'Ayesha Khan',
    email: (process.env.DEMO_USER_EMAIL || 'demo@nexora.digital').toLowerCase(),
    password: process.env.DEMO_USER_PASSWORD || 'Demo@12345',
  },
  // Content Security Policy source list — kept here so it is easy to audit.
  csp: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"], // inline style attributes are used sparingly for dynamic widths
    imgSrc: ["'self'", 'data:', 'https:'],
    fontSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    formAction: ["'self'"],
    baseUri: ["'self'"],
  },
  genToken: (bytes = 32) => crypto.randomBytes(bytes).toString('hex'),
};
