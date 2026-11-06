'use strict';
/**
 * Standalone seed/reset helper.
 *   node src/seed.js        — creates schema + seeds if DB is empty (safe, idempotent)
 * Seeding itself is wired into src/db.js so the app self-initializes on first run.
 */
require('./db');
console.log('[seed] Database ready.');
process.exit(0);
