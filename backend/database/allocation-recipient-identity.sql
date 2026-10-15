-- À exécuter une seule fois pour enregistrer l'identifiant du bénéficiaire sur les dotations.
USE mat_manage;

ALTER TABLE allocations
  ADD COLUMN recipient_id_type VARCHAR(12) NULL AFTER recipient_name,
  ADD COLUMN recipient_id_number VARCHAR(40) NULL AFTER recipient_id_type;
