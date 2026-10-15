-- À exécuter après maintenance-execution.sql.
USE mat_manage;

ALTER TABLE locations
  ADD COLUMN owner_user_id BIGINT UNSIGNED NULL AFTER category_id,
  ADD UNIQUE KEY uq_locations_owner_user (owner_user_id),
  ADD CONSTRAINT fk_locations_owner_user FOREIGN KEY (owner_user_id)
    REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE maintenance_sessions
  ADD COLUMN stock_source_location_id BIGINT UNSIGNED NULL AFTER executed_by,
  ADD KEY ix_maintenance_stock_source (stock_source_location_id),
  ADD CONSTRAINT fk_maintenance_stock_source FOREIGN KEY (stock_source_location_id)
    REFERENCES locations(location_id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS app_notifications (
  notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  notification_type VARCHAR(60) NOT NULL,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  entity_name VARCHAR(80) DEFAULT NULL,
  entity_id BIGINT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME DEFAULT NULL,
  PRIMARY KEY (notification_id),
  KEY ix_app_notifications_user_read (user_id, read_at, created_at),
  CONSTRAINT fk_app_notifications_user FOREIGN KEY (user_id)
    REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employee_daily_reviews (
  review_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_user_id BIGINT UNSIGNED NOT NULL,
  supervisor_user_id BIGINT UNSIGNED NOT NULL,
  review_date DATE NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  opinion TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (review_id),
  UNIQUE KEY uq_employee_daily_review (employee_user_id, review_date),
  KEY ix_daily_reviews_date (review_date, employee_user_id),
  CONSTRAINT fk_daily_reviews_employee FOREIGN KEY (employee_user_id)
    REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_daily_reviews_supervisor FOREIGN KEY (supervisor_user_id)
    REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_daily_reviews_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO roles(role_code, role_name, description)
VALUES ('SUPERVISOR', 'Superviseur', 'Vue globale des opérations, statistiques et évaluations du personnel')
ON DUPLICATE KEY UPDATE role_name=VALUES(role_name), description=VALUES(description);

INSERT INTO permissions(permission_code, description)
VALUES ('SUPERVISION_READ', 'Consulter les statistiques globales, les mouvements et les évaluations'),
       ('SUPERVISION_REVIEW', 'Attribuer les évaluations journalières des agents')
ON DUPLICATE KEY UPDATE description=VALUES(description);

INSERT IGNORE INTO role_permissions(role_id, permission_id)
SELECT r.role_id, p.permission_id FROM roles r JOIN permissions p
WHERE r.role_code='SUPERVISOR' AND p.permission_code IN ('MATERIALS_READ','REPORTS_READ','SUPERVISION_READ','SUPERVISION_REVIEW');

-- Le superviseur peut recevoir le tableau des statistiques, sans droits de gestion sur les stocks ou les comptes.
