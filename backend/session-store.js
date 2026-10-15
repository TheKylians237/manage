'use strict';

const session = require('express-session');
const { pool } = require('./db');

class MySQLSessionStore extends session.Store {
  get(sid, callback) {
    pool.execute('SELECT session_data, expires_at FROM http_sessions WHERE session_id = ? LIMIT 1', [sid])
      .then(([rows]) => {
        if (!rows.length) return callback(null, null);
        if (rows[0].expires_at <= Date.now()) {
          pool.execute('DELETE FROM http_sessions WHERE session_id = ?', [sid]).catch(() => {});
          return callback(null, null);
        }
        try { callback(null, JSON.parse(rows[0].session_data)); }
        catch (error) { callback(error); }
      }).catch(callback);
  }

  set(sid, sess, callback = () => {}) {
    const expiresAt = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 8 * 60 * 60 * 1000;
    pool.execute(
      `INSERT INTO http_sessions (session_id, expires_at, session_data) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at), session_data = VALUES(session_data)`,
      [sid, expiresAt, JSON.stringify(sess)]
    ).then(() => callback(null)).catch(callback);
  }

  touch(sid, sess, callback = () => {}) {
    const expiresAt = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 8 * 60 * 60 * 1000;
    pool.execute('UPDATE http_sessions SET expires_at = ? WHERE session_id = ?', [expiresAt, sid])
      .then(() => callback(null)).catch(callback);
  }

  destroy(sid, callback = () => {}) {
    pool.execute('DELETE FROM http_sessions WHERE session_id = ?', [sid])
      .then(() => callback(null)).catch(callback);
  }
}

module.exports = MySQLSessionStore;
