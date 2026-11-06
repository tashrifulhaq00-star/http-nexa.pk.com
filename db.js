'use strict';
/**
 * Database layer (better-sqlite3 — synchronous, prepared statements, WAL mode).
 *
 * Tables
 *   users         — accounts (role: 'user' | 'admin'), hashed passwords
 *   services      — agency services shown on the site (admin-managed)
 *   testimonials  — client testimonials (admin-managed)
 *   messages      — contact-form / enquiry submissions
 *   subscribers   — newsletter subscribers
 *   activity_log  — admin audit trail
 *   sessions      — server-side session store backing express-session
 *
 * Relationships
 *   messages.user_id → users.id  (ON DELETE SET NULL)
 *   activity_log.admin_id → users.id (ON DELETE SET NULL)
 *
 * Backup: with WAL enabled you can safely copy data/nexora.db online, or run
 *   sqlite3 data/nexora.db ".backup 'backup.db'"
 * See README.md → "Database & backups".
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const config = require('./config');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(email) <= 160),
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  phone          TEXT DEFAULT '',
  title          TEXT DEFAULT '',
  bio            TEXT DEFAULT '',
  avatar         TEXT DEFAULT '',
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  last_login_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS services (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE CHECK (slug GLOB '[a-z0-9-]*'),
  icon        TEXT NOT NULL DEFAULT 'sparkles',
  title       TEXT NOT NULL UNIQUE CHECK (length(title) BETWEEN 2 AND 90),
  tagline     TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price       TEXT NOT NULL DEFAULT '',
  features    TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS testimonials (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  author     TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT '',
  company    TEXT NOT NULL DEFAULT '',
  quote      TEXT NOT NULL,
  rating     INTEGER NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT NOT NULL DEFAULT 'General enquiry',
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','archived')),
  ip         TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_email ON messages(email);

CREATE TABLE IF NOT EXISTS subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  admin_name TEXT NOT NULL DEFAULT 'system',
  action     TEXT NOT NULL,
  target     TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  sid        TEXT PRIMARY KEY,
  sess       TEXT NOT NULL,
  expired_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired_at);
`);

/* ───────────────────────── Seed data ───────────────────────── */

const SEED_SERVICES = [
  { slug: 'web-development', icon: 'code', title: 'Web Development', tagline: 'Fast, secure, scalable web apps', price: 'from $2,500', sort_order: 1,
    description: 'Custom websites, web applications and e-commerce platforms built with modern, battle-tested stacks. From marketing sites to complex dashboards — engineered for performance, security and maintainability.',
    features: ['Custom web apps & portals', 'E-commerce (payments, inventory, orders)', 'API design & integrations', 'Performance audits & optimization', 'Accessibility (WCAG 2.1 AA)'] },
  { slug: 'ui-ux-design', icon: 'pen', title: 'UI/UX Design', tagline: 'Interfaces people love to use', price: 'from $1,800', sort_order: 2,
    description: 'Research-driven product design: user journeys, wireframes, design systems and pixel-perfect interfaces. We design experiences that reduce friction and lift conversion.',
    features: ['User research & personas', 'Wireframes & interactive prototypes', 'Design systems & component libraries', 'Usability testing & iteration'] },
  { slug: 'mobile-apps', icon: 'phone', title: 'Mobile Apps', tagline: 'iOS & Android, one codebase', price: 'from $4,000', sort_order: 3,
    description: 'Cross-platform mobile applications with native feel — built for speed, offline resilience and app-store success. From MVP to full product with analytics baked in.',
    features: ['React Native / cross-platform', 'App Store & Play Store publishing', 'Push notifications & offline sync', 'In-app analytics & crash reporting'] },
  { slug: 'seo-growth', icon: 'chart', title: 'SEO & Growth', tagline: 'Compounding organic traffic', price: 'from $900/mo', sort_order: 4,
    description: 'Technical SEO, content strategy and conversion rate optimization. We measure what matters: rankings, qualified traffic and pipeline — reported in plain language.',
    features: ['Technical SEO audits', 'Keyword strategy & content briefs', 'Core Web Vitals optimization', 'Monthly reporting & roadmaps'] },
  { slug: 'branding', icon: 'sparkles', title: 'Brand Identity', tagline: 'A brand that commands attention', price: 'from $1,500', sort_order: 5,
    description: 'Naming, logo, visual identity and guidelines that make you unmistakably you — consistent across every touchpoint from pitch deck to packaging.',
    features: ['Naming & messaging framework', 'Logo & visual identity system', 'Brand guidelines & asset kits', 'Pitch-deck & social templates'] },
  { slug: 'cloud-devops', icon: 'cloud', title: 'Cloud & DevOps', tagline: 'Ship daily, sleep nightly', price: 'from $1,200/mo', sort_order: 6,
    description: 'CI/CD pipelines, containerization, monitoring and infrastructure as code. We turn fragile deployments into boring, reliable releases.',
    features: ['Docker & Kubernetes', 'CI/CD (GitHub Actions, etc.)', 'Monitoring, alerting & SLOs', 'Cost optimization & migrations'] },
];

const SEED_TESTIMONIALS = [
  { author: 'Hassan Raza', role: 'Founder & CEO', company: 'PakCart', rating: 5, quote: 'Nexora rebuilt our storefront and cut page load from 6 seconds to 1.4. Conversions jumped 38% in the first quarter. They are the rare agency that cares about business outcomes, not just pixels.' },
  { author: 'Sana Malik', role: 'Head of Product', company: 'MediTrack Health', rating: 5, quote: 'From discovery to launch in 11 weeks. The design system they built now powers three of our products. Communication was excellent and nothing shipped without our sign-off.' },
  { author: 'Omar Farooq', role: 'Director of Marketing', company: 'AlImran Group', rating: 5, quote: 'Their SEO program tripled our organic leads in eight months. Reporting is transparent, the team is sharp, and they push back with better ideas — exactly what you want from a partner.' },
  { author: 'Hira Noor', role: 'Operations Manager', company: 'SwiftFreight Logistics', rating: 5, quote: 'The internal dashboard they delivered replaced four spreadsheets and a very tired team. It is fast, reliable and our dispatchers genuinely enjoy using it.' },
  { author: 'Bilal Sheikh', role: 'Co-founder', company: 'EduSpark', rating: 5, quote: 'We came for a website and got a growth partner. Nexora shipped our MVP, then helped us hire and onboard our first two engineers. Outstanding work.' },
  { author: 'Maryam Tariq', role: 'Brand Lead', company: 'Verve Studio', rating: 5, quote: 'A complete rebrand in six weeks — naming, identity, website, launch. Our inbound enquiries doubled after launch and the identity still turns heads a year later.' },
];

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount > 0) return false;

  const insertUser = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`);
  insertUser.run(config.admin.name, config.admin.email, bcrypt.hashSync(config.admin.password, 12), 'admin');
  if (config.demoUser.enabled) {
    insertUser.run(config.demoUser.name, config.demoUser.email, bcrypt.hashSync(config.demoUser.password, 12), 'user');
  }

  const insertService = db.prepare(`INSERT INTO services (slug, icon, title, tagline, description, price, features, sort_order)
    VALUES (@slug, @icon, @title, @tagline, @description, @price, @features, @sort_order)`);
  const tx = db.transaction(() => {
    for (const s of SEED_SERVICES) insertService.run({ ...s, features: JSON.stringify(s.features) });
  });
  tx();

  const insertT = db.prepare(`INSERT INTO testimonials (author, role, company, quote, rating) VALUES (@author, @role, @company, @quote, @rating)`);
  const tx2 = db.transaction(() => { for (const t of SEED_TESTIMONIALS) insertT.run(t); });
  tx2();

  console.log(`[db] Seeded: admin <${config.admin.email}>${config.demoUser.enabled ? `, demo user <${config.demoUser.email}>` : ''}, ${SEED_SERVICES.length} services, ${SEED_TESTIMONIALS.length} testimonials`);
  return true;
}

seed();

/* ───────────────────────── Helpers ─────────────────────────── */

const publicUser = (u) => u && ({
  id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone,
  title: u.title, bio: u.bio, avatar: u.avatar, is_active: u.is_active,
  last_login_at: u.last_login_at, created_at: u.created_at,
});

function logActivity(adminId, adminName, action, target = '') {
  try {
    db.prepare('INSERT INTO activity_log (admin_id, admin_name, action, target) VALUES (?, ?, ?, ?)')
      .run(adminId ?? null, adminName ?? 'system', action, String(target).slice(0, 200));
  } catch (e) {
    console.error('[activity] failed to log:', e.message);
  }
}

module.exports = { db, publicUser, logActivity };
