'use strict';

const net = require('node:net');

function ipv4Number(value) {
  const normalized = String(value || '').replace(/^::ffff:/i, '');
  if (!net.isIPv4(normalized)) return null;
  return normalized.split('.').reduce((number, octet) => ((number << 8) | Number(octet)) >>> 0, 0);
}

function parseCidrs(value = '') {
  return String(value).split(',').map(item => item.trim()).filter(Boolean).map(item => {
    const parts = item.split('/');
    if (parts.length > 2) throw new Error(`TRUSTED_CLIENT_CIDRS invalide : ${item}.`);
    const [address, prefixText] = parts;
    const ip = ipv4Number(address);
    const prefix = prefixText === undefined ? 32 : Number(prefixText);
    if (ip === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
      throw new Error(`TRUSTED_CLIENT_CIDRS invalide : ${item}. Utilisez une adresse IPv4 ou un CIDR IPv4, par exemple 192.168.1.0/24.`);
    }
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return { network: (ip & mask) >>> 0, mask };
  });
}

const allowedCidrs = parseCidrs(process.env.TRUSTED_CLIENT_CIDRS || '');

function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/i, '');
}

function isAllowedIp(ip) {
  if (!allowedCidrs.length) return true;
  if (ip === '127.0.0.1' || ip === '::1') return true;
  const value = ipv4Number(ip);
  return value !== null && allowedCidrs.some(({ network, mask }) => ((value & mask) >>> 0) === network);
}

function networkAccess(req, res, next) {
  if (isAllowedIp(clientIp(req))) return next();
  return res.status(403).json({ error: 'Accès refusé depuis ce réseau. Contactez l’administrateur pour autoriser votre sous-réseau.' });
}

function confirmLoginIp(req, res, next) {
  const observed = clientIp(req);
  if (!isAllowedIp(observed)) return networkAccess(req, res, next);
  const confirmed = String(req.body?.clientIp || '').trim().replace(/^::ffff:/i, '');
  if (!confirmed || confirmed !== observed) return res.status(400).json({ error: 'Confirmez l’adresse IP détectée par le serveur avant de vous connecter.' });
  next();
}

function describeClientIp(req, res) {
  res.set('Cache-Control', 'no-store');
  return res.json({ clientIp: clientIp(req), allowed: isAllowedIp(clientIp(req)), restricted: allowedCidrs.length > 0 });
}

module.exports = { clientIp, isAllowedIp, networkAccess, confirmLoginIp, describeClientIp };
