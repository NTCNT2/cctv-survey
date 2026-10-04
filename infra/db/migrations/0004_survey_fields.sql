-- 0004_survey_fields: field-survey data on camera points, the survey status
-- lifecycle and the engineer role (survey platform, Phase 3).
--
-- Additive: new nullable columns (camera_count has a default), widened CHECKs.
-- Existing rows keep every value; only camera_points.status is re-mapped to
-- the new lifecycle (see below). Applied by scripts/db.sh in one transaction.
-- cctv_app needs no new grant: its privileges on camera_points / users are
-- table-wide (0003), so they cover the new columns.

-- ---------------------------------------------------------------------------
-- Camera status: survey lifecycle
--   pending_survey  รอสำรวจ      planned, not visited yet
--   surveyed        สำรวจแล้ว     recorded on site
--   pending_design  รอออกแบบ
--   pending_install รอติดตั้ง
--   installed       ติดตั้งแล้ว
--   issue           มีปัญหา
-- Old → new: proposed → surveyed, approved → pending_install,
--            installed → installed, removed → issue.
-- ---------------------------------------------------------------------------

ALTER TABLE camera_points DROP CONSTRAINT camera_points_status_check;

-- Re-mapping a status is not an edit of the point: keep updated_at as it was.
ALTER TABLE camera_points DISABLE TRIGGER camera_points_set_updated_at;
UPDATE camera_points
SET status = CASE status
  WHEN 'proposed' THEN 'surveyed'
  WHEN 'approved' THEN 'pending_install'
  WHEN 'installed' THEN 'installed'
  WHEN 'removed' THEN 'issue'
  ELSE status
END;
ALTER TABLE camera_points ENABLE TRIGGER camera_points_set_updated_at;

ALTER TABLE camera_points
  ALTER COLUMN status SET DEFAULT 'surveyed',
  ADD CONSTRAINT camera_points_status_check CHECK (status IN (
    'pending_survey', 'surveyed', 'pending_design',
    'pending_install', 'installed', 'issue'));

-- ---------------------------------------------------------------------------
-- Survey fields (all optional; units in the column names)
-- ---------------------------------------------------------------------------

ALTER TABLE camera_points
  -- Location
  ADD COLUMN gps_accuracy_m     double precision
    CHECK (gps_accuracy_m >= 0 AND gps_accuracy_m <= 10000),
  ADD COLUMN address            text CHECK (char_length(address) <= 500),
  ADD COLUMN surveyed_at        timestamptz,
  -- Users are never deleted (0002), so RESTRICT never blocks anything.
  ADD COLUMN surveyor_id        uuid REFERENCES users (id) ON DELETE RESTRICT,
  -- Camera
  ADD COLUMN brand              text CHECK (char_length(brand) <= 100),
  ADD COLUMN camera_count       integer NOT NULL DEFAULT 1
    CHECK (camera_count BETWEEN 1 AND 64),
  ADD COLUMN view_distance_m    double precision
    CHECK (view_distance_m > 0 AND view_distance_m <= 1000),
  ADD COLUMN purpose            text CHECK (purpose IN (
    'entrance', 'road', 'parking', 'walkway', 'building', 'critical_area',
    'other')),
  -- Structure / infrastructure
  ADD COLUMN structure_type     text CHECK (structure_type IN (
    'new_pole', 'existing_pole', 'building', 'wall')),
  ADD COLUMN pole_height_m      double precision
    CHECK (pole_height_m >= 0 AND pole_height_m <= 50),
  ADD COLUMN cabinet_distance_m double precision
    CHECK (cabinet_distance_m >= 0 AND cabinet_distance_m <= 5000),
  ADD COLUMN power_available    boolean,
  ADD COLUMN fiber_available    boolean,
  ADD COLUMN network_available  boolean;

-- Dashboards count cameras per project and status.
CREATE INDEX camera_points_project_status_idx ON camera_points (project_id, status);
CREATE INDEX camera_points_surveyor_idx ON camera_points (surveyor_id);

-- ---------------------------------------------------------------------------
-- Engineer role: reviews survey data and works on the design.
-- ---------------------------------------------------------------------------

ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'surveyor', 'engineer', 'viewer'));
