'use strict';

const crypto = require('node:crypto');
const db = require('../db');

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function csrfToken(req, res) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('base64url');
  res.set('Cache-Control', 'no-store');
  res.json({ csrfToken: req.session.csrfToken });
}

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const expectedOrigin = process.env.APP_ORIGIN;
  const origin = req.get('origin');
  if (origin && expectedOrigin && origin !== expectedOrigin) {
    return res.status(403).json({ error: 'Origine de requête refusée.' });
  }
  const token = req.get('x-csrf-token');
  if (!constantTimeEqual(token, req.session?.csrfToken)) {
    return res.status(403).json({ error: 'Jeton de sécurité invalide. Rechargez la page.' });
  }
  next();
}

async function requireAuth(req, res, next) {
  try {
    const auth = req.session?.auth;
    if (!auth || auth.stage !== 'authenticated' || !auth.userId) {
      return res.status(401).json({ error: 'Authentification requise.' });
    }
    const rows = await db.query(
      `SELECT u.user_id, u.matricule, u.full_name, u.email, u.phone, u.avatar_url,
              u.role_id, u.session_version, u.mfa_enabled, u.is_active,
              r.role_code, r.role_name
         FROM users u JOIN roles r ON r.role_id = u.role_id
        WHERE u.user_id = ? LIMIT 1`, [auth.userId]
    );
    const user = rows[0];
    if (!user || !user.is_active || user.session_version !== auth.sessionVersion || !user.mfa_enabled) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Session expirée. Veuillez vous reconnecter.' });
    }
    req.auth = { userId: user.user_id, roleId: user.role_id, roleCode: user.role_code, user };
    next();
  } catch (error) { next(error); }
}

function requireRole(...roleCodes) {
  return (req, res, next) => {
    if (!req.auth || !roleCodes.includes(req.auth.roleCode)) {
      return res.status(403).json({ error: 'Vous ne disposez pas des droits nécessaires.' });
    }
    next();
  };
}

function requirePermission(permissionCode) {
  return async (req, res, next) => {
    try {
      if (req.auth?.roleCode === 'ADMIN') return next();
      const rows = await db.query(
        `SELECT 1 FROM role_permissions rp
          JOIN permissions p ON p.permission_id = rp.permission_id
         WHERE rp.role_id = ? AND p.permission_code = ? LIMIT 1`,
        [req.auth.roleId, permissionCode]
      );
      if (!rows.length) return res.status(403).json({ error: 'Droit insuffisant.' });
      next();
    } catch (error) { next(error); }
  };
}

module.exports = { csrfToken, csrfProtection, requireAuth, requireRole, requirePermission };
