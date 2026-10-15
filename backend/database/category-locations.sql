-- Exécuter une seule fois après reference-data.sql, avant mercuriale-seed.sql.
-- Associe chaque emplacement à sa catégorie et crée automatiquement les emplacements manquants.
USE mat_manage;

SET @locations_category_column = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'locations' AND COLUMN_NAME = 'category_id'
);
SET @locations_category_ddl = IF(@locations_category_column = 0,
  'ALTER TABLE locations ADD COLUMN category_id BIGINT UNSIGNED NULL AFTER parent_location_id',
  'SELECT 1'
);
PREPARE locations_category_stmt FROM @locations_category_ddl;
EXECUTE locations_category_stmt;
DEALLOCATE PREPARE locations_category_stmt;

SET @locations_category_index = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'locations' AND INDEX_NAME = 'uq_locations_category'
);
SET @locations_category_index_ddl = IF(@locations_category_index = 0,
  'ALTER TABLE locations ADD UNIQUE KEY uq_locations_category (category_id)',
  'SELECT 1'
);
PREPARE locations_category_index_stmt FROM @locations_category_index_ddl;
EXECUTE locations_category_index_stmt;
DEALLOCATE PREPARE locations_category_index_stmt;

SET @locations_category_fk = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'locations' AND CONSTRAINT_NAME = 'fk_locations_category'
);
SET @locations_category_fk_ddl = IF(@locations_category_fk = 0,
  'ALTER TABLE locations ADD CONSTRAINT fk_locations_category FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE locations_category_fk_stmt FROM @locations_category_fk_ddl;
EXECUTE locations_category_fk_stmt;
DEALLOCATE PREPARE locations_category_fk_stmt;

INSERT INTO locations (location_code, location_name, description, category_id, is_active)
SELECT CONCAT('CAT-', c.category_id), CONCAT('Stock ', c.category_name),
       CONCAT('Emplacement généré automatiquement pour la catégorie ', c.category_name),
       c.category_id, c.is_active
  FROM categories c
ON DUPLICATE KEY UPDATE
  location_code = VALUES(location_code), location_name = VALUES(location_name),
  description = VALUES(description), category_id = VALUES(category_id), is_active = VALUES(is_active);

DROP TRIGGER IF EXISTS trg_categories_create_location;
DROP TRIGGER IF EXISTS trg_categories_update_location;
DELIMITER $$
CREATE TRIGGER trg_categories_create_location AFTER INSERT ON categories FOR EACH ROW
BEGIN
  INSERT INTO locations (location_code, location_name, description, category_id, is_active)
  VALUES (CONCAT('CAT-', NEW.category_id), CONCAT('Stock ', NEW.category_name),
          CONCAT('Emplacement généré automatiquement pour la catégorie ', NEW.category_name),
          NEW.category_id, NEW.is_active)
  ON DUPLICATE KEY UPDATE
    location_code = VALUES(location_code), location_name = VALUES(location_name),
    description = VALUES(description), category_id = VALUES(category_id), is_active = VALUES(is_active);
END$$

CREATE TRIGGER trg_categories_update_location AFTER UPDATE ON categories FOR EACH ROW
BEGIN
  INSERT INTO locations (location_code, location_name, description, category_id, is_active)
  VALUES (CONCAT('CAT-', NEW.category_id), CONCAT('Stock ', NEW.category_name),
          CONCAT('Emplacement généré automatiquement pour la catégorie ', NEW.category_name),
          NEW.category_id, NEW.is_active)
  ON DUPLICATE KEY UPDATE
    location_code = VALUES(location_code), location_name = VALUES(location_name),
    description = VALUES(description), category_id = VALUES(category_id), is_active = VALUES(is_active);
END$$
DELIMITER ;
