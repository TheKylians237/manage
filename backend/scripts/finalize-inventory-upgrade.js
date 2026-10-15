'use strict';

require('dotenv').config();
const db = require('../db');

async function main() {
  await db.query(`CREATE OR REPLACE VIEW v_material_stock AS
    SELECT m.material_id, m.material_code, m.designation, m.category_id,
           m.brand, m.model, m.minimum_stock, m.operational_status,
           COALESCE(SUM(sb.quantity), 0) AS total_quantity,
           CASE WHEN COALESCE(SUM(sb.quantity), 0) <= m.minimum_stock THEN 1 ELSE 0 END AS is_below_minimum
      FROM materials m LEFT JOIN stock_balances sb ON sb.material_id = m.material_id
     WHERE m.is_active = TRUE
     GROUP BY m.material_id, m.material_code, m.designation, m.category_id,
              m.brand, m.model, m.minimum_stock, m.operational_status`);
  await db.query(`INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.role_id, p.permission_id FROM roles r JOIN permissions p ON p.permission_code = 'ALLOCATIONS_MANAGE'
     WHERE r.role_code = 'STOREKEEPER' ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)`);
  const [categories, references, roles, columns] = await Promise.all([
    db.query('SELECT COUNT(*) AS count FROM categories'),
    db.query('SELECT COUNT(*) AS count FROM mercuriale_items'),
    db.query('SELECT role_code FROM roles ORDER BY role_id'),
    db.query('SHOW COLUMNS FROM materials')
  ]);
  process.stdout.write(JSON.stringify({ categories: categories[0].count, mercurialeReferences: references[0].count, roles: roles.map(row => row.role_code), materialColumns: columns.map(row => row.Field) }, null, 2) + '\n');
}

main().catch(error => { process.stderr.write(`Échec de finalisation: ${error.code || error.message}\n`); process.exitCode = 1; }).finally(() => db.pool.end());
