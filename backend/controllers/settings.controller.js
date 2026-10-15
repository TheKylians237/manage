'use strict';

const db = require('../db');

async function get(req, res, next) {
  try {
    const rows = await db.query('SELECT setting_key, setting_value FROM app_settings ORDER BY setting_key');
    res.json({ settings: Object.fromEntries(rows.map(row => [row.setting_key, row.setting_value])) });
  } catch (error) { next(error); }
}

async function update(req, res, next) {
  try {
    const enabled = req.body?.accountCreationEnabled;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'Valeur de paramètre invalide.' });
    await db.query("INSERT INTO app_settings (setting_key, setting_value) VALUES ('account_creation_enabled', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)", [enabled ? '1' : '0']);
    res.json({ ok: true, accountCreationEnabled: enabled });
  } catch (error) { next(error); }
}

async function notifications(req, res, next) {
  try {
    const rows = await db.query(
      `SELECT COUNT(*) AS count FROM maintenance_sessions
        WHERE status IN ('PLANNED', 'IN_PROGRESS')
          AND (technician_id IS NULL OR technician_id = ?)
          AND scheduled_at <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY)`,
      [req.auth.userId]
    );
    res.set('Cache-Control', 'no-store');
    res.json({ count: Number(rows[0]?.count || 0) });
  } catch (error) { next(error); }
}

module.exports = { get, update, notifications };
