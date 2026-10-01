-- 0003_app_role: least-privilege login role for the API (Phase 7).
-- The API must not connect as the superuser `cctv` (COPY ... PROGRAM, ALTER SYSTEM,
-- DROP DATABASE, ...). `cctv` stays for migrations and admin work via `docker exec`.
--
-- No password in this file (it is committed). Set it once per cluster:
--   pnpm db:psql   then   \password cctv_app
-- Until then the role cannot log in over TCP.
--
-- Tables added by later migrations get NO access by default: grant explicitly there.

-- Roles are cluster-wide: create once, skip on the next database (e.g. cctv_survey_test).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cctv_app') THEN
    CREATE ROLE cctv_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
      NOBYPASSRLS NOINHERIT CONNECTION LIMIT 20;
  END IF;
END $$;

-- Only the owner (cctv) and cctv_app may connect to this database; no TEMP for PUBLIC.
DO $$
BEGIN
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO cctv_app', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO cctv_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON projects, sites, camera_points TO cctv_app;
-- Users are deactivated (is_active) and sessions revoked (revoked_at); the API never
-- deletes either. SELECT ... FOR UPDATE on users needs UPDATE, which is granted.
GRANT SELECT, INSERT, UPDATE ON users, user_sessions TO cctv_app;

-- No access to schema_migrations; PostGIS functions and spatial_ref_sys are PUBLIC already.

ALTER ROLE cctv_app SET statement_timeout = '15s';
ALTER ROLE cctv_app SET idle_in_transaction_session_timeout = '30s';
