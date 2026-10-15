'use strict';
const mailer = require('../mailer');

async function submitReview(req, res) {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim();
  const comment = String(req.body?.comment || '').trim();
  const rating = Number(req.body?.rating);
  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'Saisissez un nom de 2 à 100 caractères.' });
  if (email && (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254)) return res.status(400).json({ error: 'Adresse e-mail invalide.' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Choisissez une note de 1 à 5.' });
  if (comment.length < 5 || comment.length > 1500) return res.status(400).json({ error: 'Votre avis doit contenir entre 5 et 1 500 caractères.' });
  if (!mailer.isSmtpConfigured()) return res.status(503).json({ error: 'L’envoi des avis est momentanément indisponible.' });
  try {
    await mailer.sendSiteFeedback({ name, email: email || null, rating, comment });
    res.json({ ok: true, message: 'Merci pour votre avis. Il a bien été envoyé à l’équipe Mat-Manage.' });
  } catch (error) {
    console.error('Échec de réception d’un avis Mat-Manage.', error.code || error.name);
    res.status(502).json({ error: 'Votre avis n’a pas pu être envoyé. Réessayez plus tard ou contactez-nous par e-mail.' });
  }
}

module.exports = { submitReview };
