-- À exécuter une seule fois après inventory-upgrade.sql.
-- Les variantes proches restent enregistrées, mais sont rattachées à une référence
-- principale afin que stock, seuils et tableaux restent consolidés.
USE mat_manage;

ALTER TABLE materials
  ADD COLUMN merged_into_material_id BIGINT UNSIGNED NULL AFTER is_active,
  ADD KEY ix_materials_merged_into (merged_into_material_id),
  ADD CONSTRAINT fk_materials_merged_into FOREIGN KEY (merged_into_material_id)
    REFERENCES materials (material_id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE VIEW v_material_stock AS
SELECT m.material_id, m.material_code, m.designation, m.category_id,
       m.brand, m.model, m.minimum_stock, m.operational_status,
       COALESCE(SUM(sb.quantity), 0) AS total_quantity,
       CASE WHEN COALESCE(SUM(sb.quantity), 0) <= m.minimum_stock THEN 1 ELSE 0 END AS is_below_minimum
  FROM materials m LEFT JOIN stock_balances sb ON sb.material_id = m.material_id
 WHERE m.is_active = TRUE AND m.merged_into_material_id IS NULL
 GROUP BY m.material_id, m.material_code, m.designation, m.category_id,
          m.brand, m.model, m.minimum_stock, m.operational_status;
