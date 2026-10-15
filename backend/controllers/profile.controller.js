'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const argon2 = require('argon2');
const sharp = require('sharp');
const db = require('../db');
const { sendSecurityNotice } = require('../mailer');
const { decryptSecret, verifyTotp } = require('./auth.controller');

const avatarDir = path.join(__dirname, '..', 'public', 'image', 'avatars');

async function getProfile(req, res, next) {
  try {
    const rows = await db.query(
      `SELECT u.user_id, u.matricule, u.full_name, u.email, u.phone, u.avatar_url,
              u.mfa_enabled, u.created_at, r.role_code, r.role_name,
              (SELECT COUNT(*) FROM mfa_recovery_codes c WHERE c.user_id = u.user_id AND c.used_at IS NULL) AS recovery_codes_remaining
         FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = ?`, [req.auth.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Profil introuvable.' });
    res.set('Cache-Control', 'no-store');
    res.json({ profile: rows[0] });
  } catch (error) { next(error); }
}

async function history(req,res,next){try{const rows=await db.query(`SELECT audit_log_id,action_code,entity_name,entity_id,occurred_at,details FROM audit_logs WHERE user_id=? ORDER BY occurred_at DESC LIMIT 500`,[req.auth.userId]);const notifications=await db.query(`SELECT notification_id,notification_type,title,message,entity_name,entity_id,created_at,read_at FROM app_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100`,[req.auth.userId]);res.set('Cache-Control','no-store');res.json({history:rows,notifications})}catch(error){next(error)}}

function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254; }

async function updateProfile(req, res, next) {
  try {
    const fullName = String(req.body?.fullName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    if (fullName.length < 2 || fullName.length > 150 || !validEmail(email) || phone.length > 30) {
      return res.status(400).json({ error: 'Nom, adresse e-mail ou téléphone invalide.' });
    }
    const user = (await db.query('SELECT user_id, full_name, email, password_hash, totp_secret_enc, totp_last_step FROM users WHERE user_id = ?', [req.auth.userId]))[0];
    if (!user) return res.status(404).json({ error: 'Profil introuvable.' });
    if (email !== user.email) {
      const authorized = await verifyPasswordAndTotp(user, req.body?.currentPassword, req.body?.totpCode);
      if (!authorized) return res.status(401).json({ error: 'Confirmez le changement d’adresse avec votre mot de passe et votre code TOTP.' });
    }
    await db.query('UPDATE users SET full_name = ?, email = ?, phone = ? WHERE user_id = ?', [fullName, email, phone || null, req.auth.userId]);
    if (email !== user.email) sendSecurityNotice({ full_name: user.full_name, email: user.email }, 'L’adresse e-mail du compte Mat-Manage a été modifiée.').catch(() => {});
    res.json({ ok: true, message: 'Profil mis à jour.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Cette adresse e-mail est déjà associée à un compte.' });
    next(error);
  }
}

async function uploadAvatar(req, res, next) {
  let destination;
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'Sélectionnez une image.' });
    const image = sharp(req.file.buffer, { limitInputPixels: 20_000_000, failOn: 'error' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp', 'avif'].includes(metadata.format) || !metadata.width || !metadata.height) {
      return res.status(415).json({ error: 'Format d’image non accepté. Utilisez JPG, PNG, WebP ou AVIF.' });
    }
    if (metadata.width > 6000 || metadata.height > 6000) return res.status(413).json({ error: 'L’image est trop grande en dimensions.' });
    await fs.mkdir(avatarDir, { recursive: true });
    const filename = `${crypto.randomUUID()}.webp`;
    destination = path.join(avatarDir, filename);
    await image.rotate().resize(512, 512, { fit: 'cover', position: 'attention' }).webp({ quality: 84 }).toFile(destination);
    const avatarUrl = `/image/avatars/${filename}`;
    const old = (await db.query('SELECT avatar_url FROM users WHERE user_id = ?', [req.auth.userId]))[0]?.avatar_url;
    await db.query('UPDATE users SET avatar_url = ? WHERE user_id = ?', [avatarUrl, req.auth.userId]);
    if (old && old.startsWith('/image/avatars/')) {
      const oldFile = path.join(avatarDir, path.basename(old));
      if (oldFile !== destination) fs.unlink(oldFile).catch(() => {});
    }
    res.json({ ok: true, avatarUrl });
  } catch (error) {
    if (destination) fs.unlink(destination).catch(() => {});
    next(error);
  }
}

async function changePassword(req, res, next) {
  try {
    const current = String(req.body?.currentPassword || '');
    const nextPassword = String(req.body?.newPassword || '');
    const user = (await db.query('SELECT user_id, password_hash, totp_secret_enc, totp_last_step FROM users WHERE user_id = ?', [req.auth.userId]))[0];
    if (!await argon2.verify(user.password_hash, current)) return res.status(401).json({ error: 'Mot de passe actuel invalide.' });
    if (!passwordPolicy(nextPassword)) return res.status(400).json({ error: 'Utilisez au moins 12 caractères avec majuscule, minuscule, chiffre et caractère spécial.' });
    if (await argon2.verify(user.password_hash, nextPassword)) return res.status(400).json({ error: 'Choisissez un nouveau mot de passe différent.' });
    if (!await verifyTotpOnce(user, req.body?.totpCode)) return res.status(401).json({ error: 'Code TOTP invalide ou déjà utilisé.' });
    const hash = await argon2.hash(nextPassword, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    await db.query('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE user_id = ?', [hash, req.auth.userId]);
    const emailUser = (await db.query('SELECT full_name,email FROM users WHERE user_id = ?', [req.auth.userId]))[0];
    sendSecurityNotice(emailUser, 'Le mot de passe de votre compte Mat-Manage a été changé. Toutes les autres sessions ont été révoquées.').catch(() => {});
    req.session.destroy(() => {});
    res.clearCookie(process.env.NODE_ENV === 'production' ? '__Host-mat.sid' : 'mat.sid', { path: '/', sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    res.json({ ok: true, redirect: '/login.html', message: 'Mot de passe modifié. Reconnectez-vous.' });
  } catch (error) { next(error); }
}

function passwordPolicy(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 256 &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

async function verifyPasswordAndTotp(user, password, code) {
  if (!password || !await argon2.verify(user.password_hash, String(password))) return false;
  return verifyTotpOnce(user, code);
}

async function verifyTotpOnce(user, code) {
  if (!user.totp_secret_enc || !/^\d{6}$/.test(String(code || ''))) return false;
  const secret = decryptSecret(user.totp_secret_enc);
  const step = verifyTotp(secret, String(code));
  if (step === null || (user.totp_last_step !== null && step <= Number(user.totp_last_step))) return false;
  const result = await db.query('UPDATE users SET totp_last_step = ? WHERE user_id = ? AND (totp_last_step IS NULL OR totp_last_step < ?)', [step, user.user_id, step]);
  return Boolean(result.affectedRows);
}

module.exports = { getProfile, updateProfile, uploadAvatar, changePassword, passwordPolicy };
