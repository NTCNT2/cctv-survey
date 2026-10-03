#!/usr/bin/env bash
# Production container services (compose.prod.yaml, profile "prod").
#   scripts/prod.sh check | build | up | status | logs [service] | stop
# Safety: acts only on prod-api, prod-web, prod-proxy. Never `down`, never
# --remove-orphans, never removes containers or volumes, never recreates `db`
# (`up` uses --no-deps and fails if cctv-survey-db-1 changed). No migrations.
# Nothing here prints secrets: `check` reads the config without interpolation.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
SERVICES=(prod-api prod-web prod-proxy)
compose() { docker compose -f compose.yaml -f compose.prod.yaml --profile prod "$@"; }
db_mark() { docker inspect -f '{{.Id}} {{.State.StartedAt}}' cctv-survey-db-1 2>/dev/null || echo absent; }

# Refuses a config that would expose more than intended or touch the existing db.
check() {
  local base merged
  base=$(docker compose -f compose.yaml config --no-interpolate --format json)
  merged=$(compose config --no-interpolate --format json)
  BASE="$base" MERGED="$merged" node --input-type=module <<'JS'
const base = JSON.parse(process.env.BASE);
const cfg = JSON.parse(process.env.MERGED);
const s = cfg.services;
const errors = [];
// db publishes '127.0.0.1:${POSTGRES_PORT...}' (string), prod-proxy an object.
const allowPorts = { db: /^127\.0\.0\.1(:|$)/, 'prod-proxy': /^127\.0\.0\.1$/ };
for (const [name, svc] of Object.entries(s)) {
  // The stacktest services are checked by scripts/check-compose.mjs.
  if (svc.profiles?.includes('stacktest')) continue;
  for (const p of svc.ports ?? []) {
    const host = typeof p === 'string' ? p : (p.host_ip ?? '');
    if (!allowPorts[name]?.test(host)) {
      errors.push(`${name} publishes a port on "${host || 'ALL interfaces'}"`);
    }
  }
}
for (const name of ['prod-api', 'prod-web', 'prod-proxy']) {
  if (!s[name]) errors.push(`service ${name} is missing`);
  if (s[name]?.restart !== 'unless-stopped') errors.push(`${name} must use restart: unless-stopped`);
  for (const v of s[name]?.volumes ?? []) {
    if (v.type === 'volume' && v.source === 'pgdata') errors.push(`${name} must not mount "pgdata"`);
  }
}
for (const name of ['prod-api', 'prod-web']) {
  if (s[name]?.ports?.length) errors.push(`${name} must not publish ports`);
}
const nets = (name) => Object.keys(s[name]?.networks ?? {}).sort().join(',');
if (nets('prod-api') !== 'backend,prod-app') errors.push(`prod-api networks must be backend,prod-app (got ${nets('prod-api')})`);
if (nets('prod-web') !== 'prod-app,prod-edge') errors.push(`prod-web networks must be prod-app,prod-edge (got ${nets('prod-web')})`);
if (nets('prod-proxy') !== 'prod-edge') errors.push(`prod-proxy networks must be prod-edge only (got ${nets('prod-proxy')})`);
if (cfg.networks?.['prod-app']?.internal !== true) errors.push('network "prod-app" must be internal: true');
const env = s['prod-api']?.environment ?? {};
if (env.NODE_ENV !== 'production') errors.push('prod-api must set NODE_ENV=production');
if (!/^postgresql:\/\/cctv_app@db:5432\//.test(env.DATABASE_URL ?? '')) {
  errors.push('prod-api DATABASE_URL must be postgresql://cctv_app@db:5432/... (role cctv_app, no password in the URL)');
}
if (!/^\$\{APP_DB_PASSWORD:\?/.test(env.PGPASSWORD ?? '')) errors.push('prod-api PGPASSWORD must come from ${APP_DB_PASSWORD:?...}');
if (!/^\$\{PROD_JWT_SECRET:\?/.test(env.JWT_SECRET ?? '')) errors.push('prod-api JWT_SECRET must come from ${PROD_JWT_SECRET:?...}');
// The overlay must not change the existing db service in any way.
if (JSON.stringify(s.db) !== JSON.stringify(base.services.db)) errors.push('compose.prod.yaml changes the existing "db" service');
if (errors.length) {
  console.error('prod compose check FAILED:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log('prod compose check OK: api as cctv_app (password via PGPASSWORD), only db + prod-proxy publish ports (127.0.0.1), prod-app internal, db unchanged, no pgdata mounts');
JS
}

case "${1:-}" in
  check) check ;;
  build)
    check
    compose build "${SERVICES[@]}" ;;
  up)
    check
    before=$(db_mark)
    [[ $before != absent ]] || { echo "error: cctv-survey-db-1 is not running (pnpm db:up)" >&2; exit 1; }
    compose up -d --no-build --no-deps --wait "${SERVICES[@]}"
    [[ "$(db_mark)" == "$before" ]] || { echo "error: cctv-survey-db-1 changed!" >&2; exit 1; }
    echo "db untouched: $before"
    ss -Hltn | awk '$4 ~ /:9443$/ {print "listening:", $4}' ;;
  status)
    compose ps "${SERVICES[@]}"
    # Which roles the containers use (expect cctv_app only from the API).
    docker exec cctv-survey-db-1 psql -X -q -U cctv -d postgres -c \
      "SELECT usename, datname, count(*) FROM pg_stat_activity WHERE client_addr IS NOT NULL GROUP BY 1, 2" ;;
  logs) compose logs --no-color --tail=200 "${2:-prod-proxy}" ;;
  stop) compose stop "${SERVICES[@]}" ;; # containers kept; db and volumes untouched
  *) echo "usage: $0 {check|build|up|status|logs [svc]|stop}" >&2; exit 2 ;;
esac
