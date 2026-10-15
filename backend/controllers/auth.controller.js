'use strict';

const crypto = require('node:crypto');
const argon2 = require('argon2');
const QRCode = require('qrcode');
const db = require('../db');
const mailer = require('../mailer');

// La clé doit être un base64 canonique représentant exactement 32 octets.
const rawKey = process.env.MFA_ENCRYPTION_KEY || '';
const KEY = Buffer.from(rawKey, 'base64');

if (!/^(?:[A-Za-z0-9+/]{4}){10}[A-Za-z0-9+/]{3}=$/.test(rawKey) || KEY.length !== 32 || KEY.toString('base64') !== rawKey) {
  throw new Error('MFA_ENCRYPTION_KEY est manquante ou invalide dans le fichier .env (doit contenir 32 octets encodés en base64).');
}

function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function decryptSecret(value) {
  const packed = Buffer.from(value);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, packed.subarray(0, 12));
  decipher.setAuthTag(packed.subarray(12, 28));
  return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8');
}

function base32Encode(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(text) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const output = [];
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('Secret TOTP invalide.');
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(output);
}

function totp(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = ((mac[offset] & 0x7f) << 24) | ((mac[offset + 1] & 0xff) << 16) | ((mac[offset + 2] & 0xff) << 8) | (mac[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, '0');
}

function verifyTotp(secret, token, now = Date.now()) {
  if (!/^\d{6}$/.test(String(token || ''))) return null;
  const currentStep = Math.floor(now / 30000);
  for (const step of [currentStep - 1, currentStep, currentStep + 1]) {
    if (step >= 0 && crypto.timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(String(token)))) return step;
  }
  return null;
}

function recoveryHash(code) {
  return crypto.createHmac('sha256', KEY).update(String(code).replace(/-/g, '').toUpperCase()).digest();
}

function newRecoveryCodes() {
  return Array.from({ length: 10 }, () => crypto.randomBytes(12).toString('hex').toUpperCase().match(/.{1,4}/g).join('-'));
}

function genericFailure(res) { return res.status(401).json({ error: 'Identifiant ou mot de passe invalide.' }); }

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,256}$/;
function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
function tokenHash(token) { return crypto.createHash('sha256').update(token).digest(); }

async function register(req, res, next) {
  try {
    const registrationSetting = (await db.query("SELECT setting_value FROM app_settings WHERE setting_key = 'account_creation_enabled' LIMIT 1"))[0];
    if (registrationSetting && registrationSetting.setting_value !== '1') return res.status(403).json({ error: 'La création de comptes est temporairement désactivée par l’administrateur.' });
    const d = req.body || {};
    const matricule = String(d.matricule || d.badge || '').trim();
    const fullName = String(d.fullName || '').trim();
    const email = normalizeEmail(d.email);
    const password = String(d.password || '');
    if (!/^[\p{L}\p{N}._-]{2,40}$/u.test(matricule) || fullName.length < 2 || fullName.length > 150 || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || !PASSWORD_RULE.test(password)) {
      return res.status(400).json({ error: 'Vérifiez votre matricule, vos informations et utilisez un mot de passe de 12 caractères avec majuscule, minuscule, chiffre et symbole.' });
    }
    const role = (await db.query("SELECT role_id FROM roles WHERE role_code = 'STOREKEEPER' LIMIT 1"))[0];
    if (!role) return res.status(500).json({ error: 'Le rôle par défaut est indisponible.' });
    const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    const result = await db.query('INSERT INTO users(matricule, full_name, email, password_hash, role_id, mfa_enabled, is_active) VALUES(?,?,?,?,?,FALSE,TRUE)', [matricule, fullName, email, hash, role.role_id]);
    await db.query('INSERT INTO audit_logs (user_id, action_code, entity_name, entity_id) VALUES (?, ?, ?, ?)', [result.insertId, 'ACCOUNT_REGISTERED', 'users', result.insertId]);
    res.status(201).json({ ok: true, message: 'Compte créé. Vous pouvez maintenant vous connecter.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ce matricule ou cette adresse e-mail est déjà utilisé.' });
    next(error);
  }
}

async function requestPasswordReset(req, res, next) {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Adresse e-mail invalide.' });
    const user = (await db.query('SELECT user_id, full_name, email FROM users WHERE email = ? AND is_active = TRUE LIMIT 1', [email]))[0];
    if (user) {
      const token = crypto.randomBytes(32).toString('base64url');
      await db.query('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [user.user_id]);
      await db.query('INSERT INTO password_reset_tokens(user_id, token_hash, expires_at) VALUES(?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))', [user.user_id, tokenHash(token)]);
      const base = String(process.env.APP_ORIGIN).replace(/\/$/, '');
      await mailer.sendPasswordReset(user, `${base}/reset-password.html?token=${encodeURIComponent(token)}`);
    }
    res.json({ ok: true, message: 'Si un compte correspond à cette adresse, un lien de réinitialisation vient d’être envoyé.' });
  } catch (error) { next(error); }
}

async function resetPassword(req, res, next) {
  try {
    const token = String(req.body?.token || '');
    const password = String(req.body?.password || '');
    if (!/^[A-Za-z0-9_-]{32,64}$/.test(token) || !PASSWORD_RULE.test(password)) return res.status(400).json({ error: 'Lien ou mot de passe invalide.' });
    const row = (await db.query('SELECT token_id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() LIMIT 1', [tokenHash(token)]))[0];
    if (!row) return res.status(400).json({ error: 'Ce lien est invalide ou expiré.' });
    const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    await db.transaction(async tx => {
      await tx.query('UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL, session_version = session_version + 1 WHERE user_id = ?', [hash, row.user_id]);
      await tx.query('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE token_id = ?', [row.token_id]);
      await tx.query('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [row.user_id]);
    });
    res.json({ ok: true, message: 'Mot de passe réinitialisé. Vous pouvez vous connecter.' });
  } catch (error) { next(error); }
}

function rotateSession(req, data) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(error => {
      if (error) return reject(error);
      req.session.auth = data;
      req.session.csrfToken = crypto.randomBytes(32).toString('base64url');
      req.session.cookie.maxAge = 8 * 60 * 60 * 1000;
      req.session.save(saveError => saveError ? reject(saveError) : resolve());
    });
  });
}

async function finishAuthentication(req, res, user, options = {}) {
  const rows = await db.query('SELECT session_version, role_code FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = ?', [user.user_id]);
  const fresh = rows[0];
  await rotateSession(req, { stage: 'authenticated', userId: user.user_id, roleCode: fresh.role_code, sessionVersion: fresh.session_version });
  await db.query('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE user_id = ?', [user.user_id]);
  await db.query('INSERT INTO audit_logs (user_id, action_code, entity_name, entity_id) VALUES (?, ?, ?, ?)', [user.user_id, options.firstEnrollment ? 'MFA_ENROLLED' : 'LOGIN_SUCCESS', 'users', user.user_id]);
  return res.json({ ok: true, redirect: `/dashboard-${fresh.role_code.toLowerCase()}.html`, ...(options.recoveryCodes ? { recoveryCodes: options.recoveryCodes } : {}) });
}

async function status(req, res, next) {
  try {
    const auth = req.session?.auth;
    if (!auth || !['preauth', 'mfa-setup', 'authenticated'].includes(auth.stage)) return res.json({ authenticated: false, stage: null });
    const rows = await db.query('SELECT user_id, full_name, mfa_enabled FROM users WHERE user_id = ? AND is_active = TRUE LIMIT 1', [auth.userId]);
    if (!rows.length) return res.json({ authenticated: false, stage: null });
    return res.json({ authenticated: auth.stage === 'authenticated', stage: auth.stage, fullName: rows[0].full_name, roleCode: auth.roleCode || null });
  } catch (error) { next(error); }
}

async function login(req, res, next) {
  try {
    const badge = String(req.body?.matricule || req.body?.badge || '').trim().slice(0, 40);
    const password = String(req.body?.password || '');
    if (!/^[\p{L}\p{N}._-]{2,40}$/u.test(badge) || password.length > 256 || !password.length) return genericFailure(res);
    const rows = await db.query(
      `SELECT u.user_id, u.matricule, u.full_name, u.password_hash, u.mfa_enabled,
              u.is_active, u.failed_login_count, u.locked_until, u.session_version, r.role_code
         FROM users u JOIN roles r ON r.role_id = u.role_id
        WHERE u.matricule = ? LIMIT 1`, [badge]
    );
    const user = rows[0];
    if (!user || !user.is_active) return genericFailure(res);
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) return res.status(429).json({ error: 'Trop de tentatives. Réessayez plus tard.' });
    let valid = false;
    try { valid = await argon2.verify(user.password_hash, password); } catch { valid = false; }
    if (!valid) {
      await db.query(`UPDATE users SET failed_login_count = failed_login_count + 1,
        locked_until = CASE WHEN failed_login_count + 1 >= 5 THEN DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE) ELSE locked_until END
        WHERE user_id = ?`, [user.user_id]);
      return genericFailure(res);
    }
    await db.query('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE user_id = ?', [user.user_id]);
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.auth = { stage: user.mfa_enabled ? 'preauth' : 'mfa-setup', userId: user.user_id, roleCode: user.role_code, mfaAttempts: 0 };
    req.session.csrfToken = crypto.randomBytes(32).toString('base64url');
    req.session.cookie.maxAge = 10 * 60 * 1000;
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    await db.query('INSERT INTO audit_logs (user_id, action_code, entity_name, entity_id) VALUES (?, ?, ?, ?)', [user.user_id, 'PASSWORD_VERIFIED', 'users', user.user_id]);
    res.json({ ok: true, next: user.mfa_enabled ? '/mfa.html' : '/enroll-mfa.html' });
  } catch (error) { next(error); }
}

async function beginEnrollment(req, res, next) {
  try {
    if (req.session?.auth?.stage !== 'mfa-setup') return res.status(403).json({ error: 'Connexion par mot de passe requise.' });
    const userRows = await db.query('SELECT user_id, matricule AS badge, full_name, mfa_enabled FROM users WHERE user_id = ? AND is_active = TRUE LIMIT 1', [req.session.auth.userId]);
    const user = userRows[0];
    if (!user || user.mfa_enabled) return res.status(409).json({ error: 'La configuration MFA ne peut pas être démarrée.' });
    const secret = base32Encode(crypto.randomBytes(20));
    req.session.pendingTotpSecret = encryptSecret(secret).toString('base64');
    const label = encodeURIComponent(`Mat-Manage:${user.badge}`);
    const issuer = encodeURIComponent('Mat-Manage');
    const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    const qrDataUrl = await QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 2, width: 240 });
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    res.set('Cache-Control', 'no-store');
    res.json({ qrDataUrl, secret, account: user.badge, issuer: 'Mat-Manage' });
  } catch (error) { next(error); }
}

async function confirmEnrollment(req, res, next) {
  try {
    if (req.session?.auth?.stage !== 'mfa-setup' || !req.session.pendingTotpSecret) return res.status(403).json({ error: 'Démarrez d’abord la configuration du second facteur.' });
    const secret = decryptSecret(Buffer.from(req.session.pendingTotpSecret, 'base64'));
    const step = verifyTotp(secret, req.body?.code);
    if (step === null) return res.status(400).json({ error: 'Code invalide ou expiré.' });
    const userRows = await db.query('SELECT user_id, mfa_enabled FROM users WHERE user_id = ? AND is_active = TRUE LIMIT 1', [req.session.auth.userId]);
    const user = userRows[0];
    if (!user || user.mfa_enabled) return res.status(409).json({ error: 'Impossible de terminer l’enregistrement MFA.' });
    const codes = newRecoveryCodes();
    await db.transaction(async tx => {
      await tx.query('UPDATE users SET totp_secret_enc = ?, totp_last_step = ?, mfa_enabled = TRUE WHERE user_id = ?', [encryptSecret(secret), step, user.user_id]);
      for (const code of codes) await tx.query('INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES (?, ?)', [user.user_id, recoveryHash(code)]);
    });
    const fresh = (await db.query('SELECT user_id, full_name, email FROM users WHERE user_id = ?', [user.user_id]))[0];
    req.session.pendingTotpSecret = null;
    require('../mailer').sendSecurityNotice(fresh, 'Le second facteur TOTP a été activé sur votre compte.').catch(() => {});
    return finishAuthentication(req, res, fresh, { firstEnrollment: true, recoveryCodes: codes });
  } catch (error) { next(error); }
}

async function verifySecondFactor(req, res, next) {
  try {
    if (req.session?.auth?.stage !== 'preauth') return res.status(403).json({ error: 'Vérifiez d’abord votre mot de passe.' });
    const userId = req.session.auth.userId;
    const code = String(req.body?.code || '').trim();
    if (!/^\d{6}$/.test(code) && !/^[A-Fa-f0-9-]{24,40}$/.test(code)) return res.status(400).json({ error: 'Format de code invalide.' });
    const rows = await db.query('SELECT user_id, full_name, email, totp_secret_enc, totp_last_step, mfa_enabled FROM users WHERE user_id = ? AND is_active = TRUE LIMIT 1', [userId]);
    const user = rows[0];
    if (!user || !user.mfa_enabled || !user.totp_secret_enc) return res.status(403).json({ error: 'Second facteur indisponible.' });
    let step = null;
    if (/^\d{6}$/.test(code)) {
      step = verifyTotp(decryptSecret(user.totp_secret_enc), code);
      if (step === null || (user.totp_last_step !== null && step <= Number(user.totp_last_step))) step = null;
      if (step !== null) {
        const updated = await db.query('UPDATE users SET totp_last_step = ? WHERE user_id = ? AND (totp_last_step IS NULL OR totp_last_step < ?)', [step, userId, step]);
        if (!updated.affectedRows) step = null;
      }
    } else {
      const updated = await db.query('UPDATE mfa_recovery_codes SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND code_hash = ? AND used_at IS NULL', [userId, recoveryHash(code)]);
      if (updated.affectedRows) step = -1;
    }
    if (step === null) {
      req.session.auth.mfaAttempts = (req.session.auth.mfaAttempts || 0) + 1;
      if (req.session.auth.mfaAttempts >= 5) {
        await new Promise(resolve => req.session.destroy(() => resolve()));
        return res.status(429).json({ error: 'Trop de codes invalides. Recommencez la connexion.' });
      }
      await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
      return res.status(401).json({ error: 'Code invalide, déjà utilisé ou expiré.' });
    }
    if (step === -1) require('../mailer').sendSecurityNotice(user, 'Un code de récupération a été utilisé pour ouvrir une session.').catch(() => {});
    return finishAuthentication(req, res, user);
  } catch (error) { next(error); }
}

async function logout(req, res, next) {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie(process.env.NODE_ENV === 'production' ? '__Host-mat.sid' : 'mat.sid', { path: '/', sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    res.json({ ok: true });
  });
}

module.exports = { status, login, register, requestPasswordReset, resetPassword, beginEnrollment, confirmEnrollment, verifySecondFactor, logout, decryptSecret, verifyTotp };
