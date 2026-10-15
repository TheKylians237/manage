-- Mat-Manage: mercuriale, structure des matériels, rôles et paramètres.
-- À exécuter une seule fois sur la base mat_manage avant mercuriale-seed.sql.
USE mat_manage;

ALTER TABLE materials
  ADD COLUMN serial_number VARCHAR(120) NULL AFTER model,
  ADD COLUMN mac_address VARCHAR(17) NULL AFTER serial_number,
  DROP COLUMN unit,
  DROP COLUMN tracks_serial,
  DROP COLUMN created_at,
  DROP INDEX uq_materials_code,
  ADD KEY ix_materials_code (material_code);

CREATE OR REPLACE VIEW v_material_stock AS
SELECT m.material_id, m.material_code, m.designation, m.category_id,
       m.brand, m.model, m.minimum_stock, m.operational_status,
       COALESCE(SUM(sb.quantity), 0) AS total_quantity,
       CASE WHEN COALESCE(SUM(sb.quantity), 0) <= m.minimum_stock THEN 1 ELSE 0 END AS is_below_minimum
  FROM materials m LEFT JOIN stock_balances sb ON sb.material_id = m.material_id
 WHERE m.is_active = TRUE
 GROUP BY m.material_id, m.material_code, m.designation, m.category_id,
          m.brand, m.model, m.minimum_stock, m.operational_status;

CREATE TABLE IF NOT EXISTS mercuriale_items (
  mercuriale_item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id BIGINT UNSIGNED NOT NULL,
  material_code VARCHAR(50) NOT NULL,
  designation VARCHAR(255) NOT NULL,
  PRIMARY KEY (mercuriale_item_id),
  UNIQUE KEY uq_mercuriale_code (material_code),
  KEY ix_mercuriale_category (category_id),
  KEY ix_mercuriale_designation (designation),
  CONSTRAINT fk_mercuriale_category FOREIGN KEY (category_id)
    REFERENCES categories(category_id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(80) NOT NULL,
  setting_value VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO app_settings (setting_key, setting_value)
VALUES ('account_creation_enabled', '1')
ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key);

-- Les comptes gestionnaires existants sont conservés avec le rôle magasinier.
UPDATE users
   SET role_id = (SELECT role_id FROM roles WHERE role_code = 'STOREKEEPER' LIMIT 1)
 WHERE role_id = (SELECT role_id FROM roles WHERE role_code = 'MANAGER' LIMIT 1);
DELETE rp FROM role_permissions rp
 JOIN roles r ON r.role_id = rp.role_id
 WHERE r.role_code = 'MANAGER';
DELETE FROM roles WHERE role_code = 'MANAGER';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id FROM roles r JOIN permissions p ON p.permission_code = 'ALLOCATIONS_MANAGE'
 WHERE r.role_code = 'STOREKEEPER'
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);

-- Les catégories de la mercuriale sont uniques à la racine.
