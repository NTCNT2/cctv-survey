#!/usr/bin/env bash
# Fetch one off-site backup set (see scripts/backup.sh "Off-site") and decrypt it.
#   scripts/offsite-restore.sh list
#   scripts/offsite-restore.sh fetch <TS|latest> <new-empty-dir> [--key private-key.asc]
#
# fetch: download sets/cctv-survey-<TS>.tar.gpg + .sha256 -> check the sha256 ->
# decrypt with the PRIVATE key (asks for its passphrase; needs a terminal) ->
# check the member names -> extract -> sha256sum -c of the set. It prints the
# command that restore-tests the set (scripts/backup.sh verify <TS> <dir>/set).
# Nothing here touches the production database or the local backups.
#
# --key: a private key file (exported with `gpg --export-secret-keys --armor`),
# imported into a throwaway keyring that is deleted afterwards. Without --key,
# your own default keyring is used.
#
# On a new server: install rclone, recreate $OFFSITE_DIR/rclone.conf and target
# (infra/db/README.md, "Off-site backups"), then run this.
set -Eeuo pipefail
umask 077

OFFSITE_DIR=${OFFSITE_DIR:-$HOME/.config/cctv-backup}
RCLONE=${RCLONE:-$HOME/.local/bin/rclone}
TMP_HOME=''

die() { echo "ERROR: $*" >&2; exit 1; }
cleanup() {
  if [[ -n $TMP_HOME ]]; then
    gpgconf --homedir "$TMP_HOME" --kill gpg-agent 2>/dev/null || true
    rm -rf -- "$TMP_HOME"
  fi
}
trap cleanup EXIT

[[ -f $OFFSITE_DIR/target && -f $OFFSITE_DIR/rclone.conf ]] || die "off-site not configured in $OFFSITE_DIR"
TARGET=$(cat "$OFFSITE_DIR/target")
rc() { "$RCLONE" --config "$OFFSITE_DIR/rclone.conf" "$@"; }

sets() { rc lsf --files-only --include '/cctv-survey-*Z.tar.gpg' "$TARGET/sets/" | sort; }

case "${1:-}" in
  list)
    sets
    exit 0
    ;;
  fetch) ;;
  *) echo "usage: $0 {list|fetch <TS|latest> <new-empty-dir> [--key FILE]}" >&2; exit 2 ;;
esac

ts=${2:-} out=${3:-} key=''
[[ ${4:-} == --key ]] && key=${5:-}
[[ -n $out ]] || die "fetch: output directory missing"
if [[ $ts == latest ]]; then
  ts=$(sets | tail -1 | sed -nE 's/^cctv-survey-([0-9]{8}T[0-9]{6}Z)\.tar\.gpg$/\1/p')
fi
[[ $ts =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || die "fetch: no set '$2'"
[[ ! -e $out ]] || [[ -d $out && -z $(ls -A "$out") ]] || die "fetch: $out must be new or empty"
[[ -z $key || -f $key ]] || die "fetch: key file $key not found"
mkdir -p -m 700 "$out"
out=$(cd "$out" && pwd)
name="cctv-survey-$ts.tar.gpg"

rc copyto "$TARGET/sets/$name" "$out/$name"
rc copyto "$TARGET/sets/$name.sha256" "$out/$name.sha256"
(cd "$out" && sha256sum -c --quiet "$name.sha256") || die "downloaded $name does not match its sha256"
echo "downloaded $name ($(stat -c %s "$out/$name") B), sha256 ok"

gpg_args=(--quiet)
if [[ -n $key ]]; then
  TMP_HOME=$(mktemp -d)
  gpg --homedir "$TMP_HOME" --batch --quiet --import "$key"
  gpg_args+=(--homedir "$TMP_HOME")
fi
gpg "${gpg_args[@]}" --output "$out/set.tar" --decrypt "$out/$name" || die "decryption failed"

# Only plain file names of a set may come out of the archive.
if tar -tf "$out/set.tar" | grep -qvE '^(cctv_survey_|globals_|counts_|SHA256SUMS_|photos_|cctv-survey-photos-)[A-Za-z0-9_.-]+$'; then
  die "unexpected member in $out/set.tar — not extracting"
fi
mkdir -m 700 "$out/set"
tar --no-same-owner -xf "$out/set.tar" -C "$out/set"
rm -f -- "$out/set.tar"
(cd "$out/set" && sha256sum -c --quiet "SHA256SUMS_$ts") || die "set $ts: checksum mismatch after decryption"
echo "set $ts decrypted to $out/set, checksums ok"
echo "restore test: $(dirname "$0")/backup.sh verify $ts $out/set"
