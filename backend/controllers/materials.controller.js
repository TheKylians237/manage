'use strict';

const db = require('../db');
const crypto = require('node:crypto');

const allowedStatuses = new Set(['AVAILABLE', 'IN_MAINTENANCE', 'DAMAGED', 'RETIRED']);

function normalizeDesignation(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function designationSimilarity(left, right) {
  const a = normalizeDesignation(left), b = normalizeDesignation(right);
  if (!a || !b) return 0;
  const maxLength = Math.max(a.length, b.length);
  if (Math.abs(a.length - b.length) / maxLength > 0.6) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return Math.floor((1 - previous[b.length] / maxLength) * 100);
}

async function findSimilarMaterial(query, designation) {
  const rows = await query(`SELECT material_id, material_code, designation, category_id, minimum_stock
      FROM materials WHERE is_active = TRUE AND merged_into_material_id IS NULL`);
  let match = null;
  for (const row of rows) {
    const similarityPercent = designationSimilarity(designation, row.designation);
    if (similarityPercent >= 40 && (!match || similarityPercent > match.similarityPercent)) {
      match = { ...row, similarityPercent };
    }
  }
  return match;
}

async function listMaterials(req, res, next) {
  try {
    const filters = ['m.is_active = TRUE', 'm.merged_into_material_id IS NULL'], params = [];
    const q = String(req.query.q || '').trim().slice(0, 100);
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : null;
    const status = String(req.query.status || '');
    const locationId = req.query.locationId ? Number(req.query.locationId) : null;
    if (q) { filters.push('(m.designation LIKE ? OR m.material_code LIKE ? OR m.brand LIKE ? OR m.model LIKE ?)'); params.push(...Array(4).fill(`%${q}%`)); }
    if (categoryId && Number.isSafeInteger(categoryId)) { filters.push('m.category_id = ?'); params.push(categoryId); }
    if (allowedStatuses.has(status)) { filters.push('m.operational_status = ?'); params.push(status); }
    if (locationId && Number.isSafeInteger(locationId)) { filters.push('sb.location_id = ?'); params.push(locationId); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const rows = await db.query(
      `SELECT m.material_id, m.material_code, m.designation, m.category_id,
              c.category_name, m.brand, m.model, m.serial_number, m.mac_address,
              m.minimum_stock, m.description, m.is_active, m.created_by, m.updated_at,
              m.operational_status,
              COALESCE(SUM(sb.quantity),0) AS total_quantity,
              GROUP_CONCAT(DISTINCT CONCAT(l.location_name, ': ', sb.quantity) ORDER BY l.location_name SEPARATOR ' | ') AS locations,
              CASE WHEN COALESCE(SUM(sb.quantity),0) <= m.minimum_stock THEN TRUE ELSE FALSE END AS below_minimum
         FROM materials m JOIN categories c ON c.category_id = m.category_id
         LEFT JOIN stock_balances sb ON sb.material_id = m.material_id
         LEFT JOIN locations l ON l.location_id = sb.location_id
         ${where}
        GROUP BY m.material_id, m.material_code, m.designation, m.category_id,
                 c.category_name, m.brand, m.model, m.serial_number, m.mac_address,
                 m.minimum_stock, m.description, m.is_active, m.created_by, m.updated_at, m.operational_status
        ORDER BY m.designation LIMIT 500`, params
    );
    res.json({ materials: rows });
  } catch (error) { next(error); }
}

async function stockOrganization(req, res, next) {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const pattern = `%${q}%`;
    const rows = await db.query(
      `SELECT m.material_id, m.material_code, m.designation,
              l.location_code, l.location_name, COALESCE(sb.quantity, 0) AS quantity
         FROM materials m
         LEFT JOIN stock_balances sb ON sb.material_id = m.material_id
         LEFT JOIN locations l ON l.location_id = sb.location_id
        WHERE m.is_active = TRUE AND m.merged_into_material_id IS NULL
          AND (? = '' OR m.material_code LIKE ? OR m.designation LIKE ?
               OR COALESCE(l.location_code, '') LIKE ? OR COALESCE(l.location_name, '') LIKE ?)
        ORDER BY m.material_code, l.location_code
        LIMIT 5000`,
      [q, pattern, pattern, pattern, pattern]
    );
    res.json({ stockOrganization: rows });
  } catch (error) { next(error); }
}

async function mercuriale(req, res, next) {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const rows = await db.query(
      `SELECT mi.mercuriale_item_id, mi.material_code, mi.designation,
              mi.category_id, c.category_name
         FROM mercuriale_items mi JOIN categories c ON c.category_id = mi.category_id
        WHERE (? = '' OR mi.material_code LIKE ? OR mi.designation LIKE ? OR c.category_name LIKE ?)
        ORDER BY c.category_name, mi.material_code LIMIT 5000`,
      [q, `%${q}%`, `%${q}%`, `%${q}%`]
    );
    res.json({ items: rows });
  } catch (error) { next(error); }
}

async function matchMaterial(req, res, next) {
  try {
    const itemId = Number(req.query.mercurialeItemId);
    if (!Number.isSafeInteger(itemId) || itemId < 1) return res.status(400).json({ error: 'Référence de mercuriale invalide.' });
    const item = (await db.query('SELECT designation FROM mercuriale_items WHERE mercuriale_item_id = ? LIMIT 1', [itemId]))[0];
    if (!item) return res.status(404).json({ error: 'Référence de mercuriale introuvable.' });
    const match = await findSimilarMaterial(db.query, item.designation);
    res.json({ match: match ? { materialId: match.material_id, materialCode: match.material_code, designation: match.designation, similarityPercent: match.similarityPercent } : null });
  } catch (error) { next(error); }
}

async function summaries(req, res, next) {
  try {
    const mode = req.query.groupBy === 'designation' ? 'designation' : 'category';
    const q = String(req.query.q || '').trim().slice(0, 100);
    const rows = mode === 'category'
      ? await db.query(`SELECT c.category_name AS label, COUNT(DISTINCT m.material_id) AS references_count, COALESCE(SUM(sb.quantity),0) AS quantity
                          FROM categories c LEFT JOIN materials m ON m.category_id=c.category_id AND m.is_active=TRUE AND m.merged_into_material_id IS NULL
                          LEFT JOIN stock_balances sb ON sb.material_id=m.material_id
                         WHERE c.is_active=TRUE GROUP BY c.category_id,c.category_name ORDER BY quantity DESC,c.category_name`)
      : await db.query(`SELECT m.designation AS label, COUNT(DISTINCT m.material_id) AS references_count, COALESCE(SUM(sb.quantity),0) AS quantity
                          FROM materials m LEFT JOIN stock_balances sb ON sb.material_id=m.material_id
                         WHERE m.is_active=TRUE AND m.merged_into_material_id IS NULL AND (?='' OR m.designation LIKE ?)
                         GROUP BY LOWER(TRIM(m.designation)),m.designation ORDER BY quantity DESC,m.designation LIMIT 500`, [q, `%${q}%`]);
    res.json({ groupBy: mode, summaries: rows });
  } catch (error) { next(error); }
}

async function categories(req, res, next) {
  try { res.json({ categories: await db.query('SELECT category_id, category_name FROM categories WHERE is_active = TRUE ORDER BY category_name') }); }
  catch (error) { next(error); }
}

async function locations(req, res, next) {
  try { res.json({ locations: await db.query(`SELECT l.location_id, l.location_code, l.location_name, l.category_id, c.category_name
      FROM locations l LEFT JOIN categories c ON c.category_id = l.category_id
      WHERE l.is_active = TRUE ORDER BY c.category_name IS NULL, c.category_name, l.location_name`) }); }
  catch (error) { next(error); }
}

async function createMaterial(req, res, next) {
  try {
    const { mercurialeItemId, locationId, brand, model, serialNumber, macAddress, minimumStock, description } = req.body || {};
    if (!Number.isSafeInteger(Number(mercurialeItemId)) || !Number.isSafeInteger(Number(locationId)) || (macAddress && !/^(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(String(macAddress)))) return res.status(400).json({ error: 'Référence mercuriale, emplacement ou adresse MAC invalide.' });
    const item = (await db.query('SELECT material_code, designation, category_id FROM mercuriale_items WHERE mercuriale_item_id = ? LIMIT 1', [Number(mercurialeItemId)]))[0];
    if (!item) return res.status(400).json({ error: 'Sélectionnez un article de la mercuriale.' });
    const generated = await db.transaction(async tx => {
      const locations = await tx.query('SELECT location_id FROM locations WHERE location_id = ? AND category_id = ? AND is_active = TRUE FOR UPDATE', [Number(locationId), item.category_id]);
      if (!locations.length) { const error = new Error('Choisissez l’emplacement associé à la catégorie du matériel.'); error.status = 400; throw error; }
      const similar = await findSimilarMaterial(tx.query, item.designation);
      if (similar) {
        const temporaryCode = `TMP-${crypto.randomBytes(16).toString('hex')}`;
        const variant = await tx.query(
          `INSERT INTO materials (material_code, designation, category_id, brand, model, serial_number, mac_address, minimum_stock, description, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [temporaryCode, item.designation, item.category_id, brand || null, model || null, serialNumber || null, macAddress || null, description || null, req.auth.userId]
        );
        const variantCode = `MAT-${String(variant.insertId).padStart(6, '0')}`;
        await tx.query('UPDATE materials SET material_code = ?, merged_into_material_id = ? WHERE material_id = ?', [variantCode, similar.material_id, variant.insertId]);
        await tx.query('INSERT INTO stock_balances (material_id, location_id, quantity) VALUES (?, ?, 0)', [variant.insertId, Number(locationId)]);
        const movementNumber = `AUTO-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`.slice(0, 50);
        const movement = await tx.query(
          `INSERT INTO stock_movements (movement_number, movement_type, destination_location_id, performed_by, document_reference, notes)
           VALUES (?, 'IN', ?, ?, ?, ?)` ,
          [movementNumber, Number(locationId), req.auth.userId, item.material_code, `Ajout automatique : désignation similaire à ${item.designation} (${similar.similarityPercent} %).`]
        );
        await tx.query('INSERT INTO stock_movement_lines (stock_movement_id, material_id, quantity) VALUES (?, ?, 1)', [movement.insertId, similar.material_id]);
        return { merged: true, materialId: variant.insertId, materialCode: variantCode, matchedMaterialId: similar.material_id, matchedMaterialCode: similar.material_code, locationId: Number(locationId), similarityPercent: similar.similarityPercent, matchedDesignation: similar.designation };
      }
      if (!Number.isFinite(Number(minimumStock)) || Number(minimumStock) < 0) {
        const error = new Error('Saisissez un seuil minimum valide pour cette nouvelle référence.'); error.status = 400; throw error;
      }
      const temporaryCode = `TMP-${crypto.randomBytes(16).toString('hex')}`;
      const result = await tx.query(
        `INSERT INTO materials (material_code, designation, category_id, brand, model, serial_number, mac_address, minimum_stock, description, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [temporaryCode, item.designation, item.category_id, brand || null, model || null, serialNumber || null, macAddress || null, Number(minimumStock), description || null, req.auth.userId]
      );
      const materialCode = `MAT-${String(result.insertId).padStart(6, '0')}`;
      await tx.query('UPDATE materials SET material_code = ? WHERE material_id = ?', [materialCode, result.insertId]);
      await tx.query('INSERT INTO stock_balances (material_id, location_id, quantity) VALUES (?, ?, 0)', [result.insertId, Number(locationId)]);
      return { merged: false, materialId: result.insertId, materialCode, locationId: Number(locationId) };
    });
    res.status(201).json({ ok: true, ...generated });
  } catch (error) { if (error.status) return res.status(error.status).json({ error: error.message }); next(error); }
}

async function updateMaterialStatus(req, res, next) {
  try {
    const status = String(req.body?.status || '');
    const materialId = Number(req.params.materialId);
    if (!Number.isSafeInteger(materialId) || !allowedStatuses.has(status)) return res.status(400).json({ error: 'Matériel ou statut invalide.' });
    const result = await db.query('UPDATE materials SET operational_status = ? WHERE material_id = ? AND is_active = TRUE', [status, materialId]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Matériel introuvable.' });
    await db.query('INSERT INTO audit_logs (user_id, action_code, entity_name, entity_id, details) VALUES (?, ?, ?, ?, JSON_OBJECT(\'status\', ?))', [req.auth.userId, 'MATERIAL_STATUS_CHANGED', 'materials', materialId, status]);
    res.json({ ok: true });
  } catch (error) { next(error); }
}

module.exports = { listMaterials, stockOrganization, categories, locations, mercuriale, matchMaterial, summaries, createMaterial, updateMaterialStatus };
