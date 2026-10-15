'use strict';

function notFound(req, res) {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Ressource introuvable.' });
  res.status(404).sendFile(require('node:path').join(__dirname, '..', 'public', 'pages', '404.html'));
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = Number(error.statusCode || error.status || 500);
  if (status >= 500) console.error('Erreur interne', { name: error.name, message: error.message, path: req.path });
  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: status >= 500 ? 'Une erreur interne est survenue.' : error.message
  });
}

module.exports = { notFound, errorHandler };
