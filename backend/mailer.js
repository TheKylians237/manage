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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { sendMail, sendSecurityNotice, sendPasswordReset, sendMaintenanceReminder };
