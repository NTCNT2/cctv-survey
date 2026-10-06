-- 0005_camera_models_photos: camera model master data and field photos of
-- camera points (Quick Add).
--
-- Additive only: two new tables and one new nullable column. No existing row
-- is updated, so every camera point keeps its location, gps_accuracy_m,
-- surveyed_at, status, created_at and updated_at exactly as they are.
--
-- camera_points keeps its own brand / model / type / resolution_mp columns: they
-- are a snapshot of the model at the time it was chosen. camera_model_id only
-- links the point to the master row, so a point still shows its camera after
-- the model is deactivated (active = false) or edited later.

-- ---------------------------------------------------------------------------
-- Camera models (admin-managed). Never deleted: deactivate instead.
-- ---------------------------------------------------------------------------

CREATE TABLE camera_models (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand         text NOT NULL CHECK (char_length(btrim(brand)) BETWEEN 1 AND 100),
  model         text NOT NULL CHECK (char_length(btrim(model)) BETWEEN 1 AND 100),
  camera_type   text NOT NULL CHECK (camera_type IN (
                  'dome', 'bullet', 'turret', 'ptz', 'fisheye', 'box')),
  resolution_mp double precision CHECK (resolution_mp > 0 AND resolution_mp <= 50),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One row per brand + model, ignoring case ("Hikvision" = "HIKVISION").
CREATE UNIQUE INDEX camera_models_brand_model_key
  ON camera_models (lower(brand), lower(model));
CREATE TRIGGER camera_models_set_updated_at BEFORE UPDATE ON camera_models
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE camera_points
  ADD COLUMN camera_model_id uuid REFERENCES camera_models (id) ON DELETE RESTRICT;
CREATE INDEX camera_points_camera_model_idx ON camera_points (camera_model_id);

-- ---------------------------------------------------------------------------
-- Field photos. The image files live on the API's upload volume (UPLOAD_DIR),
-- never in the database: a row holds only the file names and metadata.
-- Deleting a camera point deletes its photo rows; the API removes the files.
-- ---------------------------------------------------------------------------

CREATE TABLE camera_photos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_point_id uuid NOT NULL REFERENCES camera_points (id) ON DELETE CASCADE,
  -- Relative file names under UPLOAD_DIR, chosen by the API (never by a client).
  file_key        text NOT NULL UNIQUE CHECK (file_key ~ '^[a-z0-9/_.-]{1,200}$'),
  thumb_key       text NOT NULL UNIQUE CHECK (thumb_key ~ '^[a-z0-9/_.-]{1,200}$'),
  content_type    text NOT NULL CHECK (content_type IN ('image/jpeg')),
  size_bytes      integer NOT NULL CHECK (size_bytes > 0),
  width           integer NOT NULL CHECK (width > 0),
  height          integer NOT NULL CHECK (height > 0),
  -- Users are never deleted (0002), so RESTRICT never blocks anything.
  uploaded_by     uuid REFERENCES users (id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX camera_photos_camera_idx ON camera_photos (camera_point_id, created_at);

-- ---------------------------------------------------------------------------
-- API role (0003: later tables get no access unless granted here).
-- No DELETE on camera_models: models are deactivated, never removed.
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON camera_models TO cctv_app;
GRANT SELECT, INSERT, DELETE ON camera_photos TO cctv_app;
