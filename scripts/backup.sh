#!/usr/bin/env bash
# PostgreSQL backups of the production database (Phase 7).
#   scripts/backup.sh run          production backup (cron): dump cctv_survey + globals,
#                                  restore-test it, then mark it OK and prune
#   scripts/backup.sh check        fail unless a verified production backup is < 26 h old
#                                  and its checksums still match (cron, after `run`)
#   scripts/backup.sh test         same as `run`, but into auto/test/ (manual testing):
#                                  never counted as a production backup, own retention
#   scripts/backup.sh verify [TS]  restore-test a set again (default: newest daily)
#   scripts/backup.sh list         list sets
#
# Safety:
# - Read-only on production: pg_dump/pg_dumpall/psql run inside cctv-survey-db-1
#   over its local socket (no password anywhere; only sizes/counts are logged).
#   Globals are dumped with --no-role-passwords and checked for password hashes.
# - Writes only under $BACKUP_DIR/auto (default ~/backups/cctv-survey/auto),
#   directories 0700, files 0600. Retention prunes only complete sets there, by
#   exact file names; manual backups in $BACKUP_DIR itself are never touched.
# - A set counts as a backup only after a full restore test passed. On any
#   failure the set is removed (incl. *.partial), ERROR is logged, exit != 0.
# - The restore test uses a separate container: --network none, data on tmpfs,
#   --rm. It never connects to the production database.
set -Eeuo pipefail
umask 077

DB_CONTAINER=cctv-survey-db-1
DB_NAME=cctv_survey
DB_USER=cctv
IMAGE=postgis/postgis:18-3.6
BACKUP_DIR=${BACKUP_DIR:-$HOME/backups/cctv-survey}
AUTO="$BACKUP_DIR/auto"
KEEP_DAILY=${KEEP_DAILY:-14}
KEEP_WEEKLY=${KEEP_WEEKLY:-8}
KEEP_TEST=${KEEP_TEST:-5}
MAX_AGE_HOURS=${MAX_AGE_HOURS:-26}
LOG="$AUTO/backup.log"
TABLES=(projects sites camera_points users user_sessions schema_migrations)

# Row count + md5 of the rows of each application table (same query for
# production and the restore test, so a restore must reproduce the data exactly).
COUNTS_SQL="SELECT t, (xpath('/row/c/text()', x))[1]::text, (xpath('/row/m/text()', x))[1]::text FROM (
  SELECT t, query_to_xml(format('SELECT count(*) AS c, md5(coalesce(string_agg(r::text, chr(10) ORDER BY r::text), %L)) AS m FROM public.%I r', '', t), false, true, '') x
  FROM unnest(array['projects','sites','camera_points','users','user_sessions','schema_migrations']) t) q ORDER BY 1"

# State for the EXIT handler.
SET_DIR='' SET_TS='' SET_DONE=0 VERIFY_NAME='' FAILED_CMD='' ERR_LOGGED=0 RESTORE_SUMMARY=''

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >>"$LOG"; printf '%s\n' "$*"; }
die() { log "ERROR: $*"; ERR_LOGGED=1; exit 1; }

set_files() { # all files of set $2 in directory $1 (incl. partials)
  local d=$1 t=$2
  printf '%s\n' "$d/cctv_survey_$t.dump" "$d/globals_$t.sql" "$d/counts_$t.txt" "$d/SHA256SUMS_$t" \
    "$d/cctv_survey_$t.dump.partial" "$d/globals_$t.sql.partial" "$d/counts_$t.txt.partial"
}

on_err() { FAILED_CMD="line $1: $2"; }
on_exit() {
  local rc=$? f
  if [[ -n $VERIFY_NAME ]]; then docker rm -f "$VERIFY_NAME" >/dev/null 2>&1 || true; fi
  if [[ $rc != 0 ]]; then
    [[ $ERR_LOGGED == 1 ]] || log "ERROR: failed (exit $rc) at ${FAILED_CMD:-unknown}"
    # Never leave an unverified set behind (it would look like a backup).
    if [[ -n $SET_TS && $SET_DONE == 0 ]]; then
      while read -r f; do rm -f -- "$f"; done < <(set_files "$SET_DIR" "$SET_TS"; set_files "$AUTO/weekly" "$SET_TS")
      log "ERROR: removed incomplete set $(basename "$SET_DIR")/$SET_TS"
    fi
  fi
  exit "$rc"
}
trap 'on_err "$LINENO" "$BASH_COMMAND"' ERR
trap on_exit EXIT

secure_dirs() {
  mkdir -p "$AUTO/daily" "$AUTO/weekly" "$AUTO/test"
  chmod 700 "$BACKUP_DIR" "$AUTO" "$AUTO/daily" "$AUTO/weekly" "$AUTO/test"
  touch "$LOG" "$AUTO/cron.err"
  chmod 600 "$LOG" "$AUTO/cron.err"
}

newest() { # newest set timestamp in directory $1
  find "$1" -maxdepth 1 -type f -name 'cctv_survey_*Z.dump' -printf '%f\n' \
    | sed -nE 's/^cctv_survey_([0-9]{8}T[0-9]{6}Z)\.dump$/\1/p' | sort -r | head -1
}

# Keep the newest $2 complete sets in directory $1.
prune() {
  local dir=$1 keep=$2 ts f sets
  mapfile -t sets < <(find "$dir" -maxdepth 1 -type f -name 'cctv_survey_*Z.dump' -printf '%f\n' \
    | sed -nE 's/^cctv_survey_([0-9]{8}T[0-9]{6}Z)\.dump$/\1/p' | sort -r)
  for ts in "${sets[@]:$keep}"; do
    while read -r f; do rm -f -- "$f"; done < <(set_files "$dir" "$ts")
    log "pruned $(basename "$dir")/$ts"
  done
}

# Full restore of set $2 from directory $1 into a throwaway container; dies on any mismatch.
restore_test() {
  local dir=$1 ts=$2 ready='' got postgis
  (cd "$dir" && sha256sum -c --quiet "SHA256SUMS_$ts") || die "checksum mismatch for $ts"
  VERIFY_NAME="cctv-backup-verify-$$"
  # No network at all: trust auth is only reachable through `docker exec`.
  docker run -d --rm --name "$VERIFY_NAME" --network none --tmpfs /var/lib/postgresql:size=512m \
    -e POSTGRES_PASSWORD=unused -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=verify \
    "$IMAGE" >/dev/null
  # The entrypoint runs a temporary server for initdb first: wait for the real one.
  for _ in $(seq 90); do
    if docker logs "$VERIFY_NAME" 2>&1 | grep -q 'PostgreSQL init process complete' \
      && docker exec "$VERIFY_NAME" pg_isready -U postgres -d verify -q 2>/dev/null; then
      ready=1; break
    fi
    sleep 1
  done
  [[ -n $ready ]] || die "restore test: container did not start"
  # Same roles as production (no passwords), then the database itself.
  docker exec -i "$VERIFY_NAME" psql -X -q -U postgres -d postgres < "$dir/globals_$ts.sql" >/dev/null 2>&1 || true
  docker exec "$VERIFY_NAME" psql -X -q -U postgres -d postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER" >/dev/null \
    || die "restore test: CREATE DATABASE failed"
  docker exec -i "$VERIFY_NAME" pg_restore -U postgres -d "$DB_NAME" --exit-on-error < "$dir/cctv_survey_$ts.dump" \
    || die "restore test: pg_restore of $ts failed"
  got=$(docker exec "$VERIFY_NAME" psql -X -q -At -F ' ' -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "$COUNTS_SQL") \
    || die "restore test: count query failed"
  [[ $got == "$(cat "$dir/counts_$ts.txt")" ]] || die "restore test: row counts or data (md5) differ for $ts"
  postgis=$(docker exec "$VERIFY_NAME" psql -X -q -At -U postgres -d "$DB_NAME" -c "SELECT postgis_lib_version()") \
    || die "restore test: PostGIS check failed"
  docker rm -f "$VERIFY_NAME" >/dev/null 2>&1 || true
  VERIFY_NAME=''
  RESTORE_SUMMARY="rows+md5 match [$(awk '{printf "%s%s=%s", (NR>1?" ":""), $1, $2}' <<<"$got")] postgis=$postgis"
}

# Dump into auto/$1 ("daily" or "test"), restore-test, then mark complete.
backup() {
  local kind=$1 dir="$AUTO/$1" ts start toc t f
  secure_dirs
  exec 9>"$AUTO/.lock"
  flock -n 9 || die "another backup is running"
  docker inspect -f '{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null | grep -qx healthy \
    || die "$DB_CONTAINER is not healthy"

  ts=$(date -u +%Y%m%dT%H%M%SZ); start=$(date +%s)
  SET_DIR=$dir SET_TS=$ts
  docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$dir/cctv_survey_$ts.dump.partial"
  docker exec "$DB_CONTAINER" pg_dumpall -U "$DB_USER" --globals-only --no-role-passwords > "$dir/globals_$ts.sql.partial"
  docker exec "$DB_CONTAINER" psql -X -q -At -F ' ' -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
    -c "$COUNTS_SQL" > "$dir/counts_$ts.txt.partial"

  # Quick checks before the full restore test.
  toc=$(docker exec -i "$DB_CONTAINER" pg_restore -l < "$dir/cctv_survey_$ts.dump.partial") \
    || die "pg_restore -l failed for $ts"
  for t in "${TABLES[@]}"; do
    grep -qE "TABLE DATA public $t " <<<"$toc" || die "dump $ts has no TABLE DATA for $t"
  done
  if grep -qiE "PASSWORD '|SCRAM-SHA-256\\$|md5[0-9a-f]{32}" "$dir/globals_$ts.sql.partial"; then
    die "globals $ts contain a password hash"
  fi
  [[ $(wc -l < "$dir/counts_$ts.txt.partial") == "${#TABLES[@]}" ]] || die "counts $ts incomplete"

  for f in "cctv_survey_$ts.dump" "globals_$ts.sql" "counts_$ts.txt"; do mv -- "$dir/$f.partial" "$dir/$f"; done
  (cd "$dir" && sha256sum "cctv_survey_$ts.dump" "globals_$ts.sql" "counts_$ts.txt" > "SHA256SUMS_$ts")

  # Only a set that restores completely counts as a backup.
  restore_test "$dir" "$ts"

  if [[ $kind == daily && $(date -u +%u) == 7 ]]; then
    # Sunday: weekly copy (hard links: no extra space while both exist).
    for f in "cctv_survey_$ts.dump" "globals_$ts.sql" "counts_$ts.txt" "SHA256SUMS_$ts"; do
      ln -f -- "$dir/$f" "$AUTO/weekly/$f"
    done
    log "weekly copy $ts"
  fi
  SET_DONE=1
  log "$([[ $kind == daily ]] && echo ok || echo 'test ok') $ts dump=$(stat -c %s "$dir/cctv_survey_$ts.dump")B globals=$(stat -c %s "$dir/globals_$ts.sql")B $RESTORE_SUMMARY $(( $(date +%s) - start ))s"

  if [[ $kind == daily ]]; then
    echo "$ts" > "$AUTO/LAST_OK"
    prune "$AUTO/daily" "$KEEP_DAILY"
    prune "$AUTO/weekly" "$KEEP_WEEKLY"
  else
    prune "$AUTO/test" "$KEEP_TEST"
  fi
}

# A verified production backup must exist, be recent and still match its checksums.
cmd_check() {
  secure_dirs
  local last newest_ts age
  [[ -s $AUTO/LAST_OK ]] || die "check: no successful production backup yet (LAST_OK missing)"
  last=$(cat "$AUTO/LAST_OK")
  [[ $last =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || die "check: LAST_OK is malformed"
  newest_ts=$(newest "$AUTO/daily")
  [[ $newest_ts == "$last" ]] || die "check: newest daily set ($newest_ts) is not the last verified one ($last)"
  [[ -f $AUTO/daily/cctv_survey_$last.dump ]] || die "check: set $last is missing"
  (cd "$AUTO/daily" && sha256sum -c --quiet "SHA256SUMS_$last") || die "check: checksum mismatch for $last"
  age=$(( ($(date -u +%s) - $(date -u -d "${last:0:4}-${last:4:2}-${last:6:2} ${last:9:2}:${last:11:2}:${last:13:2}" +%s)) / 3600 ))
  (( age < MAX_AGE_HOURS )) || die "check: last verified backup $last is ${age}h old (max ${MAX_AGE_HOURS}h)"
  log "check ok last=$last age=${age}h"
}

cmd_verify() {
  local ts=${1:-} dir='' d
  secure_dirs
  [[ -n $ts ]] || ts=$(newest "$AUTO/daily")
  [[ $ts =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || die "verify: no backup to verify"
  for d in daily weekly test; do
    if [[ -f $AUTO/$d/cctv_survey_$ts.dump ]]; then dir="$AUTO/$d"; break; fi
  done
  [[ -n $dir ]] || die "verify: set $ts not found"
  restore_test "$dir" "$ts"
  log "verify ok $(basename "$dir")/$ts $RESTORE_SUMMARY"
}

cmd_list() {
  local d keep
  for d in daily weekly test; do
    case $d in daily) keep=$KEEP_DAILY ;; weekly) keep=$KEEP_WEEKLY ;; test) keep=$KEEP_TEST ;; esac
    echo "== $d (keep $keep)"
    find "$AUTO/$d" -maxdepth 1 -name 'cctv_survey_*Z.dump' -printf '%f %s\n' 2>/dev/null | sort -r
  done
  if [[ -f $AUTO/LAST_OK ]]; then echo "last verified production backup: $(cat "$AUTO/LAST_OK")"
  else echo "no verified production backup yet"; fi
}

mkdir -p "$AUTO"
case "${1:-}" in
  run) backup daily ;;
  test) backup test ;;
  check) cmd_check ;;
  verify) cmd_verify "${2:-}" ;;
  list) cmd_list ;;
  *) echo "usage: $0 {run|check|test|verify [TS]|list}" >&2; exit 2 ;;
esac
