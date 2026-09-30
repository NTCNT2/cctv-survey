#!/usr/bin/env bash
# Database helper for the compose `db` service (PostgreSQL + PostGIS).
#
#   scripts/db.sh migrate   apply pending infra/db/migrations/*.sql (append-only)
#   scripts/db.sh status    list applied / pending migrations
#   scripts/db.sh verify    check port binding + run infra/db/verify.sql (rolled back)
#   scripts/db.sh psql      interactive psql shell
#
# Runs psql inside the container with the container's own POSTGRES_* env, so no
# credentials are needed on the host command line. Nothing here drops or
# truncates data: each migration runs in one transaction and is recorded in
# schema_migrations with a sha256 checksum; an applied file that was later
# edited aborts the run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
MIG_DIR=infra/db/migrations
LOCK_ID=727274 # arbitrary advisory-lock key, serialises concurrent runners

die() { echo "error: $*" >&2; exit 1; }

psql_db() {
  # shellcheck disable=SC2016 # expanded inside the container
  docker compose exec -T db sh -c \
    'exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' psql "$@"
}

require_db() {
  docker compose ps --status running --services 2>/dev/null | grep -qx db \
    || die "db is not running — start it with: pnpm db:up"
}

ensure_migrations_table() {
  psql_db <<'SQL'
SET client_min_messages = warning;
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    text PRIMARY KEY,
  checksum   text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL
}

# Prints "version<TAB>checksum" for every applied migration.
applied() {
  psql_db -At -F $'\t' -c 'SELECT version, checksum FROM schema_migrations ORDER BY version'
}

migration_files() {
  local f
  for f in "$MIG_DIR"/*.sql; do
    [[ -e $f ]] || continue
    [[ $(basename "$f") =~ ^[0-9]{4}_[a-z0-9_]+\.sql$ ]] \
      || die "bad migration filename: $f (expected NNNN_name.sql)"
    echo "$f"
  done
}

cmd_status() {
  require_db
  ensure_migrations_table
  declare -A done=()
  local v s f
  while IFS=$'\t' read -r v s; do [[ -n $v ]] && done[$v]=$s; done < <(applied)
  while read -r f; do
    v=$(basename "$f" .sql)
    s=$(sha256sum "$f" | cut -d' ' -f1)
    if [[ -z ${done[$v]:-} ]]; then echo "pending   $v"
    elif [[ ${done[$v]} != "$s" ]]; then echo "MODIFIED  $v (checksum differs from applied)"
    else echo "applied   $v"
    fi
    unset "done[$v]"
  done < <(migration_files)
  for v in "${!done[@]}"; do echo "MISSING   $v (applied in DB, file not found)"; done
}

cmd_migrate() {
  require_db
  ensure_migrations_table
  declare -A done=()
  local v s f n=0
  while IFS=$'\t' read -r v s; do [[ -n $v ]] && done[$v]=$s; done < <(applied)
  while read -r f; do
    v=$(basename "$f" .sql)
    s=$(sha256sum "$f" | cut -d' ' -f1)
    if [[ -n ${done[$v]:-} ]]; then
      [[ ${done[$v]} == "$s" ]] \
        || die "$v was already applied but the file has changed. Never edit applied migrations — add a new one."
      continue
    fi
    echo "applying  $v"
    {
      echo "SET LOCAL client_min_messages = warning;"
      echo "SELECT pg_advisory_xact_lock($LOCK_ID);"
      cat "$f"
      printf "\nINSERT INTO schema_migrations (version, checksum) VALUES ('%s', '%s');\n" "$v" "$s"
    } | psql_db --single-transaction >/dev/null
    n=$((n + 1))
  done < <(migration_files)
  echo "done: $n migration(s) applied"
}

cmd_verify() {
  require_db
  local id bindings
  id=$(docker compose ps -q db)
  bindings=$(docker inspect -f \
    '{{range $p, $b := .NetworkSettings.Ports}}{{range $b}}{{$p}}={{.HostIp}}:{{.HostPort}} {{end}}{{end}}' "$id")
  echo "port bindings: ${bindings:-<none>}"
  for b in $bindings; do
    [[ ${b#*=} == 127.0.0.1:* ]] || die "db port is published on a non-loopback address: $b"
  done
  psql_db -v ON_ERROR_STOP=1 < infra/db/verify.sql
}

cmd_psql() {
  # shellcheck disable=SC2016
  exec docker compose exec db sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
}

case "${1:-}" in
  migrate) cmd_migrate ;;
  status) cmd_status ;;
  verify) cmd_verify ;;
  psql) cmd_psql ;;
  *) echo "usage: $0 {migrate|status|verify|psql}" >&2; exit 2 ;;
esac
