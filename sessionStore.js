'use strict';
/**
 * SQLite-backed session store for express-session.
 * Keeps everything in the same encrypted-at-rest-capable database file,
 * so no external session service is required (free-tier friendly).
 * Sliding expiration is handled by express-session's `rolling` option.
 */
const session = require('express-session');

class SQLiteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.getStmt = db.prepare('SELECT sess, expired_at FROM sessions WHERE sid = ?');
    this.setStmt = db.prepare(`INSERT INTO sessions (sid, sess, expired_at) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired_at = excluded.expired_at`);
    this.destroyStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStmt = db.prepare('UPDATE sessions SET expired_at = ? WHERE sid = ?');
    this.clearStmt = db.prepare('DELETE FROM sessions');
    // Periodically purge expired sessions (hourly, unref'd so it never blocks shutdown)
    this.sweeper = setInterval(() => {
      try { db.prepare('DELETE FROM sessions WHERE expired_at < ?').run(Date.now()); } catch { /* db may be closed during shutdown */ }
    }, 60 * 60 * 1000);
    this.sweeper.unref();
  }

  _expires(sess) {
    const exp = sess && sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 7 * 24 * 3600 * 1000;
    return Number.isFinite(exp) ? exp : Date.now() + 7 * 24 * 3600 * 1000;
  }

  get(sid, cb) {
    try {
      const row = this.getStmt.get(sid);
      if (!row) return cb(null, null);
      if (row.expired_at < Date.now()) {
        this.destroyStmt.run(sid);
        return cb(null, null);
      }
      return cb(null, JSON.parse(row.sess));
    } catch (err) { return cb(err); }
  }

  set(sid, sess, cb) {
    try {
      this.setStmt.run(sid, JSON.stringify(sess), this._expires(sess));
      return cb && cb(null);
    } catch (err) { return cb && cb(err); }
  }

  destroy(sid, cb) {
    try {
      this.destroyStmt.run(sid);
      return cb && cb(null);
    } catch (err) { return cb && cb(err); }
  }

  touch(sid, sess, cb) {
    try {
      this.touchStmt.run(this._expires(sess), sid);
      return cb && cb(null);
    } catch (err) { return cb && cb(err); }
  }

  clear(cb) {
    try {
      this.clearStmt.run();
      return cb && cb(null);
    } catch (err) { return cb && cb(err); }
  }
}

module.exports = SQLiteSessionStore;
