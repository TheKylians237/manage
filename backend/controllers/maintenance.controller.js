'use strict';

const db = require('../db');
const TYPES = new Set(['PREVENTIVE','REPAIR','DIAGNOSTIC','INSTALLATION','OTHER']);
const STATUSES = new Set(['PLANNED','IN_PROGRESS','COMPLETED','CANCELLED']);

async function list(req, res, next) {
  try {
    const conditions = [], params = [];
    if (STATUSES.has(req.query.status)) { conditions.push('ms.status = ?'); params.push(req.query.status); }
    if (req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) { conditions.push('ms.scheduled_at >= ?'); params.push(`${req.query.from} 00:00:00`); }
    if (req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) { conditions.push('ms.scheduled_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(req.query.to); }
    const q=String(req.query.q||'').trim().slice(0,100);if(q){conditions.push('(ms.maintenance_number LIKE ? OR m.designation LIKE ? OR tech.full_name LIKE ?)');params.push(...Array(3).fill(`%${q}%`))}
    const rows = await db.query(
      `SELECT ms.maintenance_id,ms.maintenance_number,ms.maintenance_type,ms.status,ms.scheduled_at,
              ms.duration_minutes,ms.problem_description,ms.actions_taken,m.material_code,m.designation,
              tech.full_name AS technician, reporter.full_name AS reported_by
         FROM maintenance_sessions ms JOIN materials m ON m.material_id=ms.material_id
         LEFT JOIN users tech ON tech.user_id=ms.technician_id LEFT JOIN users reporter ON reporter.user_id=ms.reported_by
         ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY ms.scheduled_at DESC LIMIT 300`, params
    );
    res.json({ maintenance: rows });
  } catch (error) { next(error); }
}

async function create(req, res, next) {
  try {
    const materialId = Number(req.body?.materialId), scheduledAt = new Date(req.body?.scheduledAt);
    const type = String(req.body?.type || ''), duration = req.body?.durationMinutes == null ? null : Number(req.body.durationMinutes);
    if (!Number.isSafeInteger(materialId) || Number.isNaN(scheduledAt.getTime()) || !TYPES.has(type) || (duration !== null && (!Number.isInteger(duration) || duration < 0))) return res.status(400).json({ error: 'Les informations de maintenance sont invalides.' });
    const result = await db.query(
      `INSERT INTO maintenance_sessions (maintenance_number,material_id,reported_by,technician_id,maintenance_type,status,scheduled_at,duration_minutes,problem_description)
       VALUES (?, ?, ?, ?, ?, 'PLANNED', ?, ?, ?)`,
      [`MAINT-${Date.now()}`, materialId, req.auth.userId, req.body?.technicianId || null, type, scheduledAt, duration, String(req.body?.problemDescription || '').slice(0, 5000) || null]
    );
    await db.query('UPDATE materials SET operational_status = \'IN_MAINTENANCE\' WHERE material_id = ?', [materialId]);
    res.status(201).json({ ok: true, maintenanceId: result.insertId });
  } catch (error) { next(error); }
}

async function updateStatus(req, res, next) {
  try {
    const id = Number(req.params.maintenanceId), status = String(req.body?.status || '');
    if (!Number.isSafeInteger(id) || !STATUSES.has(status)) return res.status(400).json({ error: 'Identifiant ou statut invalide.' });
    const result = await db.query('UPDATE maintenance_sessions SET status = ?, started_at = CASE WHEN ?=\'IN_PROGRESS\' AND started_at IS NULL THEN UTC_TIMESTAMP() ELSE started_at END, completed_at = CASE WHEN ?=\'COMPLETED\' THEN UTC_TIMESTAMP() ELSE completed_at END WHERE maintenance_id = ?', [status, status, status, id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Intervention introuvable.' });
    if (status === 'COMPLETED' || status === 'CANCELLED') {
      await db.query(`UPDATE materials m JOIN maintenance_sessions ms ON ms.material_id=m.material_id SET m.operational_status='AVAILABLE' WHERE ms.maintenance_id=? AND m.operational_status='IN_MAINTENANCE'`, [id]);
    }
    res.json({ ok: true });
  } catch (error) { next(error); }
}

async function listParts(req, res, next) {
  try {
    const id = Number(req.params.maintenanceId);
    if (!Number.isSafeInteger(id)) return res.status(400).json({ error: 'Intervention invalide.' });
    const rows = await db.query(
      `SELECT mp.maintenance_part_id, m.material_code, m.designation, ml.quantity,
              l.location_name, sm.movement_date, sm.movement_number, u.full_name AS issued_by
         FROM maintenance_parts mp
         JOIN stock_movement_lines ml ON ml.stock_movement_line_id = mp.stock_movement_line_id
         JOIN stock_movements sm ON sm.stock_movement_id = ml.stock_movement_id
         JOIN materials m ON m.material_id = ml.material_id
         JOIN locations l ON l.location_id = sm.source_location_id
         LEFT JOIN users u ON u.user_id = sm.performed_by
        WHERE mp.maintenance_id = ? ORDER BY sm.movement_date DESC`, [id]
    );
    res.json({ parts: rows });
  } catch (error) { next(error); }
}

async function consumePart(req, res, next) {
  try {
    const maintenanceId = Number(req.params.maintenanceId);
    const materialId = Number(req.body?.materialId);
    const locationId = Number(req.body?.locationId);
    const quantity = Number(req.body?.quantity);
    if (!Number.isSafeInteger(maintenanceId) || !Number.isSafeInteger(materialId) || !Number.isSafeInteger(locationId) || !Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Intervention, matériel, emplacement ou quantité invalide.' });
    }
    const movementId = await db.transaction(async tx => {
      const sessions = await tx.query('SELECT maintenance_id, maintenance_number, status FROM maintenance_sessions WHERE maintenance_id = ? FOR UPDATE', [maintenanceId]);
      const session = sessions[0];
      if (!session) { const error = new Error('Intervention introuvable.'); error.status = 404; throw error; }
      if (!['PLANNED', 'IN_PROGRESS'].includes(session.status)) { const error = new Error('Les pièces ne peuvent être consommées que sur une intervention ouverte.'); error.status = 409; throw error; }
      const locations = await tx.query('SELECT location_id FROM locations WHERE location_id = ? AND is_active = TRUE', [locationId]);
      const materials = await tx.query('SELECT material_id FROM materials WHERE material_id = ? AND is_active = TRUE', [materialId]);
      if (!locations.length || !materials.length) { const error = new Error('Matériel ou emplacement introuvable.'); error.status = 400; throw error; }
      const number = `MNT-${session.maintenance_number}-${Date.now()}`.slice(0, 50);
      const movement = await tx.query(
        `INSERT INTO stock_movements (movement_number, movement_type, source_location_id, performed_by, recipient_name, document_reference, notes)
         VALUES (?, 'OUT', ?, ?, ?, ?, ?)`,
        [number, locationId, req.auth.userId, 'Maintenance', session.maintenance_number, String(req.body?.notes || '').slice(0, 1000) || null]
      );
      const line = await tx.query('INSERT INTO stock_movement_lines (stock_movement_id, material_id, quantity) VALUES (?, ?, ?)', [movement.insertId, materialId, quantity]);
      await tx.query('INSERT INTO maintenance_parts (maintenance_id, stock_movement_line_id) VALUES (?, ?)', [maintenanceId, line.insertId]);
      await tx.query('INSERT INTO audit_logs (user_id, action_code, entity_name, entity_id, details) VALUES (?, ?, ?, ?, JSON_OBJECT(\'materialId\', ?, \'quantity\', ?, \'locationId\', ?))', [req.auth.userId, 'MAINTENANCE_PART_CONSUMED', 'maintenance_sessions', maintenanceId, materialId, quantity, locationId]);
      return movement.insertId;
    });
    res.status(201).json({ ok: true, stockMovementId: movementId });
  } catch (error) {
    if (error.sqlState === '45000') return res.status(409).json({ error: 'Stock insuffisant à cet emplacement.' });
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
}

module.exports = { list, create, updateStatus, listParts, consumePart };
