'use strict';

const db = require('../db');
const TYPES = new Set(['PREVENTIVE','REPAIR','DIAGNOSTIC','INSTALLATION','OTHER']);
const STATUSES = new Set(['PLANNED','IN_PROGRESS','COMPLETED','CANCELLED']);

async function transferToMaintainer(tx, materialId, technicianId, actorId, reference) {
  const existing=await tx.query('SELECT sb.location_id FROM stock_balances sb JOIN locations l ON l.location_id=sb.location_id WHERE sb.material_id=? AND sb.quantity>=1 AND l.owner_user_id=? LIMIT 1 FOR UPDATE',[materialId,technicianId]);
  if(existing.length){const prior=await tx.query('SELECT stock_source_location_id FROM maintenance_sessions WHERE material_id=? AND technician_id=? AND stock_source_location_id IS NOT NULL ORDER BY maintenance_id DESC LIMIT 1',[materialId,technicianId]);return prior[0]?.stock_source_location_id||null}
  const sources = await tx.query(
    `SELECT sb.location_id FROM stock_balances sb JOIN locations l ON l.location_id=sb.location_id
      WHERE sb.material_id=? AND sb.quantity>=1 AND l.owner_user_id IS NULL AND l.is_active=TRUE
      ORDER BY sb.location_id LIMIT 1 FOR UPDATE`, [materialId]
  );
  if (!sources.length) { const error = new Error('Aucune unité disponible dans le stock du magasinier pour cette maintenance.'); error.status = 409; throw error; }
  await tx.query(`INSERT INTO locations(owner_user_id,location_code,location_name,description,is_active)
      VALUES(?, ?, ?, 'Stock privé du maintenancier', TRUE)
      ON DUPLICATE KEY UPDATE location_id=LAST_INSERT_ID(location_id), is_active=TRUE`,
    [technicianId, `TECH-${technicianId}`, `Stock de ${technicianId}`]);
  const destination = await tx.query('SELECT location_id FROM locations WHERE owner_user_id=? LIMIT 1', [technicianId]);
  const destinationId = destination[0].location_id, sourceId = sources[0].location_id;
  const movement = await tx.query(`INSERT INTO stock_movements(movement_number,movement_type,source_location_id,destination_location_id,performed_by,recipient_name,document_reference,notes)
    VALUES(?, 'TRANSFER', ?, ?, ?, ?, ?, ?)`,
    [`MNT-${reference}-${Date.now()}`.slice(0,50), sourceId, destinationId, actorId, `Maintenancier ${technicianId}`, reference, 'Transfert automatique au démarrage / à la planification de la maintenance']);
  await tx.query('INSERT INTO stock_movement_lines(stock_movement_id,material_id,quantity) VALUES(?,?,1)', [movement.insertId, materialId]);
  return sourceId;
}

async function returnToStore(tx, session, actorId, notify = true) {
  if (!session.stock_source_location_id) return false;
  const locations = await tx.query('SELECT location_id FROM locations WHERE owner_user_id=? AND is_active=TRUE LIMIT 1', [session.technician_id]);
  if (!locations.length) return false;
  const movement = await tx.query(`INSERT INTO stock_movements(movement_number,movement_type,source_location_id,destination_location_id,performed_by,recipient_name,document_reference,notes)
    VALUES(?, 'TRANSFER', ?, ?, ?, 'Magasinier', ?, 'Retour automatique au stock magasin après conclusion fonctionnelle')`,
    [`RET-${session.maintenance_number}-${Date.now()}`.slice(0,50), locations[0].location_id, session.stock_source_location_id, actorId, session.maintenance_number]);
  await tx.query('INSERT INTO stock_movement_lines(stock_movement_id,material_id,quantity) VALUES(?,?,1)', [movement.insertId, session.material_id]);
  if (notify) {
    const storekeepers = await tx.query(`SELECT u.user_id FROM users u JOIN roles r ON r.role_id=u.role_id WHERE r.role_code='STOREKEEPER' AND u.is_active=TRUE`);
    for (const storekeeper of storekeepers) await tx.query(`INSERT INTO app_notifications(user_id,notification_type,title,message,entity_name,entity_id)
      VALUES(?,'MAINTENANCE_RETURN','Matériel à récupérer',?,'maintenance_sessions',?)`,
      [storekeeper.user_id, `${session.material_code} · ${session.designation} est fonctionnel et a été replacé dans son emplacement magasin d’origine (${session.source_location_name}).`, session.maintenance_id]);
  }
  return true;
}


async function technicians(req, res, next) {
  try {
    const rows = await db.query(
      `SELECT u.user_id, u.matricule, u.full_name
         FROM users u JOIN roles r ON r.role_id = u.role_id
        WHERE r.role_code = 'MAINTAINER' AND u.is_active = TRUE
          AND u.email IS NOT NULL AND u.email <> ''
        ORDER BY u.full_name`
    );
    res.json({ technicians: rows });
  } catch (error) { next(error); }
}

async function availableMaterials(req,res,next){try{const own=req.auth.roleCode==='MAINTAINER';const rows=await db.query(`SELECT m.material_id,m.material_code,m.designation,COALESCE(SUM(sb.quantity),0) total_quantity FROM materials m JOIN stock_balances sb ON sb.material_id=m.material_id JOIN locations l ON l.location_id=sb.location_id WHERE m.is_active=TRUE AND m.merged_into_material_id IS NULL ${own?'AND (l.owner_user_id IS NULL OR l.owner_user_id=?)':''} GROUP BY m.material_id,m.material_code,m.designation HAVING SUM(sb.quantity)>=1 ORDER BY m.designation`,own?[req.auth.userId]:[]);res.json({materials:rows})}catch(error){next(error)}}

async function list(req, res, next) {
  try {
    const conditions = [], params = [];
    if(req.auth.roleCode==='MAINTAINER'){conditions.push('ms.technician_id=?');params.push(req.auth.userId)}
    if (STATUSES.has(req.query.status)) { conditions.push('ms.status = ?'); params.push(req.query.status); }
    if (req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) { conditions.push('ms.scheduled_at >= ?'); params.push(`${req.query.from} 00:00:00`); }
    if (req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) { conditions.push('ms.scheduled_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(req.query.to); }
    const q=String(req.query.q||'').trim().slice(0,100);if(q){conditions.push('(ms.maintenance_number LIKE ? OR m.designation LIKE ? OR tech.full_name LIKE ?)');params.push(...Array(3).fill(`%${q}%`))}
    const rows = await db.query(
      `SELECT ms.maintenance_id,ms.maintenance_number,ms.maintenance_type,ms.status,ms.scheduled_at,ms.started_at,ms.completed_at,
              ms.duration_minutes,ms.problem_description,ms.diagnosis,ms.actions_taken,ms.comments,ms.conclusion,
              m.material_code,m.designation,tech.user_id AS technician_id,tech.matricule AS technician_matricule,
              tech.full_name AS technician,tech.department_name AS technician_department,
              executor.matricule AS executed_by_matricule,executor.full_name AS executed_by_name,
              reporter.full_name AS reported_by
         FROM maintenance_sessions ms JOIN materials m ON m.material_id=ms.material_id
         LEFT JOIN users tech ON tech.user_id=ms.technician_id LEFT JOIN users executor ON executor.user_id=ms.executed_by
         LEFT JOIN users reporter ON reporter.user_id=ms.reported_by
         ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY ms.scheduled_at DESC LIMIT 300`, params
    );
    res.json({ maintenance: rows });
  } catch (error) { next(error); }
}

async function upcomingReminders(req, res, next) {
  try {
    const rows = await db.query(
      `SELECT ms.maintenance_id, ms.maintenance_number, ms.scheduled_at,
              m.designation, m.material_code
         FROM maintenance_sessions ms
         JOIN materials m ON m.material_id = ms.material_id
        WHERE ms.technician_id = ? AND ms.status = 'PLANNED'
          AND ms.scheduled_at > UTC_TIMESTAMP()
          AND ms.scheduled_at <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE)
        ORDER BY ms.scheduled_at LIMIT 20`,
      [req.auth.userId]
    );
    res.set('Cache-Control', 'no-store');
    res.json({ reminders: rows.map(row => ({ ...row, scheduled_at: new Date(row.scheduled_at).toISOString() })) });
  } catch (error) { next(error); }
}

async function create(req, res, next) {
  try {
    const materialId = Number(req.body?.materialId), mode = String(req.body?.mode || 'PLANNED');
    const immediate = mode === 'IMMEDIATE';
    const scheduledAt = immediate ? null : new Date(req.body?.scheduledAt);
    const type = String(req.body?.type || ''), duration = req.body?.durationMinutes == null ? null : Number(req.body.durationMinutes);
    if (!['PLANNED','IMMEDIATE'].includes(mode) || !Number.isSafeInteger(materialId) || (!immediate && (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now())) || !TYPES.has(type) || (duration !== null && (!Number.isInteger(duration) || duration < 0))) return res.status(400).json({ error: 'Les informations de maintenance sont invalides. Une intervention planifiée doit avoir une date future.' });
    const status = immediate ? 'IN_PROGRESS' : 'PLANNED';
    const requestedTechnicianId = req.auth.roleCode === 'MAINTAINER'
      ? Number(req.auth.userId)
      : (req.body?.technicianId ? Number(req.body.technicianId) : null);
    let technicianId = requestedTechnicianId;
    if (!technicianId) return res.status(400).json({ error: 'Choisissez un maintenancier pour le transfert de stock et le suivi de l’intervention.' });
    if (technicianId !== null) {
      if (!Number.isSafeInteger(technicianId)) return res.status(400).json({ error: 'Maintenancier invalide.' });
      const assigned = await db.query(
        `SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id
          WHERE u.user_id = ? AND r.role_code = 'MAINTAINER' AND u.is_active = TRUE
            AND u.email IS NOT NULL AND u.email <> '' LIMIT 1`,
        [technicianId]
      );
      if (!assigned.length) return res.status(400).json({ error: 'Le maintenancier doit être actif et avoir une adresse e-mail valide.' });
    }
    const maintenanceId = await db.transaction(async tx => {
      await tx.query('SELECT material_id FROM materials WHERE material_id=? FOR UPDATE',[materialId]);
      const openSessions=await tx.query("SELECT maintenance_id FROM maintenance_sessions WHERE material_id=? AND status IN ('PLANNED','IN_PROGRESS') LIMIT 1 FOR UPDATE",[materialId]);
      if(openSessions.length){const error=new Error('Ce matériel a déjà une maintenance planifiée ou en cours.');error.status=409;throw error}
      const maintenanceNumber = `MAINT-${Date.now()}`;
      const sourceLocationId = await transferToMaintainer(tx, materialId, technicianId, req.auth.userId, maintenanceNumber);
      const result = await tx.query(
        `INSERT INTO maintenance_sessions (maintenance_number,material_id,reported_by,technician_id,maintenance_type,status,scheduled_at,started_at,duration_minutes,problem_description,stock_source_location_id)
         VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, UTC_TIMESTAMP()), CASE WHEN ?='IN_PROGRESS' THEN UTC_TIMESTAMP() ELSE NULL END, ?, ?, ?)`,
        [maintenanceNumber, materialId, req.auth.userId, technicianId, type, status, scheduledAt, status, duration, String(req.body?.problemDescription || '').slice(0, 5000) || null, sourceLocationId]
      );
      await tx.query('UPDATE materials SET operational_status = \'IN_MAINTENANCE\' WHERE material_id = ?', [materialId]);
      await tx.query('INSERT INTO audit_logs(user_id,action_code,entity_name,entity_id,details) VALUES(?,?,?,?,JSON_OBJECT(\'technicianId\',?,\'materialId\',?,\'status\',?))', [req.auth.userId, 'MAINTENANCE_STOCK_ASSIGNED', 'maintenance_sessions', result.insertId, technicianId, materialId, status]);
      return result.insertId;
    });
    res.status(201).json({ ok: true, maintenanceId, status });
  } catch (error) { if(error.status)return res.status(error.status).json({error:error.message});next(error); }
}

async function updateStatus(req, res, next) {
  try {
    const id = Number(req.params.maintenanceId), status = String(req.body?.status || '');
    if (!Number.isSafeInteger(id) || !STATUSES.has(status)) return res.status(400).json({ error: 'Identifiant ou statut invalide.' });
    if (status === 'COMPLETED') {
      const diagnosis = String(req.body?.diagnosis || '').trim();
      const actionsTaken = String(req.body?.actionsTaken || '').trim();
      const comments = String(req.body?.comments || '').trim();
      const conclusion = String(req.body?.conclusion || '');
      if (diagnosis.length < 3 || diagnosis.length > 5000 || actionsTaken.length < 3 || actionsTaken.length > 5000 || comments.length > 5000 || !['FUNCTIONAL','DEFECTIVE'].includes(conclusion)) {
        return res.status(400).json({ error: 'Saisissez un diagnostic, les actions posées et une conclusion fonctionnel/défectueux. Les champs sont limités à 5 000 caractères.' });
      }
      const result = await db.transaction(async tx => {
        const sessions = await tx.query('SELECT ms.maintenance_id,ms.maintenance_number,ms.technician_id,ms.status,ms.material_id,ms.stock_source_location_id,m.material_code,m.designation,l.location_name AS source_location_name FROM maintenance_sessions ms JOIN materials m ON m.material_id=ms.material_id LEFT JOIN locations l ON l.location_id=ms.stock_source_location_id WHERE ms.maintenance_id = ? FOR UPDATE', [id]);
        const session = sessions[0];
        if (!session) return null;
        if (!['PLANNED','IN_PROGRESS'].includes(session.status)) { const error = new Error('Cette intervention est déjà clôturée.'); error.status = 409; throw error; }
        if (req.auth.roleCode === 'MAINTAINER' && Number(session.technician_id) !== Number(req.auth.userId)) { const error = new Error('Cette intervention est affectée à un autre maintenancier.'); error.status = 403; throw error; }
        await tx.query(`UPDATE maintenance_sessions SET status='COMPLETED',
          started_at=COALESCE(started_at,UTC_TIMESTAMP()),completed_at=UTC_TIMESTAMP(),
          diagnosis=?,actions_taken=?,comments=?,conclusion=?,executed_by=? WHERE maintenance_id=?`,
        [diagnosis, actionsTaken, comments || null, conclusion, req.auth.userId, id]);
        if (conclusion === 'FUNCTIONAL') await returnToStore(tx, session, req.auth.userId, true);
        await tx.query('UPDATE materials SET operational_status=? WHERE material_id=?', [conclusion === 'FUNCTIONAL' ? 'AVAILABLE' : 'DAMAGED', session.material_id]);
        await tx.query('INSERT INTO audit_logs(user_id,action_code,entity_name,entity_id,details) VALUES(?,?,?,?,JSON_OBJECT(\'conclusion\',?,\'technicianId\',?))', [req.auth.userId, conclusion === 'FUNCTIONAL' ? 'MAINTENANCE_RETURNED_TO_STORE' : 'MAINTENANCE_MARKED_DEFECTIVE', 'maintenance_sessions', id, conclusion, session.technician_id]);
        return session;
      });
      if (!result) return res.status(404).json({ error: 'Intervention introuvable.' });
      await db.query('INSERT INTO audit_logs (user_id,action_code,entity_name,entity_id) VALUES (?,?,?,?)', [req.auth.userId, 'MAINTENANCE_EXECUTED', 'maintenance_sessions', id]);
      return res.json({ ok: true });
    }
    if (status === 'IN_PROGRESS') {
      const result = await db.query(`UPDATE maintenance_sessions SET status='IN_PROGRESS',started_at=COALESCE(started_at,UTC_TIMESTAMP())
        WHERE maintenance_id=? AND status='PLANNED' AND (technician_id=? OR ?='ADMIN')`, [id, req.auth.userId, req.auth.roleCode]);
      if (!result.affectedRows) return res.status(404).json({ error: 'Intervention introuvable ou affectée à un autre maintenancier.' });
      return res.json({ ok: true });
    }
    if (status !== 'CANCELLED') return res.status(400).json({ error: 'Statut invalide pour cette action.' });
    await db.transaction(async tx => {
      const sessions = await tx.query(`SELECT ms.maintenance_id,ms.maintenance_number,ms.technician_id,ms.status,ms.material_id,ms.stock_source_location_id,m.material_code,m.designation,l.location_name AS source_location_name FROM maintenance_sessions ms JOIN materials m ON m.material_id=ms.material_id LEFT JOIN locations l ON l.location_id=ms.stock_source_location_id WHERE ms.maintenance_id=? FOR UPDATE`, [id]);
      const session=sessions[0];if(!session){const error=new Error('Intervention introuvable.');error.status=404;throw error}if(!['PLANNED','IN_PROGRESS'].includes(session.status)){const error=new Error('Cette intervention est déjà clôturée.');error.status=409;throw error}
      if(req.auth.roleCode==='MAINTAINER'&&Number(session.technician_id)!==Number(req.auth.userId)){const error=new Error('Intervention affectée à un autre maintenancier.');error.status=403;throw error}
      await returnToStore(tx,session,req.auth.userId,false);
      await tx.query(`UPDATE maintenance_sessions SET status='CANCELLED',completed_at=UTC_TIMESTAMP() WHERE maintenance_id=?`,[id]);
      await tx.query(`UPDATE materials SET operational_status='AVAILABLE' WHERE material_id=?`,[session.material_id]);
      await tx.query('INSERT INTO audit_logs(user_id,action_code,entity_name,entity_id,details) VALUES(?,?,?,?,JSON_OBJECT(\'previousStatus\',?))',[req.auth.userId,'MAINTENANCE_CANCELLED','maintenance_sessions',id,session.status]);
    });
    res.json({ ok: true });
  } catch (error) { if(error.status)return res.status(error.status).json({error:error.message});next(error); }
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
      const locations = await tx.query('SELECT location_id,owner_user_id FROM locations WHERE location_id = ? AND is_active = TRUE', [locationId]);
      const materials = await tx.query('SELECT material_id FROM materials WHERE material_id = ? AND is_active = TRUE', [materialId]);
      if (!locations.length || !materials.length) { const error = new Error('Matériel ou emplacement introuvable.'); error.status = 400; throw error; }
      if(req.auth.roleCode==='MAINTAINER'&&Number(locations[0].owner_user_id)!==Number(req.auth.userId)){const error=new Error('Vous ne pouvez consommer que les pièces de votre stock maintenancier.');error.status=403;throw error}
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

module.exports = { list, technicians, availableMaterials, upcomingReminders, create, updateStatus, listParts, consumePart };
