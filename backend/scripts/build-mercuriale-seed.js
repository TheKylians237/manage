'use strict';

const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '../../database/mercuriale.txt');
const target = path.resolve(__dirname, '../database/mercuriale-seed.sql');
const lines = fs.readFileSync(source, 'utf8').split(/\r?\n/).filter(line => line.trim());
const records = lines.map((line, index) => {
  const [category, code, designation] = line.split('\t');
  if (!category || !code || !designation) throw new Error(`Ligne mercuriale ${index + 1} invalide.`);
  return { category: category.trim(), code: code.trim(), designation: designation.trim() };
});
const categories = [...new Set(records.map(record => record.category))].sort((a, b) => a.localeCompare(b, 'fr'));
const escape = value => `'${value.replaceAll("'", "''")}'`;
const sql = [
  'USE mat_manage;',
  'INSERT INTO categories (category_name, description, is_active) VALUES',
  ...categories.map((category, index) => `  (${escape(category)}, 'Catégorie issue de la mercuriale', TRUE)${index === categories.length - 1 ? '' : ','}`),
  'ON DUPLICATE KEY UPDATE description = VALUES(description), is_active = TRUE;',
  '',
  'INSERT INTO mercuriale_items (category_id, material_code, designation) VALUES',
  ...records.map((record, index) => `  ((SELECT category_id FROM categories WHERE category_name = ${escape(record.category)} AND parent_category_id IS NULL LIMIT 1), ${escape(record.code)}, ${escape(record.designation)})${index === records.length - 1 ? '' : ','}`),
  'ON DUPLICATE KEY UPDATE category_id = VALUES(category_id), designation = VALUES(designation);',
  ''
].join('\n');
fs.writeFileSync(target, sql, 'utf8');
process.stdout.write(`${records.length} références, ${categories.length} catégories → ${target}\n`);
