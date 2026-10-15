-- À exécuter une seule fois sur les bases existantes.
-- Ajoute le compte-rendu d'intervention et le département du maintenancier.
USE mat_manage;

ALTER TABLE users
  ADD COLUMN department_name VARCHAR(120) NULL AFTER phone;

ALTER TABLE maintenance_sessions
  ADD COLUMN diagnosis TEXT NULL AFTER problem_description,
  ADD COLUMN comments TEXT NULL AFTER actions_taken,
  ADD COLUMN conclusion ENUM('FUNCTIONAL','DEFECTIVE') NULL AFTER comments,
  ADD COLUMN executed_by BIGINT UNSIGNED NULL AFTER technician_id,
  ADD KEY ix_maintenance_executed_by (executed_by),
  ADD CONSTRAINT fk_maintenance_executed_by FOREIGN KEY (executed_by)
    REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE;
