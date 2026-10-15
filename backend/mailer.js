'use strict';

const nodemailer = require('nodemailer');

let transport = null;
function smtpConfig() {
  return {
    host: process.env.SMTP_HOST || process.env.MAIL_HOST,
    port: Number(process.env.SMTP_PORT || process.env.MAIL_PORT || 587),
    user: process.env.SMTP_USER || process.env.MAIL_USER,
    password: process.env.SMTP_PASSWORD || process.env.MAIL_PASS,
    from: process.env.MAIL_FROM || process.env.SMTP_USER || process.env.MAIL_USER
  };
}

function isSmtpConfigured() {
  const config = smtpConfig();
  return Boolean(config.host && config.user && config.password);
}

function getTransport() {
  const config = smtpConfig();
  if (!config.host || !config.user || !config.password) {
    throw new Error('La configuration SMTP est requise pour l’envoi de courriels.');
  }
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      auth: { user: config.user, pass: config.password },
      tls: { minVersion: 'TLSv1.2' }
    });
  }
  return transport;
}

async function sendMail({ to, subject, text, html, replyTo }) {
  if (!to) throw new TypeError('Destinataire manquant.');
  return getTransport().sendMail({ from: smtpConfig().from, to, subject, text, html, ...(replyTo ? { replyTo } : {}) });
}

async function sendSecurityNotice(user, message) {
  if (!user.email) return;
  return sendMail({
    to: user.email,
    subject: 'Alerte de sécurité Mat-Manage',
    text: `Bonjour ${user.full_name},\n\n${message}\n\nSi vous n’êtes pas à l’origine de cette action, contactez l’administrateur.`,
    html: `<p>Bonjour ${escapeHtml(user.full_name)},</p><p>${escapeHtml(message)}</p><p>Si vous n’êtes pas à l’origine de cette action, contactez l’administrateur.</p>`
  });
}

async function sendPasswordReset(user, resetUrl) {
  if (!user.email) return;
  return sendMail({
    to: user.email,
    subject: 'Réinitialisation de votre mot de passe Mat-Manage',
    text: `Bonjour ${user.full_name},\n\nUtilisez ce lien pour choisir un nouveau mot de passe (valable 30 minutes) :\n${resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
    html: `<p>Bonjour ${escapeHtml(user.full_name)},</p><p>Utilisez ce lien pour choisir un nouveau mot de passe (valable 30 minutes) :</p><p><a href="${escapeHtml(resetUrl)}">Réinitialiser mon mot de passe</a></p><p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>`
  });
}

async function sendMaintenanceReminder(maintenance, technician) {
  if (!technician.email) throw new TypeError('Le maintenancier affecté ne possède pas d’adresse e-mail.');
  const scheduledAt = new Date(maintenance.scheduled_at);
  const formattedDate = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'full', timeStyle: 'short', timeZone: process.env.APP_TIMEZONE || 'Africa/Douala'
  }).format(scheduledAt);
  const subject = `Rappel de maintenance dans 5 minutes · ${maintenance.maintenance_number}`;
  const text = `Bonjour ${technician.full_name},\n\nL’intervention ${maintenance.maintenance_number} commence dans environ 5 minutes.\nMatériel : ${maintenance.material_code} · ${maintenance.designation}\nHeure prévue : ${formattedDate}\n\nConnectez-vous à Mat-Manage pour consulter l’intervention.`;
  const html = `<p>Bonjour ${escapeHtml(technician.full_name)},</p><p>L’intervention <b>${escapeHtml(maintenance.maintenance_number)}</b> commence dans environ 5 minutes.</p><p><b>Matériel :</b> ${escapeHtml(maintenance.material_code)} · ${escapeHtml(maintenance.designation)}<br><b>Heure prévue :</b> ${escapeHtml(formattedDate)}</p><p>Connectez-vous à Mat-Manage pour consulter l’intervention.</p>`;
  return sendMail({ to: technician.email, subject, text, html });
}

async function sendNewAccountCredentials(user, matricule, password) {
  if (!user.email) throw new TypeError('Destinataire manquant.');
  const subject = 'Vos identifiants Mat-Manage';
  const text = `Bonjour ${user.full_name},\n\nVotre compte Mat-Manage a été créé.\nIdentifiant (matricule) : ${matricule}\nMot de passe initial : ${password}\n\nÀ votre première connexion, l’application vous demandera de configurer une application d’authentification TOTP. Conservez ce message en lieu sûr et changez votre mot de passe après connexion.`;
  const html = `<p>Bonjour ${escapeHtml(user.full_name)},</p><p>Votre compte Mat-Manage a été créé.</p><ul><li><b>Identifiant (matricule) :</b> ${escapeHtml(matricule)}</li><li><b>Mot de passe initial :</b> ${escapeHtml(password)}</li></ul><p>À votre première connexion, configurez une application d’authentification TOTP. Conservez ce message en lieu sûr et changez votre mot de passe après connexion.</p>`;
  return sendMail({ to: user.email, subject, text, html });
}

async function sendSiteFeedback({ name, email, rating, comment }) {
  const to = process.env.SITE_CONTACT_EMAIL || 'ibihiang@gmail.com';
  const subject = `Avis Mat-Manage · ${rating}/5`;
  const text = `Nom : ${name}\nNote : ${rating}/5\n${email ? `E-mail : ${email}\n` : ''}\n${comment}`;
  const html = `<p><b>Nom :</b> ${escapeHtml(name)}</p><p><b>Note :</b> ${rating}/5</p>${email ? `<p><b>E-mail :</b> ${escapeHtml(email)}</p>` : ''}<p>${escapeHtml(comment).replace(/\n/g, '<br>')}</p>`;
  return sendMail({ to, subject, text, html, replyTo: email || undefined });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { sendMail, sendSecurityNotice, sendPasswordReset, sendMaintenanceReminder, sendNewAccountCredentials, sendSiteFeedback, isSmtpConfigured };
