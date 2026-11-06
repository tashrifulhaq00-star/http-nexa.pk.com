'use strict';
/**
 * Admin panel — manage users, enquiries, services, testimonials, subscribers,
 * and view the audit log. Everything here requires role === 'admin'.
 * Destructive actions are CSRF-protected POST forms and recorded in activity_log.
 */
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, logActivity } = require('../db');
const v = require('../validators');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

const PER_PAGE = 10;
const pageMeta = (total, page) => ({ total, page, pages: Math.max(1, Math.ceil(total / PER_PAGE)), perPage: PER_PAGE });

/** Count other active admins (to protect against locking everyone out). */
const otherActiveAdmins = (excludeId) =>
  db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?").get(excludeId).c;

/* ──────────────────────── Overview ───────────────────────── */

router.get('/', (req, res) => {
  const stats = {
    users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
    activeUsers: db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_active = 1').get().c,
    services: db.prepare('SELECT COUNT(*) AS c FROM services WHERE is_active = 1').get().c,
    newMessages: db.prepare("SELECT COUNT(*) AS c FROM messages WHERE status = 'new'").get().c,
    totalMessages: db.prepare('SELECT COUNT(*) AS c FROM messages').get().c,
    subscribers: db.prepare('SELECT COUNT(*) AS c FROM subscribers').get().c,
  };
  const recentMessages = db.prepare('SELECT id, name, email, subject, status, created_at FROM messages ORDER BY created_at DESC LIMIT 5').all();
  const recentUsers = db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 5').all();
  const activity = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC, id DESC LIMIT 10').all();
  res.render('admin/index', {
    title: 'Admin Overview — Nexora Digital',
    description: 'Nexora Digital administration panel.',
    active: 'overview',
    stats, recentMessages, recentUsers, activity,
  });
});

/* ───────────────────────── Users ────────────────────────── */

router.get('/users', (req, res) => {
  const q = v.clamp(req.query.q, 80);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const like = `%${q}%`;
  const where = q ? 'WHERE name LIKE ? OR email LIKE ?' : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM users ${where}`).get(...(q ? [like, like] : [])).c;
  const users = db.prepare(`SELECT id, name, email, role, is_active, last_login_at, created_at FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...(q ? [like, like] : []), PER_PAGE, (page - 1) * PER_PAGE);
  res.render('admin/users', {
    title: 'Manage Users — Admin',
    description: 'Search, promote, deactivate and reset accounts.',
    active: 'users',
    users, q, page, ...pageMeta(total, page),
    tempPassword: req.session.tempPassword ? req.session.tempPassword : null,
    tempPasswordFor: req.session.tempPasswordFor || null,
  });
  delete req.session.tempPassword;
  delete req.session.tempPasswordFor;
});

router.post('/users/:id/role', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).render('error', { title: 'Not found', code: 404, message: 'User not found.' });
  if (target.id === req.user.id) {
    req.session.flash = { type: 'error', message: 'You cannot change your own role.' };
    return res.redirect('/admin/users');
  }
  const newRole = target.role === 'admin' ? 'user' : 'admin';
  if (newRole === 'user' && target.role === 'admin' && otherActiveAdmins(target.id) === 0) {
    req.session.flash = { type: 'error', message: 'Refusing to demote the last active administrator.' };
    return res.redirect('/admin/users');
  }
  db.prepare(`UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`).run(newRole, id);
  logActivity(req.user.id, req.user.name, `role_changed_to_${newRole}`, target.email);
  req.session.flash = { type: 'success', message: `${target.name} is now ${newRole === 'admin' ? 'an administrator' : 'a standard user'}.` };
  res.redirect('/admin/users');
});

router.post('/users/:id/toggle-active', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).render('error', { title: 'Not found', code: 404, message: 'User not found.' });
  if (target.id === req.user.id) {
    req.session.flash = { type: 'error', message: 'You cannot deactivate your own account.' };
    return res.redirect('/admin/users');
  }
  if (target.is_active && target.role === 'admin' && otherActiveAdmins(target.id) === 0) {
    req.session.flash = { type: 'error', message: 'Refusing to deactivate the last active administrator.' };
    return res.redirect('/admin/users');
  }
  const nowActive = target.is_active ? 0 : 1;
  db.prepare(`UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?`).run(nowActive, id);
  if (!nowActive) db.prepare('DELETE FROM sessions WHERE sess LIKE ?').run(`%"userId":${id}%`); // force re-login
  logActivity(req.user.id, req.user.name, nowActive ? 'user_reactivated' : 'user_deactivated', target.email);
  req.session.flash = { type: 'success', message: `${target.name}'s account has been ${nowActive ? 'reactivated' : 'deactivated'}.` };
  res.redirect('/admin/users');
});

router.post('/users/:id/reset-password', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).render('error', { title: 'Not found', code: 404, message: 'User not found.' });
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const temp = Array.from(crypto.randomBytes(14)).map((b) => alphabet[b % alphabet.length]).join('') + '9!';
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(bcrypt.hashSync(temp, 12), id);
  db.prepare('DELETE FROM sessions WHERE sess LIKE ?').run(`%"userId":${id}%`); // force re-login everywhere
  logActivity(req.user.id, req.user.name, 'password_reset', target.email);
  req.session.tempPassword = temp;
  req.session.tempPasswordFor = target.email;
  req.session.flash = { type: 'success', message: `Temporary password generated for ${target.name}. Share it securely — it is shown only once.` };
  res.redirect('/admin/users');
});

router.post('/users/:id/delete', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).render('error', { title: 'Not found', code: 404, message: 'User not found.' });
  if (target.id === req.user.id) {
    req.session.flash = { type: 'error', message: 'You cannot delete your own account.' };
    return res.redirect('/admin/users');
  }
  if (target.role === 'admin' && otherActiveAdmins(target.id) === 0) {
    req.session.flash = { type: 'error', message: 'Refusing to delete the last active administrator.' };
    return res.redirect('/admin/users');
  }
  db.prepare('DELETE FROM sessions WHERE sess LIKE ?').run(`%"userId":${id}%`);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  logActivity(req.user.id, req.user.name, 'user_deleted', target.email);
  req.session.flash = { type: 'success', message: `${target.name}'s account has been permanently deleted.` };
  res.redirect('/admin/users');
});

/* ──────────────────────── Messages ───────────────────────── */

router.get('/messages', (req, res) => {
  const status = ['new', 'read', 'archived'].includes(req.query.status) ? req.query.status : '';
  const q = v.clamp(req.query.q, 80);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

  const clauses = [];
  const params = [];
  if (status) { clauses.push('status = ?'); params.push(status); }
  if (q) { clauses.push('(name LIKE ? OR email LIKE ? OR subject LIKE ? OR message LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM messages ${where}`).get(...params).c;
  const messages = db.prepare(`SELECT * FROM messages ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, PER_PAGE, (page - 1) * PER_PAGE);
  const counts = {
    all: db.prepare('SELECT COUNT(*) AS c FROM messages').get().c,
    new: db.prepare("SELECT COUNT(*) AS c FROM messages WHERE status = 'new'").get().c,
    read: db.prepare("SELECT COUNT(*) AS c FROM messages WHERE status = 'read'").get().c,
    archived: db.prepare("SELECT COUNT(*) AS c FROM messages WHERE status = 'archived'").get().c,
  };
  res.render('admin/messages', {
    title: 'Enquiries — Admin',
    description: 'Read, triage and archive contact-form enquiries.',
    active: 'messages',
    messages, counts, status, q, page, ...pageMeta(total, page),
  });
});

router.get('/messages/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  if (!message) return res.status(404).render('error', { title: 'Not found', code: 404, message: 'That enquiry does not exist.' });
  if (message.status === 'new') db.prepare("UPDATE messages SET status = 'read' WHERE id = ?").run(id);
  res.render('admin/message-detail', {
    title: `Enquiry #${message.id} — Admin`,
    description: 'Enquiry detail',
    active: 'messages',
    message: { ...message, status: message.status === 'new' ? 'read' : message.status },
  });
});

router.post('/messages/:id/status', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const status = ['new', 'read', 'archived'].includes(req.body.status) ? req.body.status : null;
  const target = `/admin/messages/${id}`;
  if (!status) { req.session.flash = { type: 'error', message: 'Invalid status.' }; return res.redirect(target); }
  const info = db.prepare('UPDATE messages SET status = ? WHERE id = ?').run(status, id);
  if (info.changes) logActivity(req.user.id, req.user.name, `message_${status}`, `#${id}`);
  req.session.flash = { type: 'success', message: `Enquiry marked as ${status}.` };
  res.redirect(req.body.from === 'list' ? '/admin/messages' : target);
});

router.post('/messages/:id/delete', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  logActivity(req.user.id, req.user.name, 'message_deleted', `#${id}`);
  req.session.flash = { type: 'success', message: 'Enquiry deleted.' };
  res.redirect('/admin/messages');
});

/* ──────────────────────── Services ───────────────────────── */

const serviceFromBody = (body) => {
  const features = String(body.features || '')
    .split('\n').map((f) => v.clamp(f, 140)).filter(Boolean).slice(0, 20);
  return {
    slug: v.clamp(body.slug, 80).toLowerCase(),
    icon: v.clamp(body.icon, 30) || 'sparkles',
    title: v.clamp(body.title, 90),
    tagline: v.clamp(body.tagline, 140),
    description: v.clamp(body.description, 2000),
    price: v.clamp(body.price, 60),
    features: JSON.stringify(features),
    sort_order: Number.parseInt(body.sort_order, 10) || 0,
  };
};

router.get('/services', (req, res) => {
  const services = db.prepare('SELECT * FROM services ORDER BY sort_order, id').all()
    .map((s) => ({ ...s, features: v.parseFeatures(s.features) }));
  res.render('admin/services', {
    title: 'Manage Services — Admin',
    description: 'Create, edit, reorder and retire the services shown on the site.',
    active: 'services',
    services,
    errors: [],
  });
});

router.post('/services', (req, res) => {
  const s = serviceFromBody(req.body);
  const errors = [];
  if (!v.isSlug(s.slug)) errors.push('Slug must be lowercase letters, numbers and dashes only (e.g. "web-development").');
  if (s.title.length < 2) errors.push('Title must be at least 2 characters.');
  if (db.prepare('SELECT id FROM services WHERE slug = ? OR title = ?').get(s.slug, s.title)) errors.push('A service with that slug or title already exists.');
  if (errors.length) {
    req.session.flash = { type: 'error', message: errors.join(' ') };
    return res.redirect('/admin/services');
  }
  db.prepare('INSERT INTO services (slug, icon, title, tagline, description, price, features, sort_order) VALUES (?,?,?,?,?,?,?,?)')
    .run(s.slug, s.icon, s.title, s.tagline, s.description, s.price, s.features, s.sort_order);
  logActivity(req.user.id, req.user.name, 'service_created', s.title);
  req.session.flash = { type: 'success', message: `Service "${s.title}" created.` };
  res.redirect('/admin/services');
});

router.post('/services/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const target = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  if (!target) return res.status(404).render('error', { title: 'Not found', code: 404, message: 'Service not found.' });
  const s = serviceFromBody(req.body);
  if (!v.isSlug(s.slug) || s.title.length < 2) {
    req.session.flash = { type: 'error', message: 'Invalid slug or title.' };
    return res.redirect('/admin/services');
  }
  const clash = db.prepare('SELECT id FROM services WHERE (slug = ? OR title = ?) AND id != ?').get(s.slug, s.title, id);
  if (clash) {
    req.session.flash = { type: 'error', message: 'Another service already uses that slug or title.' };
    return res.redirect('/admin/services');
  }
  db.prepare('UPDATE services SET slug=?, icon=?, title=?, tagline=?, description=?, price=?, features=?, sort_order=? WHERE id=?')
    .run(s.slug, s.icon, s.title, s.tagline, s.description, s.price, s.features, s.sort_order, id);
  logActivity(req.user.id, req.user.name, 'service_updated', s.title);
  req.session.flash = { type: 'success', message: `Service "${s.title}" updated.` };
  res.redirect('/admin/services');
});

router.post('/services/:id/toggle', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const target = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  if (target) {
    db.prepare('UPDATE services SET is_active = ? WHERE id = ?').run(target.is_active ? 0 : 1, id);
    logActivity(req.user.id, req.user.name, target.is_active ? 'service_hidden' : 'service_published', target.title);
    req.session.flash = { type: 'success', message: `"${target.title}" is now ${target.is_active ? 'hidden from' : 'visible on'} the site.` };
  }
  res.redirect('/admin/services');
});

router.post('/services/:id/delete', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const target = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  if (target) {
    db.prepare('DELETE FROM services WHERE id = ?').run(id);
    logActivity(req.user.id, req.user.name, 'service_deleted', target.title);
    req.session.flash = { type: 'success', message: `Service "${target.title}" deleted.` };
  }
  res.redirect('/admin/services');
});

/* ─────────────────────── Testimonials ─────────────────────── */

router.get('/testimonials', (req, res) => {
  const testimonials = db.prepare('SELECT * FROM testimonials ORDER BY id DESC').all();
  res.render('admin/testimonials', {
    title: 'Manage Testimonials — Admin',
    description: 'Curate the client testimonials shown on the homepage.',
    active: 'testimonials',
    testimonials,
  });
});

const testimonialFromBody = (body) => ({
  author: v.clamp(body.author, 80),
  role: v.clamp(body.role, 80),
  company: v.clamp(body.company, 80),
  quote: v.clamp(body.quote, 600),
  rating: v.toRating(body.rating),
});

router.post('/testimonials', (req, res) => {
  const t = testimonialFromBody(req.body);
  if (t.author.length < 2 || t.quote.length < 10) {
    req.session.flash = { type: 'error', message: 'Author (min 2 chars) and quote (min 10 chars) are required.' };
    return res.redirect('/admin/testimonials');
  }
  db.prepare('INSERT INTO testimonials (author, role, company, quote, rating) VALUES (?,?,?,?,?)')
    .run(t.author, t.role, t.company, t.quote, t.rating);
  logActivity(req.user.id, req.user.name, 'testimonial_created', t.author);
  req.session.flash = { type: 'success', message: 'Testimonial added.' };
  res.redirect('/admin/testimonials');
});

router.post('/testimonials/:id/toggle', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const t = db.prepare('SELECT * FROM testimonials WHERE id = ?').get(id);
  if (t) {
    db.prepare('UPDATE testimonials SET is_active = ? WHERE id = ?').run(t.is_active ? 0 : 1, id);
    logActivity(req.user.id, req.user.name, t.is_active ? 'testimonial_hidden' : 'testimonial_published', t.author);
    req.session.flash = { type: 'success', message: `Testimonial by ${t.author} ${t.is_active ? 'hidden' : 'published'}.` };
  }
  res.redirect('/admin/testimonials');
});

router.post('/testimonials/:id/delete', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const t = db.prepare('SELECT * FROM testimonials WHERE id = ?').get(id);
  if (t) {
    db.prepare('DELETE FROM testimonials WHERE id = ?').run(id);
    logActivity(req.user.id, req.user.name, 'testimonial_deleted', t.author);
    req.session.flash = { type: 'success', message: 'Testimonial deleted.' };
  }
  res.redirect('/admin/testimonials');
});

/* ─────────────────────── Subscribers ───────────────────────── */

router.get('/subscribers', (req, res) => {
  const subscribers = db.prepare('SELECT * FROM subscribers ORDER BY created_at DESC').all();
  res.render('admin/subscribers', {
    title: 'Newsletter Subscribers — Admin',
    description: 'Everyone subscribed to the Nexora newsletter.',
    active: 'subscribers',
    subscribers,
  });
});

router.get('/subscribers.csv', (req, res) => {
  const rows = db.prepare('SELECT email, created_at FROM subscribers ORDER BY created_at DESC').all();
  const csv = ['email,subscribed_at', ...rows.map((r) => `${v.csvCell(r.email)},${v.csvCell(r.created_at)}`)].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nexora-subscribers.csv"');
  logActivity(req.user.id, req.user.name, 'subscribers_exported', `${rows.length} rows`);
  res.send(csv);
});

router.post('/subscribers/:id/delete', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const row = db.prepare('SELECT email FROM subscribers WHERE id = ?').get(id);
  db.prepare('DELETE FROM subscribers WHERE id = ?').run(id);
  if (row) logActivity(req.user.id, req.user.name, 'subscriber_removed', row.email);
  req.session.flash = { type: 'success', message: 'Subscriber removed.' };
  res.redirect('/admin/subscribers');
});

/* ──────────────────────── Activity ────────────────────────── */

router.get('/activity', (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const total = db.prepare('SELECT COUNT(*) AS c FROM activity_log').get().c;
  const activity = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?')
    .all(PER_PAGE, (page - 1) * PER_PAGE);
  res.render('admin/activity', {
    title: 'Audit Log — Admin',
    description: 'Every privileged action taken in the admin panel.',
    active: 'activity',
    activity, page, ...pageMeta(total, page),
  });
});

module.exports = router;
