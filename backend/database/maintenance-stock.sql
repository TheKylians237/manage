-- À exécuter une seule fois après inventory-upgrade.sql.
-- Relie chaque sortie de pièce à l'intervention qui l'a consommée.
USE mat_manage;

CREATE TABLE IF NOT EXISTS maintenance_parts (
  maintenance_part_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  maintenance_id BIGINT UNSIGNED NOT NULL,
  stock_movement_line_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (maintenance_part_id),
  UNIQUE KEY uq_maintenance_part_movement_line (stock_movement_line_id),
  KEY ix_maintenance_parts_session (maintenance_id),
  CONSTRAINT fk_maintenance_parts_session FOREIGN KEY (maintenance_id)
    REFERENCES maintenance_sessions (maintenance_id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_maintenance_parts_movement_line FOREIGN KEY (stock_movement_line_id)
    REFERENCES stock_movement_lines (stock_movement_line_id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
