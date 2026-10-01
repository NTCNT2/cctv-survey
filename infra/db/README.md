# Database — PostgreSQL 18 + PostGIS 3.6

Defined in [`/compose.yaml`](../../compose.yaml) (service `db`, named volume `pgdata`).

## Quick start

```bash
cp .env.example .env               # set POSTGRES_PASSWORD (openssl rand -hex 24) + DATABASE_URL
pnpm db:up                         # start + wait for healthy
pnpm db:migrate                    # apply pending migrations
pnpm db:verify                     # binding check + schema smoke test (rolled back)
```

| Command           | Description                                                 |
| ----------------- | ----------------------------------------------------------- |
| `pnpm db:up`      | start the container and wait until healthy                  |
| `pnpm db:stop`    | stop the container (data is kept)                           |
| `pnpm db:logs`    | follow container logs                                       |
| `pnpm db:status`  | list `applied` / `pending` / `MODIFIED` / `MISSING`         |
| `pnpm db:migrate` | apply pending migrations, each in its own transaction       |
| `pnpm db:verify`  | fail if the port is not on 127.0.0.1, then run `verify.sql` |
| `pnpm db:psql`    | interactive psql inside the container                       |
| `pnpm db:test`    | create (if missing) + migrate `cctv_survey_test` for e2e    |

## Security

- The port is published as `127.0.0.1:${POSTGRES_PORT}:5432`. The host IP is hard-coded in
  `compose.yaml`, not read from `.env`. Docker-published ports bypass UFW, so never remove it.
- Remote access: `ssh -L 5432:127.0.0.1:5432 surveyadmin@<server>`.
- Real credentials only live in `.env` (git-ignored). `POSTGRES_PASSWORD` is required;
  compose refuses to start without it.
- The password is set when the volume is first initialised. Changing `.env` later does not
  change it: run `\password cctv` in `pnpm db:psql` (prompts for it, so it never lands in
  psql history or the server log), then update `.env`.

## Data safety

- `docker compose down` keeps data. **`docker compose down -v` deletes the volume** — don't.
- Migrations are append-only SQL in `migrations/NNNN_name.sql`, tracked in
  `schema_migrations` with a sha256 checksum. Editing an applied file makes `db:migrate`
  abort. To change the schema, add a new file.
- Foreign keys use `ON DELETE RESTRICT`: a project with sites or cameras cannot be
  hard-deleted by accident.

## Schema (0001_init)

```
projects 1 ──< sites 1 ──< camera_points
    1 ─────────────────────< camera_points   (site_id optional)
```

| Table           | Geometry columns (SRID 4326)                    | Notes                                                                                     |
| --------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `projects`      | `location Point` (optional)                     | status ∈ `PROJECT_STATUSES`                                                               |
| `sites`         | `location Point`, `boundary Polygon` (optional) | name unique per project                                                                   |
| `camera_points` | `location Point` (required)                     | label unique per project; composite FK ensures `site_id` belongs to the same `project_id` |

- Columns mirror `packages/shared` (`camelCase` ↔ `snake_case`). Enum lists and numeric
  ranges are `CHECK` constraints that match the zod schemas. Keep both in sync when you
  change either one.
- Coordinates must be within WGS84 bounds (`is_wgs84()`), so swapped lat/lng is rejected
  for Thailand. PostGIS stores `(x, y) = (lng, lat)`.
- GIST indexes on every geometry column. `updated_at` is maintained by a trigger.
- Map views `project_map_v`, `site_map_v`, `camera_point_map_v` expose `lat`, `lng` and
  GeoJSON (`[lng, lat]`), ready for the web map.

Example: cameras within 50 m of a point:

```sql
SELECT label, lat, lng FROM camera_point_map_v
WHERE ST_DWithin(ST_MakePoint(lng, lat)::geography,
                 ST_MakePoint(100.5018, 13.7563)::geography, 50);
```

`init/` is intentionally unused: mounting it would replace the image's own PostGIS init
script. Extensions are created by the migrations instead.

## Schema (0002_auth)

| Table           | Notes                                                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`         | `username` unique, lower-case `^[a-z0-9._-]{3,32}$`; `password_hash` must be Argon2id (`CHECK`); `role` ∈ admin/surveyor/viewer; never deleted — `is_active = false` |
| `user_sessions` | one row per login; `id` = JWT `jti`; valid while `revoked_at IS NULL AND expires_at > now()`                                                                         |

Create the first admin with `pnpm user:create-admin <username>` (password prompted, never an argument).
Expired and revoked session rows are kept for now; a cleanup job can be added later.

## Roles (0003_app_role)

| Role       | Used by                                 | Privileges                                                                                                                                   |
| ---------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `cctv`     | migrations, `pnpm db:psql`, backups     | superuser and owner of all objects (`POSTGRES_USER`)                                                                                         |
| `cctv_app` | the API (once compose is switched over) | `CONNECT`; `USAGE` on `public`; CRUD on `projects`, `sites`, `camera_points`; `SELECT/INSERT/UPDATE` on `users`, `user_sessions` (no DELETE) |

- `cctv_app` is `NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOBYPASSRLS`, max 20 connections,
  `statement_timeout = 15s`, `idle_in_transaction_session_timeout = 30s`. It has no access to
  `schema_migrations` and cannot create objects, use `TEMP`, `COPY` to/from files or programs.
- The migration revokes all `PUBLIC` privileges on the database it runs in: only `cctv` and
  `cctv_app` can connect.
- No password in the migration. Set it once per cluster with `\password cctv_app` in
  `pnpm db:psql` (prompted, hashed as SCRAM before it is sent), then store it in `.env`.
  Until then `cctv_app` cannot log in over TCP.
- Roles are cluster-wide: running `pnpm db:test` applies 0003 to `cctv_survey_test` and so
  creates `cctv_app` in the same cluster as `cctv_survey` (without granting anything there).
- Tables added by later migrations get no access by default: grant `cctv_app` explicitly in the
  migration that creates them.
