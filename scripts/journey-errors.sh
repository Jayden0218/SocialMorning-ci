#!/bin/sh
# M25 G6: after the phone journeys, the app's own error log (M23 US8: the app sends its errors to
# POST /v1/errors) must hold nothing new. Reads the owner's /mod/errors page on the LOCAL test
# server (apps/api/scripts/e2e-server.ts) as the moderator — never production.
#
#   scripts/journey-errors.sh            (E2E_API, E2E_MOD_EMAIL, E2E_MOD_PASSWORD)
#
# JOURNEY_ERRORS_ALLOW: an extended regex of scopes that are expected on the test server (for
# example the catalogue, which is down on purpose there). Each allowed row is still printed.
set -u
API=${E2E_API:-http://localhost:8787}
case "$API" in http://localhost*|http://127.0.0.1*) ;; *) echo "journey-errors: $API is not a local test server" >&2; exit 2;; esac
EMAIL=${E2E_MOD_EMAIL:?E2E_MOD_EMAIL}
PASS=${E2E_MOD_PASSWORD:-e2e-correct-horse}
ALLOW=${JOURNEY_ERRORS_ALLOW:-^$}
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
printf '{"email":"%s","password":"%s"}' "$EMAIL" "$PASS" > "$T/body"
curl -s -o "$T/in" -H 'content-type: application/json' --data @"$T/body" "$API/v1/auth/sign-in"
TOKEN=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("token",""))' "$T/in" 2>/dev/null)
[ -n "$TOKEN" ] || { echo "journey-errors: the moderator could not sign in"; exit 1; }
code=$(curl -s -o "$T/page" -w '%{http_code}' -H "cookie: mod=$TOKEN" "$API/mod/errors")
[ "$code" = 200 ] || { echo "journey-errors: /mod/errors answered $code"; exit 1; }
python3 - "$T/page" "$ALLOW" <<'PY'
import html, re, sys
page = open(sys.argv[1]).read()
allow = re.compile(sys.argv[2])
rows = re.findall(r'<tr><td>(.*?)</td><td>(.*?)</td><td>(.*?)(?:<details>.*?</details>)?</td><td>(.*?)</td><td>(.*?)</td><td>(.*?)</td></tr>', page, re.S)
bad = 0
for when, scope, msg, ver, plat, count in rows:
    scope, msg = html.unescape(scope), html.unescape(msg)
    ok = bool(allow.search(scope))
    bad += 0 if ok else 1
    print(f"{'allowed' if ok else 'ERROR  '} {scope} ×{count} [{plat}] {msg[:200]}")
print(f"app error log: {len(rows)} rows, {bad} not allowed")
sys.exit(1 if bad else 0)
PY
