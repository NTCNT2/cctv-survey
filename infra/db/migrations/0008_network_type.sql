-- 0008_network_type: the camera form asks for the network as one choice
-- (fibre or SIM) instead of the yes/no pair network_available /
-- fiber_available; PoE and the mounting type are no longer asked.
--
-- Additive: one new nullable column. Nothing is dropped: network_available,
-- fiber_available, poe and mount_type keep their values (the app no longer
-- reads or writes them; dropping them is a separate, later decision).
-- Backfill: points that recorded fibre (fiber_available = true) become
-- 'fiber'. The updated_at trigger is held off for that one statement so the
-- points do not look edited. cctv_app needs no new grant: its privileges on
-- camera_points are table-wide (0003).
-- Applied by scripts/db.sh in one transaction.

ALTER TABLE camera_points
  ADD COLUMN network_type text CHECK (network_type IN ('fiber', 'sim'));

ALTER TABLE camera_points DISABLE TRIGGER camera_points_set_updated_at;
UPDATE camera_points SET network_type = 'fiber' WHERE fiber_available IS TRUE;
ALTER TABLE camera_points ENABLE TRIGGER camera_points_set_updated_at;
