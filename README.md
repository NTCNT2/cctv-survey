# CCTV Site Survey & Design

ระบบสำรวจหน้างานและออกแบบตำแหน่งติดตั้งกล้องวงจรปิด

| ส่วน                   | เทคโนโลยี                                | Path              |
| ---------------------- | ---------------------------------------- | ----------------- |
| Web / Dashboard        | Next.js 16 (App Router) + Tailwind 4     | `apps/web`        |
| Backend API            | NestJS 12 (ESM)                          | `apps/api`        |
| Shared types / schemas | TypeScript + zod                         | `packages/shared` |
| Database               | PostgreSQL 18 + PostGIS 3.6              | `infra/db`        |
| Deploy                 | Docker Compose + reverse proxy (Phase 7) | `infra/`          |

## Requirements

- Node.js >= 22.13 (`.nvmrc`), pnpm 12
- Docker Engine + Compose v2 + Buildx

## Getting started

```bash
cp .env.example .env      # then edit values — never commit .env (set JWT_SECRET: openssl rand -base64 48)
pnpm install
pnpm db:up && pnpm db:migrate   # PostgreSQL + PostGIS on 127.0.0.1:5432 — see infra/db/README.md
pnpm user:create-admin <username>   # first admin; the password is prompted, never passed as an argument
pnpm dev                  # web: http://127.0.0.1:3000  (API on 127.0.0.1:4000, reached via /api)
```

Dev servers bind to `127.0.0.1` only. From another computer, tunnel **only the web port** —
the browser reaches the API through the web app's own `/api` path:

```bash
ssh -L 3000:127.0.0.1:3000 surveyadmin@<server>   # then open http://127.0.0.1:3000
```

Phones: use browser device emulation for now; real-phone testing waits for HTTPS (Phase 7).

## Scripts (root)

| Command                             | Description                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm dev`                          | build `@cctv/shared`, then run all apps in watch mode                                    |
| `pnpm build`                        | build all packages (topological order)                                                   |
| `pnpm lint`                         | ESLint (web) / oxlint (api, shared)                                                      |
| `pnpm typecheck`                    | TypeScript type check for all packages                                                   |
| `pnpm test`                         | unit tests (api: vitest)                                                                 |
| `pnpm format`                       | Prettier                                                                                 |
| `pnpm db:*`                         | database: up / stop / migrate / status / verify / psql / test — see `infra/db/README.md` |
| `pnpm test:e2e:web`                 | browser tests (Playwright, Chromium) against the test DB — see below                     |
| `pnpm user:create-admin <username>` | create an admin account (hidden password prompt)                                         |

## API (Phase 4)

All routes are under `/api`, bodies are JSON (other content types get `415`) and validated with
the zod schemas in `packages/shared`. Every route except health and login/logout requires a
session — see [Authentication](#authentication-phase-5).

| Method + path                       | Description                                  |
| ----------------------------------- | -------------------------------------------- |
| `GET /projects?limit=&offset=`      | newest first (limit 1–500, default 100)      |
| `POST /projects`                    | create                                       |
| `GET/PATCH/DELETE /projects/:id`    | read / partial update / delete               |
| `GET /projects/:id/sites`           | sites of a project                           |
| `GET /projects/:id/cameras?siteId=` | camera points of a project (optional filter) |
| `POST /sites`, `POST /cameras`      | create (`projectId` in the body)             |
| `GET/PATCH/DELETE /sites/:id`       | read / partial update / delete               |
| `GET/PATCH/DELETE /cameras/:id`     | read / partial update / delete               |

- PATCH: send only the fields to change; `null` clears an optional field. `projectId` cannot change.
- Errors: `400` validation / unknown `projectId` or `siteId` / invalid polygon, `404` not found,
  `409` duplicate name or label, or deleting a project/site that still has sites or cameras.
- Tests: `pnpm --filter @cctv/api test` (unit) and `pnpm db:test && pnpm --filter @cctv/api test:e2e`
  (runs against the separate `cctv_survey_test` database with a random `JWT_SECRET`, never the dev
  database or the real secret).

## Authentication (Phase 5)

| Method + path                    | Access    | Description                                                |
| -------------------------------- | --------- | ---------------------------------------------------------- |
| `POST /auth/login`               | public    | `{ username, password }` → sets the session cookie         |
| `POST /auth/logout`              | public    | revokes the session, clears the cookie                     |
| `GET /auth/me`                   | signed in | current user `{ id, username, displayName, role }`         |
| `POST /auth/change-password`     | signed in | `{ currentPassword, newPassword }`; signs out all sessions |
| `GET/POST /users`                | admin     | list / create users                                        |
| `GET/PATCH /users/:id`           | admin     | read / change `displayName`, `role`, `isActive`            |
| `POST /users/:id/reset-password` | admin     | `{ newPassword }`; signs out all of the user's sessions    |

**Permissions** (single source: `ROLE_PERMISSIONS` / `can()` in `packages/shared/src/auth.ts`)

| Action                                 | viewer | surveyor | admin |
| -------------------------------------- | :----: | :------: | :---: |
| read projects / sites / cameras        |   ✅   |    ✅    |  ✅   |
| create / edit projects, sites, cameras |   —    |    ✅    |  ✅   |
| delete sites, cameras                  |   —    |    ✅    |  ✅   |
| delete projects                        |   —    |    —     |  ✅   |
| manage users                           |   —    |    —     |  ✅   |

- **Session**: an HS256 JWT in the `cctv_session` cookie (`HttpOnly`, `SameSite=Strict`,
  `Path=/api`, `Secure` unless `COOKIE_SECURE` is exactly `false`; unset or any other value keeps
  it on, also in production). It is never returned in a response body and `Authorization: Bearer` is
  not accepted. Lifetime `JWT_EXPIRES_IN` (default 8h). A new login revokes the session the
  browser already had.
- Every request re-checks the session row (`user_sessions`) and the user: logout, password
  change/reset and deactivation take effect immediately, and the role is read from the database.
- **Passwords**: Argon2id (19 MiB, t=2, p=1), 12–128 characters, not equal to the username. Unknown
  users, wrong passwords and inactive accounts all get the same `401`.
- **Throttling** (`429`), per minute: login 5 per IP + username, 10 per username from any
  address, 100 per IP (burst guard only — all traffic may come from one proxy address, so
  guessing other usernames never locks everyone out); change-password 5 per user. Override with
  `LOGIN_LIMIT_PER_ACCOUNT`, `LOGIN_LIMIT_PER_USERNAME`, `LOGIN_LIMIT_PER_IP`,
  `PASSWORD_CHANGE_LIMIT`.
- The API refuses to start if `JWT_SECRET` is missing, shorter than 32 bytes or a placeholder.
- The last active admin cannot be demoted or deactivated. Users are deactivated, never deleted.
  Admins reset other users' passwords; their own goes through `change-password`.
- Not yet: per-project access (every user sees every project) — planned as its own phase.
- Access rules are default-deny: a new route without `@Public()`, `@Authenticated()` or
  `@RequirePermission()` returns `403` (and fails the `route-access` unit test).

## Web app (Phase 6)

```
browser ──> Next.js 127.0.0.1:3000 ──(rewrite /api/*)──> NestJS 127.0.0.1:4000 ──> PostgreSQL
```

- **Same origin**: the web app calls `/api/*`, which `next.config.ts` rewrites to
  `API_INTERNAL_URL` (default `http://127.0.0.1:4000`, server-side only, fixed at build time).
  The API stays on loopback, CORS is not involved, and the HttpOnly session cookie
  (`Path=/api`) is never readable by page scripts. No token or secret is in client code.
- **Session**: signed-in pages ask `GET /api/auth/me`; any `401` sends the user to `/login`
  (full page load, so no cached data survives). The API remains the only authority on
  permissions — the UI just hides buttons with `can()` from `packages/shared`.
- **Pages**: `/login`, `/projects` (paged), `/projects/new`, `/projects/[id]` (cameras + sites),
  `/projects/[id]/edit`, `/projects/[id]/sites/new`, `/sites/[id]/edit`,
  `/projects/[id]/cameras/new`, `/cameras/[id]/edit`, `/account/password`.
- Forms validate with the same zod schemas as the API (Thai messages). Coordinates are typed
  (map picking comes with the map phase); “use my location” needs HTTPS or `127.0.0.1`.
- Not yet: user management UI (use `pnpm user:create-admin` / the API), per-project access (S7).

**Tests**

| Command                        | What                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @cctv/web test` | unit tests (vitest): API client, errors, form helpers                                                             |
| `pnpm test:e2e:web`            | Playwright on this server: API → `cctv_survey_test`, web build on `127.0.0.1:3100`, test users seeded and removed |

`pnpm test:e2e:web` needs Chromium once: `pnpm --filter @cctv/web exec playwright install chromium`
plus its system libraries (`sudo apt-get install libasound2t64 libatk1.0-0t64
libatk-bridge2.0-0t64 libatspi2.0-0t64 libxdamage1 fonts-thai-tlwg` on Ubuntu 24.04).

## Production containers (Phase 7)

```
Caddy prod-proxy ──prod-edge──> prod-web ──prod-app (internal)──> prod-api ──backend──> db
127.0.0.1:9443 (TLS)            :3000      /api/* rewrite         :4000 as cctv_app     existing
192.168.77.20:80 (HTTP)  ← router NAT <WAN>:5580
```

`compose.prod.yaml` adds `prod-api`, `prod-web`, `prod-proxy` (profile `prod`) on top of
`compose.yaml`. Run it only through `scripts/prod.sh` (`check | build | up | status | logs | stop`):
it never runs `down`, never removes containers or volumes, never recreates `db` (`up` uses
`--no-deps` and fails if `cctv-survey-db-1` changed) and runs no migrations.

- **Database role**: the API connects as `cctv_app` (migration 0003), never as `cctv`. Compose
  sets `DATABASE_URL=postgresql://cctv_app@db:5432/…` with no password and passes
  `APP_DB_PASSWORD` as `PGPASSWORD` (node-postgres reads it). `DATABASE_URL` in `.env` stays
  `cctv` for host tools. Migrations stay manual: `pnpm db:migrate`.
- **Secrets / settings** in `.env` (see `.env.example`): `APP_DB_PASSWORD`, `PROD_JWT_SECRET`
  (separate from the dev `JWT_SECRET`), `PROD_SITE_HOST`, `PROD_CORS_ORIGIN`. Compose refuses to
  start if any is empty; the API refuses a placeholder JWT secret.
- **Cookies (TEMPORARY)**: `compose.prod.yaml` sets `COOKIE_SECURE: 'false'` for `prod-api` so
  login works over plain HTTP; the API logs a warning at startup. The session cookie (and the
  password at login) then travels **unencrypted**. Set it back to `'true'` as soon as the site is
  served over HTTPS. Without that explicit `false` the cookie is always `Secure`.
  `COOKIE_SECURE=false` in `.env` only affects local `http://` development (the prod container
  does not read `.env`).
- **Network**: `prod-api` and `prod-web` publish no ports; Caddy reaches only `prod-web`, which
  forwards `/api/*` to `prod-api` on the internal `prod-app` network. `prod-api` shares the
  existing `backend` network with `db` (making it internal would recreate `db`).
- **Access (current)**:
  - Internet / LAN, plain HTTP: `http://<WAN>:5580` through the router's NAT to
    `192.168.77.20:80` (published on the LAN IP only, never `0.0.0.0`), or `http://192.168.77.20`
    inside the LAN. Caddy's `http://:8080` site accepts any host and sends no HSTS.
  - HTTPS, loopback only: `127.0.0.1:9443`, Caddy internal CA (`infra/proxy/Caddyfile.prod`).
    From a laptop: `ssh -L 9443:127.0.0.1:9443 surveyadmin@<server>`, then
    `https://127.0.0.1:9443`.
  - Next step: HTTPS for the public address (domain + ACME, or TLS on the NAT'd port), then
    `COOKIE_SECURE: 'true'` again. Both are reviewed changes to `compose.prod.yaml` /
    `Caddyfile.prod`.
- **Survey map** (`/projects/[id]/map`): Google Maps JavaScript API with Advanced Markers when
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (+ `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`) is set in the web
  container's environment (read per request, no rebuild). In production a missing setting or a key
  Google rejects shows a clear error on the map page — never a silent switch; Leaflet +
  OpenStreetMap is a development-only fallback (`next dev`). GPS is optional: points can always be placed by tapping the map
  (geolocation itself only works over HTTPS or on localhost).
- **Restart**: all services `restart: unless-stopped` (they come back after a host reboot).
- **Rollback**: `scripts/prod.sh stop` stops only the three prod services; `db`, `pgdata` and
  `caddy_prod_*` volumes are untouched. Never `docker compose down -v`. To remove the files,
  `git revert` the commit. Data problems: restore the backup taken before go-live.

## Layout

```
apps/web          Next.js frontend
apps/api          NestJS backend (global prefix /api)
packages/shared   types, enums, zod schemas shared by web + api
infra/docker      Dockerfiles (Phase 7)
infra/proxy       reverse proxy config (Phase 7)
infra/db          migrations + verify.sql (compose.yaml at repo root)
scripts/          db.sh (migrate/verify), stack.sh (test stack), prod.sh (prod containers), backup.sh (db backups), offsite-*.{sh,py} (off-site backups)
data/             runtime data — git-ignored
```
