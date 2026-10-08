#!/bin/sh
# M25 G5 guard: scripts/release-build-check.sh must refuse a test build. Runs in the gate only.
set -u
cd "$(dirname "$0")/.."
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
URL=$(python3 -c 'import json; print(json.load(open("apps/mobile/app.json"))["expo"]["extra"]["apiBaseUrl"])')
printf 'var a="%s/v1";function f(){return 1}\n' "$URL" > "$T/clean.bundle"
printf '{"name":"SocialNet","extra":{"apiBaseUrl":"%s"}}\n' "$URL" > "$T/prod.json"
printf '{"name":"SocialNet","extra":{"apiBaseUrl":"http://localhost:8787"}}\n' > "$T/test.json"
fail=0
run() { sh scripts/release-build-check.sh "$@" > "$T/out" 2>&1; echo $?; }
expect() {
  if [ "$1" = "$2" ]; then echo "ok   $3"; else echo "FAIL $3 (exit $2, wanted $1)"; cat "$T/out"; fail=1; fi
}
expect 0 "$(run "$T/clean.bundle" "$T/prod.json" 100)" "a production bundle passes"
printf 'fetch("http://localhost:8787/x")\n' >> "$T/dirty.bundle"; cat "$T/clean.bundle" >> "$T/dirty.bundle"
expect 1 "$(run "$T/dirty.bundle" "$T/prod.json" 100)" "a bundle naming localhost fails"
printf 'u="/__e2e/code"\n' > "$T/e2e.bundle"
expect 1 "$(run "$T/e2e.bundle" "$T/prod.json" 100)" "a bundle naming /__e2e/ fails"
printf 'require("expo-dev-launcher")\n' > "$T/dev.bundle"
expect 1 "$(run "$T/dev.bundle" "$T/prod.json" 100)" "a bundle with the dev client fails"
expect 1 "$(run "$T/clean.bundle" "$T/test.json" 100)" "a build pointed at a test server (SOCIALNET_API_BASE_URL) fails"
head -c 3000 /dev/zero | tr '\0' 'x' > "$T/big.bundle"
expect 1 "$(run "$T/big.bundle" "$T/prod.json" 1)" "a bundle over its size budget fails"
expect 1 "$(run "$T/missing.bundle" "$T/prod.json" 100)" "no bundle fails"
exit $fail
