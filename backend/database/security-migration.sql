-- À exécuter après database/mat_manage.sql, avant le premier démarrage.
-- Les colonnes users/materials ne sont à ajouter qu'une fois. La table des
-- sessions est aussi incluse ici pour permettre au serveur de démarrer.
USE mat_manage;

-- Le schéma transmis avait `badge` et les colonnes d’un ancien OTP par e-mail.
-- On conserve les identifiants existants en renommant `badge` vers `matricule`.
ALTER TABLE users
  CHANGE COLUMN badge matricule VARCHAR(40) NOT NULL,
  ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE AFTER password_hash,
  ADD COLUMN totp_secret_enc VARBINARY(512) NULL AFTER mfa_enabled,
  ADD COLUMN totp_last_step BIGINT NULL AFTER totp_secret_enc,
  ADD COLUMN failed_login_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN locked_until DATETIME NULL,
  ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE materials
  ADD COLUMN operational_status ENUM('AVAILABLE','IN_MAINTENANCE','DAMAGED','RETIRED') NOT NULL DEFAULT 'AVAILABLE';

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  recovery_code_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  code_hash BINARY(32) NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (recovery_code_id),
  KEY ix_mfa_codes_user_unused (user_id, used_at),
  CONSTRAINT fk_mfa_codes_user FOREIGN KEY (user_id)
    REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS http_sessions (
  session_id VARCHAR(128) NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  session_data MEDIUMTEXT NOT NULL,
  PRIMARY KEY (session_id),
  KEY ix_http_sessions_expiry (expires_at)
) ENGINE=InnoDB;

-- Vues utiles aux synthèses. Les filtres de période sont appliqués par l'API.
CREATE OR REPLACE VIEW v_material_stock AS
SELECT m.material_id, m.material_code, m.designation, m.category_id,
       m.brand, m.model, m.minimum_stock, m.operational_status,
       COALESCE(SUM(sb.quantity), 0) AS total_quantity,
       CASE WHEN COALESCE(SUM(sb.quantity), 0) <= m.minimum_stock
            THEN 1 ELSE 0 END AS is_below_minimum
  FROM materials m
  LEFT JOIN stock_balances sb ON sb.material_id = m.material_id
 WHERE m.is_active = TRUE
 GROUP BY m.material_id, m.material_code, m.designation, m.category_id,
          m.brand, m.model, m.minimum_stock, m.operational_status;
