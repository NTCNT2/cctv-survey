-- Smoke test for the schema. Run via: pnpm db:verify
-- Everything happens inside one transaction that is ROLLED BACK at the end,
-- so no existing data is changed and no test rows are left behind.
\set ON_ERROR_STOP 1
BEGIN;

SELECT 'postgres ' || current_setting('server_version') AS version
UNION ALL SELECT 'postgis  ' || postgis_lib_version()
UNION ALL SELECT 'migrations applied: ' || string_agg(version, ', ' ORDER BY version)
  FROM schema_migrations;

DO $$
DECLARE
  p1 uuid; p2 uuid; s1 uuid; s2 uuid; c1 uuid;
  r record;
  n int;
BEGIN
  -- Structure ---------------------------------------------------------------
  ASSERT (SELECT count(*) FROM pg_extension WHERE extname = 'postgis') = 1, 'postgis missing';
  ASSERT to_regclass('projects') IS NOT NULL, 'projects missing';
  ASSERT to_regclass('sites') IS NOT NULL, 'sites missing';
  ASSERT to_regclass('camera_points') IS NOT NULL, 'camera_points missing';
  ASSERT (SELECT srid FROM geometry_columns
          WHERE f_table_name = 'camera_points' AND f_geometry_column = 'location') = 4326,
         'camera_points.location must be SRID 4326';

  -- Happy path (Bangkok) ------------------------------------------------------
  INSERT INTO projects (name, customer_name, location, status)
  VALUES ('verify-project', 'ACME', ST_SetSRID(ST_MakePoint(100.5018, 13.7563), 4326), 'surveying')
  RETURNING id INTO p1;
  INSERT INTO projects (name) VALUES ('verify-other') RETURNING id INTO p2;

  INSERT INTO sites (project_id, name, location, boundary)
  VALUES (p1, 'Building A',
          ST_SetSRID(ST_MakePoint(100.5020, 13.7565), 4326),
          ST_GeomFromText('POLYGON((100.5015 13.7560,100.5025 13.7560,100.5025 13.7570,100.5015 13.7570,100.5015 13.7560))', 4326))
  RETURNING id INTO s1;
  INSERT INTO sites (project_id, name) VALUES (p2, 'Other site') RETURNING id INTO s2;

  INSERT INTO camera_points (project_id, site_id, label, type, location, bearing_deg, fov_deg, mount_type, poe)
  VALUES (p1, s1, 'CAM-01', 'dome', ST_SetSRID(ST_MakePoint(100.5021, 13.7566), 4326), 90, 110, 'ceiling', true)
  RETURNING id INTO c1;
  INSERT INTO camera_points (project_id, label, type, location)
  VALUES (p1, 'CAM-02', 'bullet', ST_SetSRID(ST_MakePoint(100.5100, 13.7600), 4326));

  -- Map view returns lat/lng in the right order + GeoJSON [lng, lat]
  SELECT * INTO r FROM camera_point_map_v WHERE id = c1;
  ASSERT r.lat = 13.7566 AND r.lng = 100.5021, 'map view lat/lng swapped';
  ASSERT r.geojson = '{"type":"Point","coordinates":[100.5021,13.7566]}'::jsonb, 'bad GeoJSON';
  ASSERT (SELECT boundary_geojson->>'type' FROM site_map_v WHERE id = s1) = 'Polygon', 'bad boundary';

  -- Spatial queries: cameras within 50 m of the site marker / inside its boundary
  SELECT count(*) INTO n FROM camera_points c, sites s
  WHERE s.id = s1 AND ST_DWithin(c.location::geography, s.location::geography, 50);
  ASSERT n = 1, format('expected 1 camera within 50 m, got %s', n);
  SELECT count(*) INTO n FROM camera_points c JOIN sites s ON ST_Contains(s.boundary, c.location)
  WHERE s.id = s1;
  ASSERT n = 1, format('expected 1 camera inside boundary, got %s', n);

  -- updated_at trigger
  UPDATE camera_points SET updated_at = now() - interval '1 day' WHERE id = c1;  -- trigger resets it
  UPDATE camera_points SET created_at = now() - interval '1 day' WHERE id = c1;
  ASSERT (SELECT updated_at > created_at FROM camera_points WHERE id = c1), 'updated_at trigger';

  -- Constraints must reject bad data -------------------------------------------
  -- (each nested BEGIN/EXCEPTION block is a savepoint, so the outer transaction survives)
  BEGIN INSERT INTO projects (name, status) VALUES ('x', 'bogus');
    RAISE EXCEPTION 'invalid project status accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN INSERT INTO projects (name) VALUES ('   ');
    RAISE EXCEPTION 'blank project name accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN INSERT INTO camera_points (project_id, label, type, location)
    VALUES (p1, 'BAD', 'dome', ST_SetSRID(ST_MakePoint(13.75, 100.50), 4326));  -- lat/lng swapped
    RAISE EXCEPTION 'out-of-range latitude accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN INSERT INTO camera_points (project_id, label, type, location)
    VALUES (p1, 'BAD', 'dome', ST_SetSRID(ST_MakePoint(100.5, 13.7), 3857));
    RAISE EXCEPTION 'wrong SRID accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SRID%' THEN RAISE; END IF;
  END;

  BEGIN INSERT INTO camera_points (project_id, label, type, location, bearing_deg)
    VALUES (p1, 'BAD', 'dome', ST_SetSRID(ST_MakePoint(100.5, 13.7), 4326), 360);
    RAISE EXCEPTION 'bearing 360 accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN INSERT INTO camera_points (project_id, label, type, location)
    VALUES (p1, 'CAM-01', 'dome', ST_SetSRID(ST_MakePoint(100.5, 13.7), 4326));
    RAISE EXCEPTION 'duplicate label in project accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  BEGIN INSERT INTO camera_points (project_id, site_id, label, type, location)
    VALUES (p1, s2, 'CAM-X', 'dome', ST_SetSRID(ST_MakePoint(100.5, 13.7), 4326));
    RAISE EXCEPTION 'camera linked to a site of another project';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  BEGIN DELETE FROM projects WHERE id = p1;
    RAISE EXCEPTION 'project with children was deleted';
  EXCEPTION WHEN restrict_violation THEN NULL; END;

  RAISE NOTICE 'ALL CHECKS PASSED';
END;
$$;

ROLLBACK;
