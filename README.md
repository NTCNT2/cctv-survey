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
cp .env.example .env      # then edit values — never commit .env
pnpm install
pnpm db:up && pnpm db:migrate   # PostgreSQL + PostGIS on 127.0.0.1:5432 — see infra/db/README.md
pnpm dev                  # web: http://127.0.0.1:3000  api: http://127.0.0.1:4000/api/health
```

Dev servers bind to `127.0.0.1` only. From another machine use an SSH tunnel:

```bash
ssh -L 3000:127.0.0.1:3000 -L 4000:127.0.0.1:4000 surveyadmin@<server>
```

## Scripts (root)

| Command          | Description                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `pnpm dev`       | build `@cctv/shared`, then run all apps in watch mode                                    |
| `pnpm build`     | build all packages (topological order)                                                   |
| `pnpm lint`      | ESLint (web) / oxlint (api, shared)                                                      |
| `pnpm typecheck` | TypeScript type check for all packages                                                   |
| `pnpm test`      | unit tests (api: vitest)                                                                 |
| `pnpm format`    | Prettier                                                                                 |
| `pnpm db:*`      | database: up / stop / migrate / status / verify / psql / test — see `infra/db/README.md` |

## API (Phase 4)

All routes are under `/api`, bodies are JSON and validated with the zod schemas in
`packages/shared`. No authentication yet — the API only listens on `127.0.0.1`.

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
  (runs against the separate `cctv_survey_test` database, never the dev database).

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
