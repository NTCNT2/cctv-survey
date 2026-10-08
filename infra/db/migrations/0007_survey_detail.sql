-- 0007_survey_detail: the three free-text items of the survey detail that had
-- no column yet (survey detail form, items 11, 12 and 14).
--
-- Additive: three new nullable text columns; every existing row keeps all its
-- values (the new columns are NULL). No data is rewritten, so updated_at is
-- not touched. cctv_app needs no new grant: its privileges on camera_points
-- are table-wide (0003), so they cover the new columns.
-- Applied by scripts/db.sh in one transaction.

ALTER TABLE camera_points
  -- 11: where the control cabinet / cable gathering point is
  ADD COLUMN cabinet_location text CHECK (char_length(cabinet_location) <= 500),
  -- 12: site conditions and obstacles at the installation point
  ADD COLUMN site_conditions  text CHECK (char_length(site_conditions) <= 2000),
  -- 14: additional requirements / problems found on site
  ADD COLUMN site_issues      text CHECK (char_length(site_issues) <= 2000);
