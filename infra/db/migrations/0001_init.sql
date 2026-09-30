-- 0001_init: core survey schema (Project -> Site -> CameraPoint).
--
-- Mirrors packages/shared (enums.ts, project.ts, site.ts, camera.ts).
-- Coordinates are WGS84 geometry(Point, 4326); PostGIS stores (x, y) = (lng, lat).
-- Applied by scripts/db.sh inside a single transaction.
-- Migrations are append-only: never edit this file once applied — add 0002_*.sql.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- True when a geometry lies within valid WGS84 lng/lat bounds (NULL passes).
CREATE FUNCTION is_wgs84(g geometry) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT g IS NULL OR (
    ST_XMin(g) >= -180 AND ST_XMax(g) <= 180 AND
    ST_YMin(g) >= -90  AND ST_YMax(g) <= 90
  );
$$;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

CREATE TABLE projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  customer_name text CHECK (char_length(customer_name) <= 200),
  address       text CHECK (char_length(address) <= 500),
  location      geometry(Point, 4326) CHECK (is_wgs84(location)),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN (
                  'draft', 'surveying', 'designed', 'quoted',
                  'installing', 'completed', 'cancelled')),
  notes         text CHECK (char_length(notes) <= 5000),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX projects_status_idx   ON projects (status);
CREATE INDEX projects_location_gix ON projects USING gist (location);
CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- sites: a surveyed building / area / floor within a project
-- ---------------------------------------------------------------------------

CREATE TABLE sites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: a project with sites cannot be hard-deleted by accident.
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
  name       text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  address    text CHECK (char_length(address) <= 500),
  -- Map marker for the site.
  location   geometry(Point, 4326) CHECK (is_wgs84(location)),
  -- Optional outline of the site area for the map.
  boundary   geometry(Polygon, 4326)
               CHECK (is_wgs84(boundary) AND (boundary IS NULL OR ST_IsValid(boundary))),
  notes      text CHECK (char_length(notes) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sites_project_name_key UNIQUE (project_id, name),
  -- Target for the composite FK from camera_points.
  CONSTRAINT sites_id_project_key UNIQUE (id, project_id)
);

CREATE INDEX sites_location_gix ON sites USING gist (location);
CREATE INDEX sites_boundary_gix ON sites USING gist (boundary);
CREATE TRIGGER sites_set_updated_at BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- camera_points
-- ---------------------------------------------------------------------------

CREATE TABLE camera_points (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
  -- Optional; when set, the site must belong to the same project (composite FK below).
  site_id        uuid,
  label          text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 50),
  type           text NOT NULL CHECK (type IN (
                   'dome', 'bullet', 'turret', 'ptz', 'fisheye', 'box')),
  status         text NOT NULL DEFAULT 'proposed' CHECK (status IN (
                   'proposed', 'approved', 'installed', 'removed')),
  location       geometry(Point, 4326) NOT NULL CHECK (is_wgs84(location)),
  bearing_deg    double precision CHECK (bearing_deg >= 0 AND bearing_deg < 360),
  fov_deg        double precision CHECK (fov_deg > 0 AND fov_deg <= 360),
  mount_type     text CHECK (mount_type IN ('wall', 'ceiling', 'pole', 'corner')),
  mount_height_m double precision CHECK (mount_height_m BETWEEN 0 AND 100),
  resolution_mp  double precision CHECK (resolution_mp > 0 AND resolution_mp <= 50),
  lens_mm        double precision CHECK (lens_mm > 0 AND lens_mm <= 100),
  model          text CHECK (char_length(model) <= 100),
  poe            boolean,
  cable_length_m double precision CHECK (cable_length_m BETWEEN 0 AND 1000),
  notes          text CHECK (char_length(notes) <= 5000),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT camera_points_project_label_key UNIQUE (project_id, label),
  CONSTRAINT camera_points_site_fk FOREIGN KEY (site_id, project_id)
    REFERENCES sites (id, project_id) ON DELETE RESTRICT
);

CREATE INDEX camera_points_site_idx     ON camera_points (site_id);
CREATE INDEX camera_points_location_gix ON camera_points USING gist (location);
CREATE TRIGGER camera_points_set_updated_at BEFORE UPDATE ON camera_points
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Map views: plain lat/lng columns plus GeoJSON ([lng, lat] order) for the web map.
-- ---------------------------------------------------------------------------

CREATE VIEW project_map_v AS
SELECT
  p.id, p.name, p.status,
  ST_Y(p.location) AS lat,
  ST_X(p.location) AS lng,
  ST_AsGeoJSON(p.location)::jsonb AS geojson
FROM projects p;

CREATE VIEW site_map_v AS
SELECT
  s.id, s.project_id, s.name,
  ST_Y(s.location) AS lat,
  ST_X(s.location) AS lng,
  ST_AsGeoJSON(s.location)::jsonb AS geojson,
  ST_AsGeoJSON(s.boundary)::jsonb AS boundary_geojson
FROM sites s;

CREATE VIEW camera_point_map_v AS
SELECT
  c.id, c.project_id, c.site_id, c.label, c.type, c.status,
  c.bearing_deg, c.fov_deg,
  ST_Y(c.location) AS lat,
  ST_X(c.location) AS lng,
  ST_AsGeoJSON(c.location)::jsonb AS geojson
FROM camera_points c;
