#!/usr/bin/env bash
# Backups of the production database (Phase 7) and the photo volume (0005).
#   scripts/backup.sh run          production backup (cron): dump cctv_survey + globals,
#                                  archive the photo volume, restore-test both, then
#                                  mark it OK and prune
#   scripts/backup.sh check        fail unless a verified production backup is < 26 h old
#                                  and its checksums still match (cron, after `run`)
#   scripts/backup.sh test         same as `run`, but into auto/test/ (manual testing):
#                                  never counted as a production backup, own retention
#   scripts/backup.sh offsite      encrypt the last verified set and upload it off-site
#                                  (cron, between `run` and `check`; see "Off-site" below)
#   scripts/backup.sh verify [TS] [DIR]
#                                  restore-test a set again (default: newest daily;
#                                  DIR: a set fetched by scripts/offsite-restore.sh)
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
# - Photos: the volume $PHOTO_VOLUME is mounted READ-ONLY into a throwaway
#   container (--network none) that writes a tar.gz to stdout (owners, modes and
#   mtimes kept, numeric ids) plus a manifest (sha256, mode, uid:gid, mtime,
#   size of every file and directory). Its restore test extracts into tmpfs in
#   another throwaway container and must reproduce the manifest exactly; every
#   *.jpg must be a complete JPEG. The archive is taken right after the DB dump,
#   so it may hold a photo uploaded meanwhile (harmless: a file without a row).
#   No volume yet (photos not deployed): the set has no photo archive and the
#   log says so; once the volume exists, `check` requires the archive.
#
# Off-site (Backblaze B2, configured in $OFFSITE_DIR, see infra/db/README.md):
# - Only the set named in LAST_OK (restore-tested) is sent, after its checksums
#   match again. tar of the set -> gpg public-key encryption -> one file
#   sets/cctv-survey-<TS>.tar.gpg (+ .sha256 of the ciphertext). This server holds
#   only the PUBLIC key: it can encrypt, never decrypt. The private key is kept
#   off this server by the owner; without it no off-site copy can be restored.
# - The B2 key here has no deleteFiles capability, and the bucket has Object Lock
#   (governance, 90 days): a compromised server cannot remove off-site copies.
#   Bucket lifecycle (not this script) removes them after 90 days.
# - After upload the remote SHA-1 must equal the local one; then OFFSITE_LAST_OK.
# - Not configured ($OFFSITE_DIR/target missing): `offsite` fails, `check` skips
#   the off-site test. Once configured, `check` requires OFFSITE_LAST_OK == LAST_OK.
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
# Photo uploads of prod-api (compose.prod.yaml: uploads_prod). Read via Docker:
# the host path below is root-only, it is only compared with the volume's
# Mountpoint so that a different volume or path is never archived by mistake.
PHOTO_VOLUME=${PHOTO_VOLUME:-cctv-survey-uploads-prod}
PHOTO_SOURCE="/var/lib/docker/volumes/$PHOTO_VOLUME/_data"
# prod-api writes the volume as `node` (infra/docker/api.Dockerfile). The
# volume root must stay owned by it, or every upload fails with EACCES.
PHOTO_OWNER=${PHOTO_OWNER:-1000:1000 750}
# The ONLY way this script mounts the photo volume: read-only, and
# volume-nocopy. Without volume-nocopy, mounting an EMPTY volume makes Docker
# copy the mount point's owner/mode from the image into the volume root
# (2026-10-06: `-v vol:/src:ro -w /src` reset it to root 755 and broke all
# uploads). Never use -w on the mount point either: it creates that directory
# (root 755) in the image layer first.
photo_mount() { printf 'type=volume,src=%s,dst=%s,readonly,volume-nocopy' "$PHOTO_VOLUME" "$1"; }
PHOTO_SET_FILE='' # name of this set's photo archive, if any
# Off-site: rclone.conf (B2 key, 600), offsite.pub.asc (public key only) and
# target (rclone remote:bucket, one line).
OFFSITE_DIR=${OFFSITE_DIR:-$HOME/.config/cctv-backup}
RCLONE=${RCLONE:-$HOME/.local/bin/rclone}

# Inside the throwaway containers: one manifest line per entry below the
# current directory, sorted by path:
#   <sha256 | "dir"> <mode> <uid>:<gid> <mtime> <size | "-"> <path>
MANIFEST_SH='find . -mindepth 1 | LC_ALL=C sort | while IFS= read -r p; do
  if [ -d "$p" ]; then printf "dir %s - %s\n" "$(stat -c "%a %u:%g %Y" "$p")" "$p";
  elif [ -f "$p" ]; then printf "%s %s %s %s\n" "$(sha256sum < "$p" | cut -c1-64)" "$(stat -c "%a %u:%g %Y" "$p")" "$(stat -c %s "$p")" "$p";
  else echo "UNSUPPORTED $p"; fi; done'

# Row count + md5 of the rows of each application table (same query for
# production and the restore test, so a restore must reproduce the data exactly).
COUNTS_SQL="SELECT t, (xpath('/row/c/text()', x))[1]::text, (xpath('/row/m/text()', x))[1]::text FROM (
  SELECT t, query_to_xml(format('SELECT count(*) AS c, md5(coalesce(string_agg(r::text, chr(10) ORDER BY r::text), %L)) AS m FROM public.%I r', '', t), false, true, '') x
  FROM unnest(array['projects','sites','camera_points','users','user_sessions','schema_migrations']) t) q ORDER BY 1"

# State for the EXIT handler.
SET_DIR='' SET_TS='' SET_DONE=0 VERIFY_NAME='' FAILED_CMD='' ERR_LOGGED=0 RESTORE_SUMMARY=''
OFFSITE_TARGET='' OFFSITE_TMP='' # staging directory of `offsite`, removed on exit

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >>"$LOG"; printf '%s\n' "$*"; }
die() { log "ERROR: $*"; ERR_LOGGED=1; exit 1; }

# cctv-survey-photos-YYYYMMDD-HHMMSS.tar.gz for set timestamp YYYYMMDDTHHMMSSZ (UTC).
photo_archive() { echo "cctv-survey-photos-${1:0:8}-${1:9:6}.tar.gz"; }

set_files() { # all files of set $2 in directory $1 (incl. partials)
  local d=$1 t=$2 a
  a=$(photo_archive "$t")
  printf '%s\n' "$d/cctv_survey_$t.dump" "$d/globals_$t.sql" "$d/counts_$t.txt" "$d/SHA256SUMS_$t" \
    "$d/cctv_survey_$t.dump.partial" "$d/globals_$t.sql.partial" "$d/counts_$t.txt.partial" \
    "$d/$a" "$d/photos_$t.manifest" "$d/$a.partial" "$d/photos_$t.manifest.partial"
}

on_err() { FAILED_CMD="line $1: $2"; }
on_exit() {
  local rc=$? f
  if [[ -n $VERIFY_NAME ]]; then docker rm -f "$VERIFY_NAME" >/dev/null 2>&1 || true; fi
  if [[ -n $OFFSITE_TMP ]]; then rm -rf -- "$OFFSITE_TMP"; fi
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

# Does the photo volume exist? Dies if it exists somewhere other than PHOTO_SOURCE.
photo_volume_present() {
  local mp
  mp=$(docker volume inspect -f '{{.Mountpoint}}' "$PHOTO_VOLUME" 2>/dev/null) || return 1
  [[ $mp == "$PHOTO_SOURCE" ]] || die "photo volume $PHOTO_VOLUME is at $mp, expected $PHOTO_SOURCE"
}

# "uid:gid mode" of the photo volume root (read-only, no copy-up).
photo_owner() {
  docker run --rm --network none --read-only --cap-drop ALL \
    --mount "$(photo_mount /src)" "$IMAGE" stat -c '%u:%g %a' /src
}

# The volume root must be writable by prod-api; checked before and after.
assert_photo_owner() {
  local got
  got=$(photo_owner) || die "photos: cannot read the owner of $PHOTO_VOLUME"
  [[ $got == "$PHOTO_OWNER" ]] || die "photos: $PHOTO_VOLUME root is $got ($1), expected $PHOTO_OWNER — prod-api cannot write photos"
}

# Archive the photo volume into set $2 of directory $1 (read-only mount).
photo_backup() {
  local dir=$1 ts=$2 a n_src n_tar
  a=$(photo_archive "$ts")
  assert_photo_owner "before backup"
  # One container: the manifest (stderr) and the archive (stdout) see the same
  # files. tar errors also land on stderr and then fail the manifest check.
  docker run --rm --network none --read-only --cap-drop ALL --cap-add DAC_READ_SEARCH \
    --mount "$(photo_mount /src)" "$IMAGE" sh -ec \
    "cd /src; ( $MANIFEST_SH ) >&2; tar --numeric-owner -cpzf - ." \
    > "$dir/$a.partial" 2> "$dir/photos_$ts.manifest.partial" \
    || die "photos: archiving $PHOTO_VOLUME failed"
  if grep -qvE '^([0-9a-f]{64} [0-7]{3,4} [0-9]+:[0-9]+ [0-9]+ [0-9]+|dir [0-7]{3,4} [0-9]+:[0-9]+ [0-9]+ -) \./' \
    "$dir/photos_$ts.manifest.partial"; then
    die "photos: unexpected output while archiving (see $dir/photos_$ts.manifest.partial)"
  fi
  gzip -t "$dir/$a.partial" || die "photos: archive is not a valid gzip"
  n_src=$(grep -cv '^dir ' "$dir/photos_$ts.manifest.partial" || true)
  n_tar=$(tar -tvzf "$dir/$a.partial" | grep -c '^-' || true)
  [[ $n_src == "$n_tar" ]] || die "photos: $n_src files in the volume, $n_tar in the archive"
  assert_photo_owner "after backup"
  mv -- "$dir/$a.partial" "$dir/$a"
  mv -- "$dir/photos_$ts.manifest.partial" "$dir/photos_$ts.manifest"
  PHOTO_SET_FILE=$a
}

# Extract the photo archive of set $2 (directory $1) into tmpfs in a throwaway
# container; the result must match the manifest and every JPEG must be whole.
photo_restore_test() {
  local dir=$1 ts=$2 a got bad files
  a=$(photo_archive "$ts")
  got=$(docker run --rm --network none --read-only --tmpfs /restore:size=4g,mode=0755 \
    -v "$dir/$a:/in/photos.tar.gz:ro" -w /restore "$IMAGE" sh -ec \
    "tar --numeric-owner -xpzf /in/photos.tar.gz -C /restore && $MANIFEST_SH") \
    || die "photos restore test: extract failed for $ts"
  [[ $got == "$(cat "$dir/photos_$ts.manifest")" ]] \
    || die "photos restore test: extracted files differ from the manifest for $ts"
  bad=$(docker run --rm --network none --read-only --tmpfs /restore:size=4g,mode=0755 \
    -v "$dir/$a:/in/photos.tar.gz:ro" -w /restore "$IMAGE" sh -ec \
    'tar -xzf /in/photos.tar.gz -C /restore
     find . -type f -name "*.jpg" | while IFS= read -r f; do
       [ "$(head -c 3 "$f" | od -An -tx1 | tr -d " \n")" = ffd8ff ] && [ "$(tail -c 2 "$f" | od -An -tx1 | tr -d " \n")" = ffd9 ] || echo "$f"
     done') || die "photos restore test: JPEG check failed for $ts"
  [[ -z $bad ]] || die "photos restore test: not a complete JPEG: $(tr '\n' ' ' <<<"$bad")"
  files=$(grep -cv '^dir ' "$dir/photos_$ts.manifest" || true)
  RESTORE_SUMMARY+=" photos=$files files ($(stat -c %s "$dir/$a")B) restored+verified"
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

  # Photos, right after the database (see the header).
  local set_list=("cctv_survey_$ts.dump" "globals_$ts.sql" "counts_$ts.txt")
  if photo_volume_present; then
    photo_backup "$dir" "$ts"
    set_list+=("$PHOTO_SET_FILE" "photos_$ts.manifest")
  else
    log "photos: volume $PHOTO_VOLUME not found — set $ts has no photo archive (photos not deployed yet?)"
  fi
  (cd "$dir" && sha256sum "${set_list[@]}" > "SHA256SUMS_$ts")

  # Only a set that restores completely counts as a backup.
  restore_test "$dir" "$ts"
  [[ -z $PHOTO_SET_FILE ]] || photo_restore_test "$dir" "$ts"

  if [[ $kind == daily && $(date -u +%u) == 7 ]]; then
    # Sunday: weekly copy (hard links: no extra space while both exist).
    for f in "${set_list[@]}" "SHA256SUMS_$ts"; do
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
  # Once photos are deployed, a set without them is not a complete backup.
  if photo_volume_present; then
    [[ -f $AUTO/daily/$(photo_archive "$last") ]] \
      || die "check: photo volume $PHOTO_VOLUME exists but set $last has no photo archive"
    assert_photo_owner "check"
  fi
  age=$(( ($(date -u +%s) - $(date -u -d "${last:0:4}-${last:4:2}-${last:6:2} ${last:9:2}:${last:11:2}:${last:13:2}" +%s)) / 3600 ))
  (( age < MAX_AGE_HOURS )) || die "check: last verified backup $last is ${age}h old (max ${MAX_AGE_HOURS}h)"
  local offsite=''
  if [[ -f $OFFSITE_DIR/target ]]; then
    [[ -s $AUTO/OFFSITE_LAST_OK ]] || die "check: off-site is configured but nothing was uploaded yet"
    [[ $(cat "$AUTO/OFFSITE_LAST_OK") == "$last" ]] \
      || die "check: last verified set $last is not off-site (last upload $(cat "$AUTO/OFFSITE_LAST_OK"))"
    offsite=' offsite=ok'
  fi
  log "check ok last=$last age=${age}h$offsite"
}

# Sets OFFSITE_TARGET (not via $(…): die must run in this shell to be logged once).
offsite_target() {
  local t
  [[ -f $OFFSITE_DIR/target ]] || die "offsite: not configured ($OFFSITE_DIR/target missing)"
  t=$(cat "$OFFSITE_DIR/target")
  [[ $t =~ ^[A-Za-z0-9_-]+:[a-z0-9][a-z0-9-]{4,48}[a-z0-9]$ ]] || die "offsite: target is malformed"
  [[ -f $OFFSITE_DIR/rclone.conf && -f $OFFSITE_DIR/offsite.pub.asc ]] \
    || die "offsite: rclone.conf or offsite.pub.asc missing in $OFFSITE_DIR"
  [[ $(stat -c %a "$OFFSITE_DIR/rclone.conf") == 600 ]] || die "offsite: rclone.conf must be mode 600"
  [[ -x $RCLONE ]] || die "offsite: rclone not found at $RCLONE"
  OFFSITE_TARGET=$t
}

# Encrypt the last verified set to the off-site public key and upload it.
cmd_offsite() {
  local last name sha1 got start files keyid target
  secure_dirs
  exec 9>"$AUTO/.lock"
  flock -n 9 || die "another backup is running"
  offsite_target
  target=$OFFSITE_TARGET
  start=$(date +%s)
  [[ -s $AUTO/LAST_OK ]] || die "offsite: no verified backup yet (LAST_OK missing)"
  last=$(cat "$AUTO/LAST_OK")
  [[ $last =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || die "offsite: LAST_OK is malformed"
  (cd "$AUTO/daily" && sha256sum -c --quiet "SHA256SUMS_$last") || die "offsite: checksum mismatch for $last"
  mapfile -t files < <(awk '{print $2}' "$AUTO/daily/SHA256SUMS_$last")
  files+=("SHA256SUMS_$last")
  name="cctv-survey-$last.tar.gpg"
  # Never upload a set twice: every gpg run gives a different ciphertext, and
  # rclone would replace the remote file (--immutable does not stop it).
  got=$("$RCLONE" --config "$OFFSITE_DIR/rclone.conf" lsf --files-only --include "/$name" "$target/sets/" 2>/dev/null || true)
  if [[ -n $got ]]; then
    [[ -s $AUTO/OFFSITE_LAST_OK && $(cat "$AUTO/OFFSITE_LAST_OK") == "$last" ]] \
      || die "offsite: $name is already off-site but OFFSITE_LAST_OK does not say so — not replacing it"
    log "offsite: $last already off-site, nothing to do"
    return 0
  fi

  OFFSITE_TMP=$(mktemp -d "$AUTO/.offsite.XXXXXX")
  mkdir -m 700 "$OFFSITE_TMP/gnupg"
  # Throwaway keyring: the key comes only from offsite.pub.asc; nothing is trusted
  # or kept. No compression: dump and photo archive are compressed already.
  tar -C "$AUTO/daily" -cf - -- "${files[@]}" \
    | gpg --batch --quiet --no-tty --homedir "$OFFSITE_TMP/gnupg" --trust-model always \
      --recipient-file "$OFFSITE_DIR/offsite.pub.asc" --compress-algo none \
      --output "$OFFSITE_TMP/$name" --encrypt \
    || die "offsite: encryption of $last failed"
  # The file must be encrypted to the key in offsite.pub.asc and nothing else.
  keyid=$(gpg --batch --quiet --no-tty --homedir "$OFFSITE_TMP/gnupg" --with-colons --show-keys \
    "$OFFSITE_DIR/offsite.pub.asc" | awk -F: '$1=="sub" && $12 ~ /e/ {print $5}')
  [[ -n $keyid ]] || die "offsite: offsite.pub.asc has no encryption subkey"
  got=$(gpg --batch --no-tty --homedir "$OFFSITE_TMP/gnupg" --list-packets "$OFFSITE_TMP/$name" 2>/dev/null \
    | sed -nE 's/^:pubkey enc packet: .* keyid ([0-9A-F]+).*/\1/p' | sort -u || true)
  [[ $got == "$keyid" ]] || die "offsite: $name is not encrypted to exactly the off-site key"

  (cd "$OFFSITE_TMP" && sha256sum "$name" > "$name.sha256")
  sha1=$(sha1sum "$OFFSITE_TMP/$name" | cut -c1-40)
  "$RCLONE" --config "$OFFSITE_DIR/rclone.conf" --quiet copyto \
    "$OFFSITE_TMP/$name.sha256" "$target/sets/$name.sha256" || die "offsite: upload of $name.sha256 failed"
  "$RCLONE" --config "$OFFSITE_DIR/rclone.conf" --quiet copyto \
    "$OFFSITE_TMP/$name" "$target/sets/$name" || die "offsite: upload of $name failed"
  got=$("$RCLONE" --config "$OFFSITE_DIR/rclone.conf" hashsum sha1 "$target/sets/$name" | cut -c1-40) \
    || die "offsite: cannot read the remote checksum of $name"
  [[ $got == "$sha1" ]] || die "offsite: remote SHA-1 of $name differs from the local file"

  echo "$last" > "$AUTO/OFFSITE_LAST_OK"
  log "offsite ok $last $name $(stat -c %s "$OFFSITE_TMP/$name")B sha1=${sha1:0:12} $(( $(date +%s) - start ))s"
}

cmd_verify() {
  local ts=${1:-} dir=${2:-} d
  secure_dirs
  [[ -n $ts ]] || ts=$(newest "$AUTO/daily")
  [[ $ts =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || die "verify: no backup to verify"
  if [[ -n $dir ]]; then
    dir=$(cd "$dir" && pwd) || die "verify: directory $2 not found"
    [[ -f $dir/cctv_survey_$ts.dump ]] || die "verify: set $ts not found in $dir"
  else
    for d in daily weekly test; do
      if [[ -f $AUTO/$d/cctv_survey_$ts.dump ]]; then dir="$AUTO/$d"; break; fi
    done
  fi
  [[ -n $dir ]] || die "verify: set $ts not found"
  restore_test "$dir" "$ts"
  [[ ! -f $dir/$(photo_archive "$ts") ]] || photo_restore_test "$dir" "$ts"
  log "verify ok $dir/$ts $RESTORE_SUMMARY"
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
  if [[ -f $AUTO/OFFSITE_LAST_OK ]]; then echo "last off-site upload: $(cat "$AUTO/OFFSITE_LAST_OK")"
  else echo "no off-site upload yet"; fi
}

mkdir -p "$AUTO"
case "${1:-}" in
  run) backup daily ;;
  test) backup test ;;
  check) cmd_check ;;
  offsite) cmd_offsite ;;
  verify) cmd_verify "${2:-}" "${3:-}" ;;
  list) cmd_list ;;
  *) echo "usage: $0 {run|check|offsite|test|verify [TS] [DIR]|list}" >&2; exit 2 ;;
esac
