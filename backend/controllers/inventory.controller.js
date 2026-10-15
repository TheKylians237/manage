'use strict';

const db = require('../db');

const movementTypes = new Set(['IN', 'OUT', 'TRANSFER']);

async function listAllocations(req, res, next) {
  try {
    const serviceId = req.query.serviceId ? Number(req.query.serviceId) : null;
    const conditions = [], params = [];
    if (serviceId && Number.isSafeInteger(serviceId)) { conditions.push('a.service_id=?'); params.push(serviceId); }
    if (req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) { conditions.push('a.allocation_date>=?'); params.push(`${req.query.from} 00:00:00`); }
    if (req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) { conditions.push('a.allocation_date<DATE_ADD(?,INTERVAL 1 DAY)'); params.push(req.query.to); }
    const q = String(req.query.q || '').trim().slice(0, 100); if (q) { conditions.push('(a.allocation_number LIKE ? OR s.service_name LIKE ? OR a.recipient_name LIKE ? OR a.recipient_id_number LIKE ? OR m.designation LIKE ? OR m.material_code LIKE ?)'); params.push(...Array(6).fill(`%${q}%`)); }
    const rows = await db.query(`SELECT a.allocation_id,a.allocation_number,a.allocation_date,a.recipient_name,
        a.recipient_id_type,a.recipient_id_number,
        a.receipt_reference,s.service_name,m.designation,ml.quantity,u.full_name AS allocated_by
      FROM allocations a JOIN services s ON s.service_id=a.service_id
      JOIN allocation_lines al ON al.allocation_id=a.allocation_id
      JOIN stock_movement_lines ml ON ml.stock_movement_line_id=al.stock_movement_line_id
      JOIN materials m ON m.material_id=ml.material_id JOIN users u ON u.user_id=a.allocated_by
      ${conditions.length?`WHERE ${conditions.join(' AND ')}`:''} ORDER BY a.allocation_date DESC LIMIT 500`,params);
    res.json({allocations:rows});
  } catch(error){next(error)}
}

async function listMovements(req, res, next) {
  try {
    const from = req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : null;
    const to = req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : null;
    const type = movementTypes.has(req.query.type) ? req.query.type : null;
    const q = String(req.query.q || '').trim().slice(0, 100);
    const params = [], conditions = [];
    if(req.auth.roleCode==='STOREKEEPER'){conditions.push('(COALESCE(src.owner_user_id,0)=0 OR COALESCE(dst.owner_user_id,0)=0)')}
    if(req.auth.roleCode==='MAINTAINER'){conditions.push('(src.owner_user_id=? OR dst.owner_user_id=?)');params.push(req.auth.userId,req.auth.userId)}
    if (from) { conditions.push('sm.movement_date >= ?'); params.push(`${from} 00:00:00`); }
    if (to) { conditions.push('sm.movement_date < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(to); }
    if (type) { conditions.push('sm.movement_type = ?'); params.push(type); }
    if (q) { conditions.push('(sm.movement_number LIKE ? OR m.designation LIKE ? OR m.material_code LIKE ? OR sm.recipient_name LIKE ?)'); params.push(...Array(4).fill(`%${q}%`)); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const movements = await db.query(
      `SELECT sm.stock_movement_id, sm.movement_number, sm.movement_type, sm.movement_date,
              src.location_name AS source_location, dst.location_name AS destination_location,
              sm.recipient_name, sm.document_reference, u.full_name AS performed_by,
              m.designation, m.material_code, ml.quantity, s.service_name,sm.notes
         FROM stock_movements sm
         JOIN stock_movement_lines ml ON ml.stock_movement_id = sm.stock_movement_id
         JOIN materials m ON m.material_id = ml.material_id
         LEFT JOIN locations src ON src.location_id = sm.source_location_id
         LEFT JOIN locations dst ON dst.location_id = sm.destination_location_id
         LEFT JOIN users u ON u.user_id = sm.performed_by
         LEFT JOIN services s ON s.service_id = sm.service_id
         ${where} ORDER BY sm.movement_date DESC LIMIT 500`, params
    );
    res.json({ movements });
  } catch (error) { next(error); }
}

async function createMovement(req, res, next) {
  try {
    const type = String(req.body?.type || '');
    const materialId = Number(req.body?.materialId), quantity = Number(req.body?.quantity);
    const sourceId = req.body?.sourceLocationId ? Number(req.body.sourceLocationId) : null;
    const destinationId = req.body?.destinationLocationId ? Number(req.body.destinationLocationId) : null;
    if (!movementTypes.has(type) || !Number.isSafeInteger(materialId) || !Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'Type, matériel ou quantité invalide.' });
    let effectiveSource = sourceId, effectiveDestination = destinationId;
    if ((type === 'IN' && !effectiveDestination) || (type === 'OUT' && !effectiveSource)) {
      const scope=req.auth.roleCode==='MAINTAINER'?'AND owner_user_id=?':req.auth.roleCode==='STOREKEEPER'?'AND owner_user_id IS NULL':'';const locations=await db.query(`SELECT location_id FROM locations WHERE is_active=TRUE ${scope} ORDER BY location_id LIMIT 1`,req.auth.roleCode==='MAINTAINER'?[req.auth.userId]:[]);
      if (locations.length) { if (type === 'IN') effectiveDestination = locations[0].location_id; else effectiveSource = locations[0].location_id; }
    }
    if ((type === 'IN' && (effectiveSource || !effectiveDestination)) || (type === 'OUT' && (!effectiveSource || effectiveDestination)) || (type === 'TRANSFER' && (!effectiveSource || !effectiveDestination || effectiveSource === effectiveDestination))) return res.status(400).json({ error: 'Sélectionnez des emplacements compatibles avec ce type de mouvement.' });
    if(req.auth.roleCode!=='ADMIN'){const locationIds=[effectiveSource,effectiveDestination].filter(Boolean);const owned=await db.query(`SELECT location_id,owner_user_id FROM locations WHERE location_id IN (${locationIds.map(()=>'?').join(',')})`,locationIds);const allowed=loc=>req.auth.roleCode==='MAINTAINER'?Number(loc.owner_user_id)===Number(req.auth.userId):loc.owner_user_id==null;if(owned.some(loc=>!allowed(loc)))return res.status(403).json({error:'Ce mouvement dépasse le périmètre de stock de votre rôle.'})}
    const movementNumber = String(req.body?.movementNumber || `MVT-${Date.now()}`).slice(0, 50);
    const inserted = await db.transaction(async tx => {
      const result = await tx.query(
        `INSERT INTO stock_movements (movement_number, movement_type, movement_date, source_location_id, destination_location_id,
           service_id, supplier_id, performed_by, recipient_name, document_reference, notes)
         VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?, ?, ?, ?, ?)`,
        [movementNumber, type, req.body?.movementDate || null, effectiveSource, effectiveDestination, req.body?.serviceId || null, req.body?.supplierId || null,
          req.auth.userId, req.body?.recipientName || null, req.body?.documentReference || null, req.body?.notes || null]
      );
      await tx.query('INSERT INTO stock_movement_lines (stock_movement_id, material_id, quantity, unit_cost) VALUES (?, ?, ?, ?)', [result.insertId, materialId, quantity, req.body?.unitCost ?? null]);
      return result.insertId;
    });
    await db.query('INSERT INTO audit_logs (user_id, action_code, entity_name, entity_id) VALUES (?, ?, ?, ?)', [req.auth.userId, `STOCK_${type}`, 'stock_movements', inserted]);
    res.status(201).json({ ok: true, stockMovementId: inserted });
  } catch (error) {
    if (error.sqlState === '45000') return res.status(409).json({ error: 'Stock insuffisant pour ce mouvement.' });
    next(error);
  }
}

async function createAllocation(req, res, next) {
  try {
    const serviceId = Number(req.body?.serviceId), sourceLocationId = Number(req.body?.sourceLocationId);
    const lines = Array.isArray(req.body?.lines) ? req.body.lines.slice(0, 100) : [];
    const recipient = String(req.body?.recipientName || '').trim();
    const recipientIdType = String(req.body?.recipientIdType || '').trim().toUpperCase();
    const recipientIdNumber = String(req.body?.recipientIdNumber || '').trim();
    if (!Number.isSafeInteger(serviceId) || !Number.isSafeInteger(sourceLocationId) || !recipient || recipient.length > 150 || !['MATRICULE', 'CNI'].includes(recipientIdType) || !/^[A-Za-z0-9 ./-]{3,40}$/.test(recipientIdNumber) || !lines.length) return res.status(400).json({ error: 'Service, emplacement, bénéficiaire, matricule ou numéro de CNI et matériel requis.' });
    for (const line of lines) if (!Number.isSafeInteger(Number(line.materialId)) || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) return res.status(400).json({ error: 'Ligne de dotation invalide.' });
    if(req.auth.roleCode==='STOREKEEPER'){const allowed=await db.query('SELECT location_id FROM locations WHERE location_id=? AND owner_user_id IS NULL AND is_active=TRUE',[sourceLocationId]);if(!allowed.length)return res.status(403).json({error:'Les dotations doivent être prélevées dans le stock magasinier.'})}
    const allocationNumber = `DOT-${Date.now()}`;
    const allocationId = await db.transaction(async tx => {
      const mv = await tx.query(
        `INSERT INTO stock_movements (movement_number, movement_type, source_location_id, service_id, performed_by, recipient_name, document_reference, notes)
         VALUES (?, 'OUT', ?, ?, ?, ?, ?, ?)`,
        [`${allocationNumber}-M`, sourceLocationId, serviceId, req.auth.userId, recipient, req.body?.receiptReference || allocationNumber, req.body?.notes || null]
      );
      const allocation = await tx.query(
        `INSERT INTO allocations (allocation_number, stock_movement_id, service_id, recipient_name, recipient_id_type, recipient_id_number, allocated_by, receipt_reference, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [allocationNumber, mv.insertId, serviceId, recipient, recipientIdType, recipientIdNumber, req.auth.userId, req.body?.receiptReference || null, req.body?.notes || null]
      );
      for (const line of lines) {
        const lineResult = await tx.query('INSERT INTO stock_movement_lines (stock_movement_id, material_id, quantity) VALUES (?, ?, ?)', [mv.insertId, Number(line.materialId), Number(line.quantity)]);
        await tx.query('INSERT INTO allocation_lines (allocation_id, stock_movement_line_id) VALUES (?, ?)', [allocation.insertId, lineResult.insertId]);
      }
      return allocation.insertId;
    });
    res.status(201).json({ ok: true, allocationId });
  } catch (error) {
    if (error.sqlState === '45000') return res.status(409).json({ error: 'Stock insuffisant pour cette dotation.' });
    next(error);
  }
}

module.exports = { listMovements, createMovement, listAllocations, createAllocation };
