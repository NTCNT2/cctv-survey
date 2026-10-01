# syntax=docker/dockerfile:1
# NestJS API image (Phase 7). Build context = repo root:
#   bash scripts/stack.sh build
# No secrets are baked in: DATABASE_URL / JWT_SECRET come from the runtime env.
ARG NODE_IMAGE=node:22.23-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c

FROM ${NODE_IMAGE} AS base
ENV CI=true
RUN corepack enable && corepack prepare pnpm@12.8.1 --activate
WORKDIR /repo
# All workspace manifests, so the frozen lockfile matches; the filter below
# still installs only what the API needs.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

FROM base AS build
RUN pnpm install --frozen-lockfile --filter "@cctv/api..."
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @cctv/shared build && pnpm --filter @cctv/api build

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter "@cctv/api..."

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
# Same layout as the repo: pnpm's node_modules are relative symlinks
# (e.g. apps/api/node_modules/@cctv/shared -> ../../packages/shared).
WORKDIR /app
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
WORKDIR /app/apps/api
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
