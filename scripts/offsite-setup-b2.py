#!/usr/bin/env python3
"""One-time: create the Backblaze B2 bucket and a no-delete key for off-site backups.

Run it yourself in an SSH terminal:  python3 -I scripts/offsite-setup-b2.py

Asks (hidden input) for a B2 key that may create buckets and keys (the master
application key), used only in memory for this run and never written anywhere.
Then:
  1. bucket (private, SSE-B2, Object Lock on) — reused if it exists with Object Lock
  2. default retention: governance, 90 days (no file can be removed for 90 days)
  3. lifecycle: hide 90 days after upload, delete 1 day after hiding
  4. a key for this server, only for that bucket, capabilities
     listBuckets listFiles readFiles writeFiles  (NO deleteFiles)
  5. writes $OFFSITE_DIR/rclone.conf (600) and $OFFSITE_DIR/target
  6. tests with rclone: list, upload a probe, delete of the probe MUST fail
Secrets are never printed; the server key is written only to rclone.conf.
"""
import base64
import getpass
import json
import os
import re
import secrets
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

OFFSITE_DIR = os.environ.get("OFFSITE_DIR", os.path.expanduser("~/.config/cctv-backup"))
RCLONE = os.environ.get("RCLONE", os.path.expanduser("~/.local/bin/rclone"))
AUTH_URL = "https://api.backblazeb2.com/b2api/v2/b2_authorize_account"
RETENTION_DAYS = 90
SERVER_CAPS = ["listBuckets", "listFiles", "readFiles", "writeFiles"]
REMOTE = "offsite"


def die(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def call(url, token, body):
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"Authorization": token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            err = json.load(e)
            detail = f"{err.get('code')}: {err.get('message')}"
        except Exception:
            detail = e.reason
        die(f"{url.rsplit('/', 1)[-1]} failed ({e.code} {detail})")


def main():
    if not (sys.stdin.isatty() and sys.stdout.isatty()):
        die("run this in a terminal (SSH), not via a pipe or '!'")
    for f in ("rclone.conf", "target"):
        if os.path.exists(os.path.join(OFFSITE_DIR, f)):
            die(f"{OFFSITE_DIR}/{f} exists already")
    if not os.access(RCLONE, os.X_OK):
        die(f"rclone not found at {RCLONE}")

    key_id = input("B2 master keyID: ").strip()
    app_key = getpass.getpass("B2 master applicationKey (hidden): ").strip()
    if not key_id or not app_key:
        die("keyID and applicationKey are required")
    default_name = "cctv-survey-offsite-" + secrets.token_hex(4)
    bucket = input(f"Bucket name [{default_name}]: ").strip() or default_name
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{4,48}[a-z0-9]", bucket) or bucket.startswith("b2-"):
        die("bucket name: 6-50 characters, a-z 0-9 and '-', not starting with b2-")

    basic = base64.b64encode(f"{key_id}:{app_key}".encode()).decode()
    req = urllib.request.Request(AUTH_URL, headers={"Authorization": "Basic " + basic})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            auth = json.load(r)
    except urllib.error.HTTPError as e:
        die(f"authorization failed ({e.code}) — check keyID / applicationKey")
    del app_key, basic
    api, token, account = auth["apiUrl"], auth["authorizationToken"], auth["accountId"]
    caps = set(auth.get("allowed", {}).get("capabilities", []))
    missing = {"listBuckets", "writeBuckets", "writeKeys"} - caps
    if missing:
        die(f"this key lacks {sorted(missing)} — use the master application key")

    found = call(f"{api}/b2api/v2/b2_list_buckets", token, {"accountId": account, "bucketName": bucket})["buckets"]
    if found:
        b = found[0]
        if not b.get("fileLockConfiguration", {}).get("value", {}).get("isFileLockEnabled"):
            die(f"bucket {bucket} exists without Object Lock — choose another name")
        print(f"bucket {bucket}: exists with Object Lock, reusing it")
    else:
        b = call(
            f"{api}/b2api/v2/b2_create_bucket",
            token,
            {
                "accountId": account,
                "bucketName": bucket,
                "bucketType": "allPrivate",
                "fileLockEnabled": True,
                "defaultServerSideEncryption": {"mode": "SSE-B2", "algorithm": "AES256"},
            },
        )
        print(f"bucket {bucket}: created (private, SSE-B2, Object Lock)")
    bucket_id = b["bucketId"]

    call(
        f"{api}/b2api/v2/b2_update_bucket",
        token,
        {
            "accountId": account,
            "bucketId": bucket_id,
            "defaultRetention": {"mode": "governance", "period": {"duration": RETENTION_DAYS, "unit": "days"}},
            "lifecycleRules": [
                {"fileNamePrefix": "", "daysFromUploadingToHiding": RETENTION_DAYS, "daysFromHidingToDeleting": 1}
            ],
        },
    )
    print(f"bucket {bucket}: retention governance {RETENTION_DAYS} days, lifecycle hide after {RETENTION_DAYS} + delete 1 day later")

    k = call(
        f"{api}/b2api/v2/b2_create_key",
        token,
        {
            "accountId": account,
            "capabilities": SERVER_CAPS,
            "keyName": "cctv-survey-server-" + datetime.now(timezone.utc).strftime("%Y%m%d"),
            "bucketId": bucket_id,
        },
    )
    if set(k["capabilities"]) != set(SERVER_CAPS) or k.get("bucketId") != bucket_id:
        die("the created key does not have exactly the requested scope — delete it in the B2 web UI")
    print(f"server key {k['keyName']}: {' '.join(sorted(k['capabilities']))} on {bucket} only")

    os.makedirs(OFFSITE_DIR, mode=0o700, exist_ok=True)
    conf = os.path.join(OFFSITE_DIR, "rclone.conf")
    fd = os.open(conf, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        # hard_delete: a delete would need deleteFiles, which this key lacks.
        f.write(
            f"[{REMOTE}]\ntype = b2\naccount = {k['applicationKeyId']}\n"
            f"key = {k['applicationKey']}\nhard_delete = true\n"
        )
    target = f"{REMOTE}:{bucket}"

    def rc(*args):
        return subprocess.run([RCLONE, "--config", conf, *args], capture_output=True, text=True)

    probe = f"{target}/_probe/setup-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.txt"
    if rc("lsf", f"{target}/").returncode != 0:
        die("rclone cannot list the bucket with the new key")
    p = subprocess.run(
        [RCLONE, "--config", conf, "rcat", probe], input="cctv-survey off-site probe\n", capture_output=True, text=True
    )
    if p.returncode != 0:
        die(f"probe upload failed: {p.stderr.strip()[-300:]}")
    if rc("deletefile", probe).returncode == 0:
        die("the server key COULD delete a file — remove this key in the B2 web UI")
    print("test: list ok, upload ok, delete refused (as intended)")

    fd = os.open(os.path.join(OFFSITE_DIR, "target"), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(target + "\n")
    print(f"\nDone. {OFFSITE_DIR}/rclone.conf and target = {target}")
    print("The master key was not stored. Keep it out of this server.")


if __name__ == "__main__":
    main()
