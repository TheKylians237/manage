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

async function notifications(req,res,next){try{const[rows,count]=await Promise.all([db.query(`SELECT notification_id,notification_type,title,message,entity_name,entity_id,created_at,read_at FROM app_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30`,[req.auth.userId]),db.query('SELECT COUNT(*) count FROM app_notifications WHERE user_id=? AND read_at IS NULL',[req.auth.userId])]);res.set('Cache-Control','no-store');res.json({notifications:rows,count:Number(count[0]?.count||0)})}catch(error){next(error)}}
async function markNotificationRead(req,res,next){try{const id=Number(req.params.notificationId);if(!Number.isSafeInteger(id))return res.status(400).json({error:'Notification invalide.'});await db.query('UPDATE app_notifications SET read_at=UTC_TIMESTAMP() WHERE notification_id=? AND user_id=?',[id,req.auth.userId]);res.json({ok:true})}catch(error){next(error)}}

module.exports = { get, update, notifications, markNotificationRead };
