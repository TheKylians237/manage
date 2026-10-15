-- Exécuter après le schéma et security-migration.sql. Idempotent.
USE mat_manage;

INSERT INTO categories (category_name, description, is_active) VALUES
  ('Informatique', 'Postes de travail et équipements informatiques', TRUE),
  ('Réseau', 'Équipements réseau et connectivité', TRUE),
  ('Télécommunications', 'Équipements de téléphonie et transmissions', TRUE),
  ('Énergie', 'Onduleurs et alimentation électrique', TRUE),
  ('Périphériques', 'Imprimantes, écrans et périphériques', TRUE),
  ('Accessoires', 'Câbles et accessoires informatiques', TRUE)
ON DUPLICATE KEY UPDATE description = VALUES(description), is_active = TRUE;

INSERT INTO locations (location_code, location_name, description, is_active) VALUES
  ('MAG-GENERAL', 'Magasin général', 'Emplacement principal; à adapter à l’organisation locale', TRUE)
ON DUPLICATE KEY UPDATE location_name = VALUES(location_name), is_active = TRUE;

INSERT INTO services (service_code, service_name, description, is_active) VALUES
  ('STRANS', 'Service des transmissions', 'Service de gestion du parc matériel', TRUE)
ON DUPLICATE KEY UPDATE service_name = VALUES(service_name), is_active = TRUE;
