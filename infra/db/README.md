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

| Role       | Used by                             | Privileges                                                                                                                                                                                                                                                 |
| ---------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cctv`     | migrations, `pnpm db:psql`, backups | superuser and owner of all objects (`POSTGRES_USER`)                                                                                                                                                                                                       |
| `cctv_app` | `prod-api` (`compose.prod.yaml`)    | `CONNECT`; `USAGE` on `public`; CRUD on `projects`, `sites`, `camera_points`; `SELECT/INSERT/UPDATE` on `camera_models` (no DELETE: deactivate); `SELECT/INSERT/DELETE` on `camera_photos`; `SELECT/INSERT/UPDATE` on `users`, `user_sessions` (no DELETE) |

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

### Cluster-level database ACLs (one-off, not a migration)

Migrations run per database, so they cannot lock down the cluster's other databases. Without
this, `cctv_app` could connect to `postgres`, `template1` and `template_postgis` through the
default `PUBLIC` grants (and use `TEMP` in `postgres` and `template_postgis`). Run once per
cluster as `cctv` (applied to the current cluster on 2026-10-03):

```sql
-- docker exec -i cctv-survey-db-1 psql -X -U cctv -d postgres
REVOKE CONNECT, TEMP ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT, TEMP ON DATABASE template_postgis FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
```

| Database           | `cctv_app` CONNECT | `cctv_app` TEMP | Source                         |
| ------------------ | ------------------ | --------------- | ------------------------------ |
| `cctv_survey`      | yes                | no              | 0003 (`pnpm db:migrate`)       |
| `cctv_survey_test` | yes                | no              | 0003 (`pnpm db:test`)          |
| `postgres`         | no                 | no              | REVOKE above                   |
| `template1`        | no                 | no              | REVOKE above                   |
| `template_postgis` | no                 | no              | REVOKE above                   |
| `template0`        | no                 | no              | `datallowconn = false` already |

- `cctv` is a superuser and skips these checks, so `pnpm db:psql`, migrations, backups and
  `CREATE DATABASE` (which copies `template1` without connecting to it) keep working. The
  `pg_isready` healthcheck does not log in. New databases do not inherit the template's ACL.
- These ACLs are not in the `cctv_survey` dump or the globals file: re-run the block above after
  restoring into a new cluster.
- Check: `SELECT datname, datacl FROM pg_database ORDER BY 1;`
- Undo: `GRANT CONNECT, TEMP ON DATABASE <db> TO PUBLIC;` (`template1`: `CONNECT` only).

## Backups

`scripts/backup.sh` backs up the production database `cctv_survey`:
`run` (cron) · `offsite` (cron) · `check` (cron) · `test` (manual) · `verify [TS] [DIR]` · `list`.

| What         | Where / how                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Location     | `~/backups/cctv-survey/auto/{daily,weekly,test}/` (outside the repo, dirs `0700`, files `0600`); log `auto/backup.log`    |
| Set per run  | `cctv_survey_<TS>.dump` (`pg_dump -Fc`), `globals_<TS>.sql` (`--no-role-passwords`), `counts_<TS>.txt`, `SHA256SUMS_<TS>` |
| Schedule     | user crontab (`umask 077`): `run` daily 19:17 UTC (02:17 Bangkok), `check` daily 19:47 UTC; stderr → `auto/cron.err`      |
| Retention    | 14 daily + 8 weekly (Sunday's set, hard-linked) + 5 test. Only complete sets in `auto/` are pruned                        |
| Restore test | part of every `run`/`test`: throwaway `postgis/postgis:18-3.6` (`--network none`, tmpfs, `--rm`); row counts + md5 match  |

- A set counts as a backup only after the full restore test passed; then `run` writes
  `auto/LAST_OK`. On any failure the set (incl. `*.partial`) is removed, `ERROR` is logged and
  the exit code is non-zero.
- `check` fails (ERROR in `backup.log` and `cron.err`) unless `LAST_OK` names the newest daily
  set, its checksums match and it is less than 26 h old.
- `test` writes to `auto/test/` only: it never updates `LAST_OK` and never counts as a
  production backup.
- Dumps run inside `cctv-survey-db-1` over its local socket: no password is used or logged.
  `run` refuses to keep a dump that `pg_restore -l` cannot read or whose globals contain a
  password hash. `counts_<TS>.txt` holds per-table row counts and md5 of the rows.
- Manual backups directly in `~/backups/cctv-survey/` are never pruned.
- Off-site copies: see [Off-site backups](#off-site-backups) below.
- Restore into production only after an incident, with the API stopped (`scripts/prod.sh stop`).
  Role passwords are not in the backup: on a new cluster set `\password cctv_app` again, then
  re-apply the cluster-level ACLs above.

```bash
scripts/backup.sh verify <TS>    # prove the set restores cleanly first
docker exec -i cctv-survey-db-1 pg_restore -U cctv -d cctv_survey --clean --if-exists \
  --exit-on-error < ~/backups/cctv-survey/auto/daily/cctv_survey_<TS>.dump
```

### Off-site backups

Every night `scripts/backup.sh offsite` sends the last verified set (`LAST_OK`) to
Backblaze B2, encrypted, so a lost or compromised server does not take the backups with it.

| What       | Where / how                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| Object     | `sets/cctv-survey-<TS>.tar.gpg` (tar of the whole set, gpg public-key encrypted) + `.sha256` of the ciphertext |
| Config     | `~/.config/cctv-backup/` (0700): `rclone.conf` (B2 key, 0600), `offsite.pub.asc` (public key), `target`        |
| Tools      | `~/.local/bin/rclone` (official release, signature + SHA256 checked), system `gpg`                             |
| Schedule   | user crontab: `offsite` daily 19:37 UTC, between `run` (19:17) and `check` (19:47)                             |
| Check      | `check` fails unless `auto/OFFSITE_LAST_OK` equals `LAST_OK` (only once `target` exists)                       |
| Retention  | B2 bucket: Object Lock governance 90 days, lifecycle hides after 90 days and deletes 1 day later               |
| Server key | bucket-only, `listBuckets listFiles readFiles writeFiles` — **no `deleteFiles`**                               |

- This server has only the **public** key: it can encrypt but never decrypt. The private
  key and its passphrase are kept by the owner in two places off this server. **If the
  private key is lost, no off-site backup can be restored.**
- After the upload the remote SHA-1 must equal the local one. A set is never uploaded twice;
  if its object exists but `OFFSITE_LAST_OK` does not name it, `offsite` refuses.
- A compromised server cannot remove or overwrite off-site copies: its key cannot delete, and
  Object Lock keeps every file version for 90 days.

One-time setup (run by the owner in an SSH terminal; secrets are typed, never stored in the repo):

```bash
scripts/offsite-keygen.sh                 # key pair; private key -> ~/cctv-offsite-PRIVATE-KEY-<id>.asc
python3 -I scripts/offsite-setup-b2.py    # bucket + no-delete key (asks for the B2 master key once)
scripts/backup.sh offsite                 # first upload
```

Restore from off-site (also on a new server: install rclone, recreate `rclone.conf` with a
read key and `target`, have the private key file):

```bash
scripts/offsite-restore.sh list
scripts/offsite-restore.sh fetch latest /tmp/offsite-restore --key ~/cctv-offsite-PRIVATE-KEY-<id>.asc
scripts/backup.sh verify <TS> /tmp/offsite-restore/set   # full restore test, then restore as above
```

Restore drill: run the three commands above from time to time (at least after any change to
the key or bucket) and compare the `verify` row counts with `backup.log`.
