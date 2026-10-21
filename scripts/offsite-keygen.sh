#!/usr/bin/env bash
# One-time: create the off-site backup key pair (scripts/backup.sh "Off-site").
# Run it yourself in an SSH terminal (gpg asks for a passphrase twice, then once
# more to export the private key):
#   scripts/offsite-keygen.sh
#
# - The key is made in a throwaway keyring in RAM (/dev/shm), deleted at the end.
# - Public key  -> $OFFSITE_DIR/offsite.pub.asc   (stays here: encrypt only)
# - Private key -> ~/cctv-offsite-PRIVATE-KEY-<id>.asc (600). Copy it to TWO
#   places off this server (password manager + USB stick), run the restore
#   drill, then delete it here with `shred -u`. Without it, no off-site backup
#   can ever be restored.
set -Eeuo pipefail
umask 077

OFFSITE_DIR=${OFFSITE_DIR:-$HOME/.config/cctv-backup}
UID_NAME='cctv-survey offsite backup'

[[ -t 0 && -t 1 ]] || { echo "ERROR: run this in a terminal (SSH), not via a pipe or '!'" >&2; exit 1; }
[[ ! -e $OFFSITE_DIR/offsite.pub.asc ]] || { echo "ERROR: $OFFSITE_DIR/offsite.pub.asc exists already" >&2; exit 1; }
mkdir -p -m 700 "$OFFSITE_DIR"

GNUPGHOME=$(mktemp -d /dev/shm/cctv-offsite-key.XXXXXX)
export GNUPGHOME GPG_TTY
GPG_TTY=$(tty)
cleanup() { gpgconf --kill gpg-agent 2>/dev/null || true; rm -rf -- "$GNUPGHOME"; }
trap cleanup EXIT

echo "Creating the key. Choose a long passphrase and store it with the private key file."
gpg --quiet --quick-gen-key "$UID_NAME" future-default default never
fpr=$(gpg --with-colons --list-keys "$UID_NAME" | awk -F: '$1=="fpr"{print $10; exit}')
[[ $fpr =~ ^[0-9A-F]{40}$ ]] || { echo "ERROR: key not created" >&2; exit 1; }

gpg --armor --export "$fpr" > "$OFFSITE_DIR/offsite.pub.asc"
priv="$HOME/cctv-offsite-PRIVATE-KEY-${fpr: -16}.asc"
echo "Exporting the private key (gpg asks for the passphrase once more)."
gpg --armor --export-secret-keys "$fpr" > "$priv"
chmod 600 "$priv" "$OFFSITE_DIR/offsite.pub.asc"
grep -q 'BEGIN PGP PRIVATE KEY BLOCK' "$priv" || { echo "ERROR: private key export failed" >&2; rm -f -- "$priv"; exit 1; }

cat <<EOF

Done.
  fingerprint : $fpr
  public key  : $OFFSITE_DIR/offsite.pub.asc   (stays on this server)
  PRIVATE key : $priv
Next:
  1. Copy the PRIVATE key file to two places off this server, with the passphrase.
  2. Restore drill (scripts/offsite-restore.sh fetch latest <dir> --key $priv).
  3. Then delete it here: shred -u $priv
EOF
