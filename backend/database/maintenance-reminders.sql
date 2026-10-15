-- À exécuter une seule fois après maintenance-stock.sql.
-- Enregistre l'envoi et la réservation du rappel pour éviter les doublons entre instances.
USE mat_manage;

ALTER TABLE maintenance_sessions
  ADD COLUMN reminder_email_claimed_at DATETIME NULL DEFAULT NULL,
  ADD COLUMN reminder_email_sent_at DATETIME NULL DEFAULT NULL,
  ADD KEY ix_maintenance_reminder_queue (status, scheduled_at, reminder_email_sent_at);
