'use strict';

const db = require('../db');

function dateOr(value, fallback) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback; }

async function dashboard(req, res, next) {
  try {
    const endDefault = new Date();
    const startDefault = new Date(); startDefault.setDate(startDefault.getDate() - 29);
    const iso = d => d.toISOString().slice(0, 10);
    const from = dateOr(req.query.from, iso(startDefault));
    const to = dateOr(req.query.to, iso(endDefault));
    if (from > to) return res.status(400).json({ error: 'La date de début doit précéder la date de fin.' });
    const daySpan = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
    if (daySpan > 366) return res.status(400).json({ error: 'La période maximale est de 366 jours.' });
    const params = [`${from} 00:00:00`, to];
    const [stockRows, operationRows, categoryRows, movementRows, materialRows, maintenanceRows, orderRows, trendRows] = await Promise.all([
      db.query(`SELECT COUNT(*) AS references_count, COALESCE(SUM(total_quantity),0) AS units,
                       SUM(is_below_minimum = 1) AS low_stock,
                       SUM(operational_status = 'IN_MAINTENANCE') AS maintenance_status,
                       SUM(operational_status = 'DAMAGED') AS damaged
                  FROM v_material_stock`),
      db.query(`SELECT COUNT(*) AS count, COALESCE(SUM(CASE WHEN movement_type='IN' THEN 1 ELSE 0 END),0) AS entries,
                       COALESCE(SUM(CASE WHEN movement_type='OUT' THEN 1 ELSE 0 END),0) AS exits,
                       COALESCE(SUM(CASE WHEN movement_type='TRANSFER' THEN 1 ELSE 0 END),0) AS transfers
                  FROM stock_movements WHERE movement_date >= ? AND movement_date < DATE_ADD(?, INTERVAL 1 DAY)`, params),
      db.query(`SELECT c.category_name, COALESCE(SUM(sb.quantity),0) AS units
                  FROM categories c LEFT JOIN materials m ON m.category_id=c.category_id AND m.is_active=TRUE
                  LEFT JOIN stock_balances sb ON sb.material_id=m.material_id
                 WHERE c.is_active=TRUE GROUP BY c.category_id,c.category_name ORDER BY units DESC LIMIT 8`),
      db.query(`SELECT sm.stock_movement_id, sm.movement_number, sm.movement_type, sm.movement_date,
                       ml.quantity, m.designation, m.material_code, u.full_name AS actor,
                       sm.recipient_name, s.service_name
                  FROM stock_movements sm JOIN stock_movement_lines ml ON ml.stock_movement_id=sm.stock_movement_id
                  JOIN materials m ON m.material_id=ml.material_id LEFT JOIN users u ON u.user_id=sm.performed_by
                  LEFT JOIN services s ON s.service_id=sm.service_id
                 WHERE sm.movement_date >= ? AND sm.movement_date < DATE_ADD(?, INTERVAL 1 DAY)
                 ORDER BY sm.movement_date DESC LIMIT 20`, params),
      db.query(`SELECT m.material_id,m.material_code,m.designation,c.category_name,m.brand,m.minimum_stock,m.operational_status,
                       COALESCE(SUM(sb.quantity),0) AS total_quantity,
                       CASE WHEN COALESCE(SUM(sb.quantity),0)<=m.minimum_stock THEN 1 ELSE 0 END AS below_minimum
                  FROM materials m JOIN categories c ON c.category_id=m.category_id
                  LEFT JOIN stock_balances sb ON sb.material_id=m.material_id
                 WHERE m.is_active=TRUE GROUP BY m.material_id,m.material_code,m.designation,c.category_name,m.brand,m.minimum_stock,m.operational_status
                 ORDER BY below_minimum DESC,m.designation LIMIT 30`),
      db.query(`SELECT COUNT(*) AS count, SUM(status IN ('PLANNED','IN_PROGRESS')) AS open_count,
                       SUM(status='COMPLETED') AS completed_count FROM maintenance_sessions
                 WHERE scheduled_at >= ? AND scheduled_at < DATE_ADD(?, INTERVAL 1 DAY)`, params),
      db.query(`SELECT COUNT(*) AS count, SUM(status IN ('DRAFT','SENT','CONFIRMED','PARTIALLY_RECEIVED')) AS open_count
                  FROM purchase_orders WHERE order_date >= ? AND order_date < DATE_ADD(?, INTERVAL 1 DAY)`, params),
      db.query(`SELECT DATE(movement_date) AS movement_day,
                       SUM(movement_type='IN') AS entries, SUM(movement_type='OUT') AS exits,
                       SUM(movement_type='TRANSFER') AS transfers
                  FROM stock_movements WHERE movement_date >= ? AND movement_date < DATE_ADD(?, INTERVAL 1 DAY)
                 GROUP BY DATE(movement_date) ORDER BY movement_day`, params)
    ]);
    const s = stockRows[0], o = operationRows[0], maint = maintenanceRows[0], orders = orderRows[0];
    const summary = `${o.count} mouvement(s) ont été enregistré(s) du ${from} au ${to}, dont ${o.entries} entrée(s), ${o.exits} sortie(s) et ${o.transfers} transfert(s). Le parc compte ${s.references_count} références et ${s.units} unités; ${s.low_stock} référence(s) sont sous le seuil minimal, ${maint.open_count || 0} maintenance(s) sont en cours ou planifiées${req.auth.roleCode === 'ADMIN' ? ` et ${orders.open_count || 0} commande(s) restent ouvertes` : ''}.`;
    let roleSummary = summary;
    if (req.auth.roleCode === 'MAINTAINER') roleSummary = `Sur la période, ${maint.count || 0} intervention(s) sont planifiées ou suivies, dont ${maint.open_count || 0} à traiter et ${maint.completed_count || 0} terminée(s). ${s.maintenance_status || 0} référence(s) sont actuellement marquées en maintenance.`;
    res.json({ period: { from, to }, role: req.auth.roleCode, kpis: {
      references: Number(s.references_count || 0), units: Number(s.units || 0), lowStock: Number(s.low_stock || 0),
      damaged: Number(s.damaged || 0), maintenance: Number(maint.open_count || 0), orders: Number(orders.open_count || 0),
      movements: Number(o.count || 0), entries: Number(o.entries || 0), exits: Number(o.exits || 0)
    }, summary: roleSummary, categories: categoryRows, movements: movementRows, trend: trendRows, materials: materialRows,
    roleMetrics: req.auth.roleCode === 'MAINTAINER' ? { maintenance: maint } : null });
  } catch (error) { next(error); }
}

module.exports = { dashboard };
