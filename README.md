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
pnpm dev                  # web: http://127.0.0.1:3000  api: http://127.0.0.1:4000/api/health
```

Dev servers bind to `127.0.0.1` only. From another machine use an SSH tunnel:

```bash
ssh -L 3000:127.0.0.1:3000 -L 4000:127.0.0.1:4000 surveyadmin@<server>
```

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
  `Path=/api`, `Secure` unless `COOKIE_SECURE=false` — and always `Secure` when
  `NODE_ENV=production`). It is never returned in a response body and `Authorization: Bearer` is
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

## Layout

```
apps/web          Next.js frontend
apps/api          NestJS backend (global prefix /api)
packages/shared   types, enums, zod schemas shared by web + api
infra/docker      Dockerfiles (Phase 7)
infra/proxy       reverse proxy config (Phase 7)
infra/db          migrations + verify.sql (compose.yaml at repo root)
scripts/          db.sh (migrate/verify); backup / restore (Phase 8)
data/             runtime data — git-ignored
```
