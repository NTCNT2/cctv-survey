#!/usr/bin/env bash
# Loopback-only container stack for Phase 7 testing (compose profile "stacktest").
#   scripts/stack.sh build | up | status | logs [service] | stop
# Safety: acts only on stacktest-db, api, web, proxy. Never `down`, never
# removes containers or volumes, never touches `db` / `pgdata`. Every `up`
# gets a fresh throwaway database (tmpfs) and fresh random secrets.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
SERVICES=(stacktest-db api web proxy)
compose() { docker compose --profile stacktest "$@"; }
db_mark() { docker inspect -f '{{.Id}} {{.State.StartedAt}}' cctv-survey-db-1 2>/dev/null || echo absent; }

case "${1:-}" in
  build)
    node scripts/check-compose.mjs
    compose build api web proxy ;;
  up)
    node scripts/check-compose.mjs
    before=$(db_mark)
    # Secrets live only in this process's environment (never written to disk).
    STACKTEST_DB_PASSWORD=$(openssl rand -hex 24)
    STACKTEST_JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n=+/')
    export STACKTEST_DB_PASSWORD STACKTEST_JWT_SECRET
    compose up -d --no-build --no-deps --wait "${SERVICES[@]}"
    [[ "$(db_mark)" == "$before" ]] || { echo "error: cctv-survey-db-1 changed!" >&2; exit 1; }
    echo "db untouched: $before"
    ss -Hltn | awk '$4 ~ /:(8443|8080)$/ {print "listening:", $4}' ;;
  status) compose ps "${SERVICES[@]}" ;;
  logs) compose logs --no-color --tail=200 "${2:-proxy}" ;;
  stop) compose stop "${SERVICES[@]}" ;; # containers kept; volumes untouched
  *) echo "usage: $0 {build|up|status|logs [svc]|stop}" >&2; exit 2 ;;
esac
