'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const MySQLSessionStore = require('./session-store');
const { startMaintenanceReminderScheduler } = require('./services/maintenance-reminder-scheduler');
const { csrfProtection, requireAuth } = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/errors');
const { router: apiRouter } = require('./routes');

// DB_PASSWORD est optionnel pour autoriser les chaînes vides en local
const required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'SESSION_SECRET', 'MFA_ENCRYPTION_KEY', 'APP_ORIGIN'];
const missing = required.filter(k => process.env[k] === undefined || process.env[k] === '' || process.env[k].startsWith('replace-with-'));

if (missing.length) throw new Error(`Variables obligatoires manquantes dans .env: ${missing.join(', ')}`);
const mfaKey = process.env.MFA_ENCRYPTION_KEY;
if (!/^(?:[A-Za-z0-9+/]{4}){10}[A-Za-z0-9+/]{3}=$/.test(mfaKey) || Buffer.from(mfaKey, 'base64').length !== 32 || Buffer.from(mfaKey, 'base64').toString('base64') !== mfaKey) throw new Error('MFA_ENCRYPTION_KEY doit être un base64 canonique de 32 octets.');
if ((process.env.SESSION_SECRET || '').length < 32) throw new Error('SESSION_SECRET doit contenir au moins 32 caractères.');

const app = express();
const production = process.env.NODE_ENV === 'production';
const publicDir = path.join(__dirname, 'public');
const cookieName = production ? '__Host-mat.sid' : 'mat.sid';

app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"],
      frameAncestors: ["'none'"], formAction: ["'self'"],
      scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"], upgradeInsecureRequests: production ? [] : null
    }
  },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginResourcePolicy: { policy: 'same-origin' }
}));

app.use(express.json({ limit: '1mb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

app.use(session({
  name: cookieName,
  secret: process.env.SESSION_SECRET,
  store: new MySQLSessionStore(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: production,
    sameSite: 'strict',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' } });
const mfaLimiter = rateLimit({ windowMs: 5 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Trop de tentatives de code. Recommencez plus tard.' } });

app.use('/api', csrfProtection);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', loginLimiter);
app.use('/api/auth/password-reset/request', loginLimiter);
app.use(['/api/auth/mfa/verify', '/api/auth/mfa/confirm'], mfaLimiter);

app.use('/css', express.static(path.join(publicDir, 'css'), { maxAge: production ? '1d' : 0, etag: true }));
app.use('/js', express.static(path.join(publicDir, 'js'), { maxAge: production ? '1d' : 0, etag: true }));
app.use('/image/avatars', requireAuth, express.static(path.join(publicDir, 'image', 'avatars'), { maxAge: production ? '7d' : 0, immutable: production, dotfiles: 'deny', fallthrough: false }));
app.use('/api', apiRouter);

function sendPage(filename) { return (req, res) => res.sendFile(path.join(publicDir, 'pages', filename)); }
function requirePreAuth(stage) {
  return (req, res, next) => req.session?.auth?.stage === stage ? next() : res.redirect('/login.html');
}

app.get('/', (req, res) => {
  if (req.session?.auth?.stage === 'authenticated') return res.redirect(`/dashboard-${String(req.session.auth.roleCode).toLowerCase()}.html`);
  if (req.session?.auth?.stage === 'preauth') return res.redirect('/mfa.html');
  if (req.session?.auth?.stage === 'mfa-setup') return res.redirect('/enroll-mfa.html');
  res.redirect('/login.html');
});

app.get('/login.html', sendPage('login.html'));
app.get('/register.html', sendPage('register.html'));
app.get('/forgot-password.html', sendPage('forgot-password.html'));
app.get('/reset-password.html', sendPage('reset-password.html'));
app.get('/mfa.html', requirePreAuth('preauth'), sendPage('mfa.html'));
app.get('/enroll-mfa.html', requirePreAuth('mfa-setup'), sendPage('enroll-mfa.html'));
app.get('/profile.html', requireAuth, sendPage('profile.html'));

const rolePages = {
  ADMIN: 'dashboard-admin.html', SUPERVISOR: 'dashboard-supervisor.html',
  STOREKEEPER: 'dashboard-storekeeper.html', MAINTAINER: 'dashboard-maintainer.html'
};

for (const [role, filename] of Object.entries(rolePages)) {
  app.get(`/${filename}`, requireAuth, (req, res) => {
    if (req.auth.roleCode !== role) return res.redirect(`/${rolePages[req.auth.roleCode] || 'login.html'}`);
    res.sendFile(path.join(publicDir, 'pages', filename));
  });
}

const modulePages = {
  '/materials.html': ['ADMIN','STOREKEEPER','MAINTAINER'],
  '/movements.html': ['ADMIN','STOREKEEPER','MAINTAINER'],
  '/allocations.html': ['ADMIN','STOREKEEPER'],
  '/maintenance.html': ['ADMIN','MAINTAINER'],
  '/users.html': ['ADMIN'],
  '/reports.html': ['ADMIN'],
  '/supervision.html': ['ADMIN','SUPERVISOR'],
  '/audit-logs.html': ['ADMIN']
};

for (const [url, allowedRoles] of Object.entries(modulePages)) {
  const filename = url.slice(1);
  app.get(url, requireAuth, (req, res) => {
    if (!allowedRoles.includes(req.auth.roleCode)) return res.status(404).sendFile(path.join(publicDir, 'pages', '404.html'));
    res.sendFile(path.join(publicDir, 'pages', filename));
  });
}

app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT || 3000);
const sessionCleanup = setInterval(() => {
  db.query('DELETE FROM http_sessions WHERE expires_at <= ?', [Date.now()]).catch(() => {});
}, 60 * 60 * 1000);
sessionCleanup.unref();

db.healthcheck().then(async () => {
  try {
    await db.query('SELECT session_id FROM http_sessions LIMIT 0');
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      throw new Error('Schéma incomplet : exécutez backend/database/security-migration.sql sur la base configurée avant de démarrer.');
    }
    throw error;
  }
  try {
    await db.query('SELECT reminder_email_sent_at, reminder_email_claimed_at FROM maintenance_sessions LIMIT 0');
  } catch (error) {
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      throw new Error('Schéma incomplet : exécutez backend/database/maintenance-reminders.sql avant de démarrer.');
    }
    throw error;
  }
  try {
    await db.query('SELECT diagnosis, comments, conclusion, executed_by, stock_source_location_id FROM maintenance_sessions LIMIT 0');
    await db.query('SELECT department_name FROM users LIMIT 0');
    await db.query('SELECT owner_user_id FROM locations LIMIT 0');
    await db.query('SELECT notification_id FROM app_notifications LIMIT 0');
    await db.query('SELECT review_id FROM employee_daily_reviews LIMIT 0');
    await db.query("SELECT role_id FROM roles WHERE role_code='SUPERVISOR' LIMIT 0");
  } catch (error) {
    if (['ER_BAD_FIELD_ERROR','ER_NO_SUCH_TABLE'].includes(error.code)) throw new Error('Schéma incomplet : exécutez backend/database/maintenance-execution.sql et backend/database/supervision-stock.sql avant de démarrer.');
    throw error;
  }
  startMaintenanceReminderScheduler();
  app.listen(port, () => console.log(`Mat-Manage écoute sur ${process.env.APP_ORIGIN}`));
}).catch(error => {
  console.error(error.message.startsWith('Schéma incomplet') ? error.message : 'Impossible de joindre MySQL ou de vérifier son schéma. Vérifiez la base, les migrations et le fichier .env.', error.code || error.name);
  process.exitCode = 1;
});

module.exports = app;
