#!/usr/bin/env bash
# Browser (Playwright) tests for apps/web, on this server only.
#
#   pnpm test:e2e:web [playwright args…]
#
# - API on 127.0.0.1:4100 against the *test* database (cctv_survey_test), with
#   a random JWT_SECRET — never the dev database or the real secret.
# - Web: production build in apps/web/.next-e2e, served on 127.0.0.1:3100 and
#   proxying /api to the API above.
# - Seeds e2e-web-* users, and removes every row it created at the end.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
API_PORT=4100
WEB_PORT=3100
# Same build, no Google Maps settings: production shows a configuration error,
# the opted-in development server uses OpenStreetMap instead.
WEB_NOMAP_PORT=3101
WEB_OSM_PORT=3102
BASE="http://127.0.0.1:$WEB_PORT"
TEST_DB=cctv_survey_test
PREFIX="e2e-web-$(date +%s)"
LOGDIR="$ROOT/apps/web/test-results"
mkdir -p "$LOGDIR"

die() { echo "error: $*" >&2; exit 1; }
psql_test() {
  # shellcheck disable=SC2016
  docker compose exec -T db sh -c \
    'exec psql -X -q -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d '"$TEST_DB"' "$@"' psql "$@"
}
rand() { node -e 'console.log(require("node:crypto").randomBytes(18).toString("base64url"))'; }

for port in $API_PORT $WEB_PORT $WEB_NOMAP_PORT $WEB_OSM_PORT; do
  ! ss -ltn | grep -q "127.0.0.1:$port " || die "port $port is in use"
done

echo "== test database"
bash scripts/db.sh test-db >/dev/null
[[ $(psql_test -c 'select current_database()') == "$TEST_DB" ]] || die "not the test database"
counts=$(psql_test -c 'select (select count(*) from projects) + (select count(*) from users) + (select count(*) from camera_models)')
[[ $counts == 0 ]] || die "$TEST_DB is not empty ($counts rows) — clean it before running the suite"

echo "== build"
pnpm --filter @cctv/shared build >/dev/null
pnpm --filter @cctv/api build >/dev/null
(cd apps/web && NEXT_DIST_DIR=.next-e2e API_INTERNAL_URL="http://127.0.0.1:$API_PORT" \
  node_modules/.bin/next build >"$LOGDIR/web-build.log" 2>&1) || die "web build failed (see $LOGDIR/web-build.log)"

# DATABASE_URL for the test DB, derived from .env without exporting anything else.
DB_URL=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)
DB_URL=${DB_URL/\/cctv_survey\?//$TEST_DB?}
[[ $DB_URL == *"/$TEST_DB?"* ]] || die "could not derive the test DATABASE_URL"
# Photo files of this run: a throwaway directory, removed in cleanup.
UPLOAD_TMP=$(mktemp -d -t cctv-e2e-web-uploads-XXXXXX)
API_ENV=(DATABASE_URL="$DB_URL" JWT_SECRET="$(rand)$(rand)" JWT_EXPIRES_IN=8h
  API_HOST=127.0.0.1 API_PORT=$API_PORT COOKIE_SECURE=false NODE_ENV=test
  UPLOAD_DIR="$UPLOAD_TMP")

cleanup() {
  set +e
  [[ -n ${API_PID:-} ]] && kill "$API_PID" 2>/dev/null
  [[ -n ${WEB_PID:-} ]] && kill "$WEB_PID" 2>/dev/null
  [[ -n ${WEB_NOMAP_PID:-} ]] && kill "$WEB_NOMAP_PID" 2>/dev/null
  [[ -n ${WEB_OSM_PID:-} ]] && kill "$WEB_OSM_PID" 2>/dev/null
  [[ -n ${WEBKIT_CID:-} ]] && docker stop "$WEBKIT_CID" >/dev/null 2>&1
  wait 2>/dev/null
  for port in $API_PORT $WEB_PORT $WEB_NOMAP_PORT $WEB_OSM_PORT; do
    ! ss -ltn | grep -q "127.0.0.1:$port " || echo "warning: something still listens on $port"
  done
  echo "== cleanup ($TEST_DB)"
  psql_test <<SQL
DELETE FROM camera_points WHERE project_id IN (SELECT id FROM projects WHERE name LIKE '$PREFIX%');
DELETE FROM camera_models WHERE brand LIKE '$PREFIX%';
DELETE FROM sites WHERE project_id IN (SELECT id FROM projects WHERE name LIKE '$PREFIX%');
DELETE FROM projects WHERE name LIKE '$PREFIX%';
DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'e2e-web-%');
DELETE FROM users WHERE username LIKE 'e2e-web-%';
SELECT 'left in $TEST_DB: projects=' || (SELECT count(*) FROM projects)
    || ' users=' || (SELECT count(*) FROM users)
    || ' camera_models=' || (SELECT count(*) FROM camera_models)
    || ' camera_photos=' || (SELECT count(*) FROM camera_photos);
SQL
  [[ -n ${UPLOAD_TMP:-} ]] && rm -rf "$UPLOAD_TMP"
  # Saved test-user sessions. Absolute path: the script has cd'ed by now.
  rm -rf "$ROOT/apps/web/e2e/.auth"
}
trap cleanup EXIT

echo "== start API :$API_PORT and web :$WEB_PORT (loopback only)"
# `exec` makes $! the server itself, so cleanup really stops it.
(cd apps/api && exec env "${API_ENV[@]}" node dist/main.js >"$LOGDIR/api.log" 2>&1) & API_PID=$!
# Google Maps settings are read at request time. The key is a dummy: the tests
# serve a stub of the Maps JavaScript API and never call Google.
(cd apps/web && NEXT_DIST_DIR=.next-e2e NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=e2e-dummy-key \
  NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=e2e-map-id \
  exec node_modules/.bin/next start -H 127.0.0.1 -p $WEB_PORT >"$LOGDIR/web.log" 2>&1) & WEB_PID=$!
(cd apps/web && NEXT_DIST_DIR=.next-e2e NEXT_PUBLIC_GOOGLE_MAPS_API_KEY= NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID= \
  exec node_modules/.bin/next start -H 127.0.0.1 -p $WEB_NOMAP_PORT >"$LOGDIR/web-nomap.log" 2>&1) & WEB_NOMAP_PID=$!
(cd apps/web && NEXT_DIST_DIR=.next-e2e NEXT_PUBLIC_GOOGLE_MAPS_API_KEY= SURVEY_MAP_DEV_FALLBACK=true \
  exec node_modules/.bin/next start -H 127.0.0.1 -p $WEB_OSM_PORT >"$LOGDIR/web-osm.log" 2>&1) & WEB_OSM_PID=$!
for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$API_PORT/api/health" >/dev/null && curl -sf -o /dev/null "$BASE/login" &&
    curl -sf -o /dev/null "http://127.0.0.1:$WEB_NOMAP_PORT/login" &&
    curl -sf -o /dev/null "http://127.0.0.1:$WEB_OSM_PORT/login" && break
  sleep 0.5
done
curl -sf -o /dev/null "$BASE/api/health" || die "servers did not start (see $LOGDIR/*.log)"

echo "== seed users"
tag=$(node -e 'console.log(require("node:crypto").randomBytes(3).toString("hex"))')
declare -A PASS
for who in admin surveyor viewer login pwchange victim; do
  export "E2E_${who^^}_USER=e2e-web-$who-$tag"
  PASS[$who]=$(rand)
  export "E2E_${who^^}_PASS=${PASS[$who]}"
done
printf '%s\n%s\n' "${PASS[admin]}" "${PASS[admin]}" |
  (cd apps/api && env "${API_ENV[@]}" node dist/cli/create-admin.js "$E2E_ADMIN_USER" >/dev/null)
JAR=$(mktemp)
# JSON bodies go through stdin, so no password shows up in the process list.
printf '{"username":"%s","password":"%s"}' "$E2E_ADMIN_USER" "${PASS[admin]}" |
  curl -sf -c "$JAR" -H 'content-type: application/json' --data-binary @- "$BASE/api/auth/login" >/dev/null
for pair in surveyor:surveyor viewer:viewer login:viewer pwchange:surveyor victim:viewer; do
  who=${pair%%:*}; role=${pair##*:}; var="E2E_${who^^}_USER"
  printf '{"username":"%s","role":"%s","password":"%s"}' "${!var}" "$role" "${PASS[$who]}" |
    curl -sf -b "$JAR" -H 'content-type: application/json' --data-binary @- \
      "$BASE/api/users" >/dev/null || die "could not create $who"
done
curl -sf -b "$JAR" -X POST "$BASE/api/auth/logout" >/dev/null; rm -f "$JAR"

# Optional: E2E_WEBKIT=1 also runs mobile.spec.ts in real WebKit (Safari's
# engine), served by the official Playwright image on loopback only.
if [[ ${E2E_WEBKIT:-} == 1 ]]; then
  WEBKIT_PORT=3333
  PW_VERSION=$(node -p 'require("./apps/web/node_modules/@playwright/test/package.json").version')
  ! ss -ltn | grep -q "127.0.0.1:$WEBKIT_PORT " || die "port $WEBKIT_PORT is in use"
  WEBKIT_CID=$(docker run -d --rm --init --network host --user pwuser --workdir /home/pwuser \
    "mcr.microsoft.com/playwright:v$PW_VERSION-noble" \
    /bin/sh -c "npx -y playwright@$PW_VERSION run-server --port $WEBKIT_PORT --host 127.0.0.1")
  for _ in $(seq 1 120); do ss -ltn | grep -q "127.0.0.1:$WEBKIT_PORT " && break; sleep 0.5; done
  ss -ltn | grep -q "127.0.0.1:$WEBKIT_PORT " || die "WebKit server did not start"
  export E2E_WEBKIT_WS="ws://127.0.0.1:$WEBKIT_PORT/"
fi

echo "== playwright"
export E2E_BASE_URL="$BASE" E2E_NOMAP_BASE_URL="http://127.0.0.1:$WEB_NOMAP_PORT" \
  E2E_OSM_BASE_URL="http://127.0.0.1:$WEB_OSM_PORT" E2E_PREFIX="$PREFIX"
cd apps/web
node_modules/.bin/playwright test "$@"

# Optional: E2E_WEBKIT_LEGACY=1 re-checks the bottom sheet DOM the tests dumped
# in older WebKit builds (Safari 17/18 engines) and the current one. Shipping
# Safari can lag Playwright's WebKit; servers are still up for the web fonts.
if [[ ${E2E_WEBKIT_LEGACY:-} == 1 ]]; then
  echo "== bottom sheet in WebKit 17.4 / 18.2 / 18.4 / current"
  PW_VERSION=$(node -p 'require("./node_modules/@playwright/test/package.json").version')
  docker run --rm --init --network host \
    -v "$PWD/test-results/sheet-dom:/work:ro" -v "$ROOT/scripts/webkit-sheet-check.cjs:/check.cjs:ro" \
    -v cctv-pw-legacy-cache:/cache \
    "mcr.microsoft.com/playwright:v$PW_VERSION-noble" sh -c '
      set -e; rc=0
      for V in 1.45.0 1.49.0 1.52.0 '"$PW_VERSION"'; do
        D=/cache/pw-$V; mkdir -p $D
        [ -d $D/node_modules/playwright ] || (cd $D && npm i -s --no-audit --no-fund playwright@$V >/dev/null 2>&1)
        export PLAYWRIGHT_BROWSERS_PATH=/cache/browsers-$V
        [ "$V" = "'"$PW_VERSION"'" ] && export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
        (cd $D && npx playwright install webkit >/dev/null 2>&1)
        NODE_PATH=$D/node_modules node /check.cjs || rc=1
      done; exit $rc'
fi
