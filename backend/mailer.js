'use strict';

const nodemailer = require('nodemailer');

let transport = null;
function getTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    throw new Error('La configuration SMTP est requise pour l’envoi de courriels.');
  }
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      tls: { minVersion: 'TLSv1.2' }
    });
  }
  return transport;
}

async function sendMail({ to, subject, text, html }) {
  if (!to) throw new TypeError('Destinataire manquant.');
  return getTransport().sendMail({ from: process.env.MAIL_FROM, to, subject, text, html });
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { sendMail, sendSecurityNotice, sendPasswordReset };
