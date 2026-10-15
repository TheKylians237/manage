'use strict';

const db = require('../db');

const allowedStatuses = new Set(['AVAILABLE', 'IN_MAINTENANCE', 'DAMAGED', 'RETIRED']);

async function listMaterials(req, res, next) {
  try {
    const filters = [], params = [];
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

async function summaries(req, res, next) {
  try {
    const mode = req.query.groupBy === 'designation' ? 'designation' : 'category';
    const q = String(req.query.q || '').trim().slice(0, 100);
    const rows = mode === 'category'
      ? await db.query(`SELECT c.category_name AS label, COUNT(DISTINCT m.material_id) AS references_count, COALESCE(SUM(sb.quantity),0) AS quantity
                          FROM categories c LEFT JOIN materials m ON m.category_id=c.category_id AND m.is_active=TRUE
                          LEFT JOIN stock_balances sb ON sb.material_id=m.material_id
                         WHERE c.is_active=TRUE GROUP BY c.category_id,c.category_name ORDER BY quantity DESC,c.category_name`)
      : await db.query(`SELECT m.designation AS label, COUNT(DISTINCT m.material_id) AS references_count, COALESCE(SUM(sb.quantity),0) AS quantity
                          FROM materials m LEFT JOIN stock_balances sb ON sb.material_id=m.material_id
                         WHERE m.is_active=TRUE AND (?='' OR m.designation LIKE ?)
                         GROUP BY LOWER(TRIM(m.designation)),m.designation ORDER BY quantity DESC,m.designation LIMIT 500`, [q, `%${q}%`]);
    res.json({ groupBy: mode, summaries: rows });
  } catch (error) { next(error); }
}

async function categories(req, res, next) {
  try { res.json({ categories: await db.query('SELECT category_id, category_name FROM categories WHERE is_active = TRUE ORDER BY category_name') }); }
  catch (error) { next(error); }
}

async function locations(req, res, next) {
  try { res.json({ locations: await db.query('SELECT location_id, location_code, location_name FROM locations WHERE is_active = TRUE ORDER BY location_name') }); }
  catch (error) { next(error); }
}

async function createLocation(req, res, next) {
  try {
    const code = String(req.body?.locationCode || '').trim();
    const name = String(req.body?.locationName || '').trim();
    if (!/^[A-Za-z0-9._/-]{2,40}$/.test(code) || name.length < 2 || name.length > 120) return res.status(400).json({ error: 'Code ou nom d’emplacement invalide.' });
    const result = await db.query('INSERT INTO locations (location_code, location_name, description) VALUES (?, ?, ?)', [code, name, String(req.body?.description || '').trim() || null]);
    res.status(201).json({ ok: true, locationId: result.insertId });
  } catch (error) { if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ce code d’emplacement existe déjà.' }); next(error); }
}

async function createMaterial(req, res, next) {
  try {
    const { mercurialeItemId, brand, model, serialNumber, macAddress, minimumStock, description } = req.body || {};
    if (!Number.isSafeInteger(Number(mercurialeItemId)) || !Number.isFinite(Number(minimumStock)) || Number(minimumStock) < 0 || (macAddress && !/^(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(String(macAddress)))) return res.status(400).json({ error: 'Référence mercuriale, adresse MAC ou seuil invalide.' });
    const item = (await db.query('SELECT material_code, designation, category_id FROM mercuriale_items WHERE mercuriale_item_id = ? LIMIT 1', [Number(mercurialeItemId)]))[0];
    if (!item) return res.status(400).json({ error: 'Sélectionnez un article de la mercuriale.' });
    const result = await db.query(
      `INSERT INTO materials (material_code, designation, category_id, brand, model, serial_number, mac_address, minimum_stock, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.material_code, item.designation, item.category_id, brand || null, model || null, serialNumber || null, macAddress || null, Number(minimumStock), description || null, req.auth.userId]
    );
    res.status(201).json({ ok: true, materialId: result.insertId });
  } catch (error) { next(error); }
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

module.exports = { listMaterials, categories, locations, mercuriale, summaries, createLocation, createMaterial, updateMaterialStatus };
