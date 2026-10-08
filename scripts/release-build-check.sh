#!/bin/sh
# M25 G5: is this build safe to hand to users? Run on the JS bundle and the embedded Expo config
# that a RELEASE build carries (android-compile: the APK's assets; ios: the .app's main.jsbundle
# and EXConstants.bundle/app.config). Never on the laptop.
#
#   scripts/release-build-check.sh <bundle> <app.config json> [budget-kb]
#
# Fails (exit 1, every reason printed) when:
#   - the bundle names a test address: localhost, 127.0.0.1, 10.0.2.2, the e2e server's /__e2e/;
#   - the embedded config's extra.apiBaseUrl is not app.json's production address (a build made
#     with SOCIALNET_API_BASE_URL set — the journey builds — must never be released);
#   - a development client or dev menu is inside (expo-dev-launcher / expo-dev-menu);
#   - the bundle is larger than the budget (default BUNDLE_BUDGET_KB, below).
# The version-bump check is in scripts/release-gate.sh's caller (release.yml), where the last
# release tag is known.
set -u
BUNDLE=${1:?usage: release-build-check.sh <bundle> <app.config> [budget-kb]}
CONFIG=${2:?usage: release-build-check.sh <bundle> <app.config> [budget-kb]}
# Android release bundle measured 6387 KB on 2026-10-08 (lane-ga run 37727268269); ~15 % headroom.
# The iOS bundle is larger (7613 KB, ios run 37743410490): ios.yml passes its own budget, 8800.
# Raise it on purpose, in a commit that says why — never to make a red run green unread.
BUDGET_KB=${3:-${BUNDLE_BUDGET_KB:-7500}}
HERE=$(cd "$(dirname "$0")/.." && pwd)
APP_JSON=${APP_JSON:-$HERE/apps/mobile/app.json}
fail=0
bad() { echo "FAIL $*"; fail=1; }

[ -s "$BUNDLE" ] || { echo "FAIL no bundle at $BUNDLE"; exit 1; }
[ -s "$CONFIG" ] || { echo "FAIL no embedded app config at $CONFIG"; exit 1; }

# Known strings, each exactly as it appears, each with its reason. Anything else matching a
# test-address pattern fails. Seen in the first Android release bundle (M25, lane-ga run 37727268269):
#   http://localhost:8081 — React Native's own default dev-server address (getDevServer), inert in
#                           a release build: nothing loads from Metro.
#   http://10.0.2.2:3000  — KNOWN DEFECT, not inert: apps/mobile/src/social/base-url.ts falls back to
#                           the Android emulator's host when extra.apiBaseUrl is missing. Release
#                           builds always carry it (checked below), so today it is unreachable;
#                           remove this line when the fallback becomes the production address.
#   http://localhost:3000 — expo-router's head/url.js "fallback value that shouldn't be used for
#                           real" when no origin is configured (iOS bundle, ios run 37743410490).
ALLOWED=${RELEASE_CHECK_ALLOWED:-"http://localhost:8081 http://10.0.2.2:3000 http://localhost:3000"}
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
python3 - "$BUNDLE" "$T/scan" $ALLOWED <<'PY'
import sys
data = open(sys.argv[1], 'rb').read()
for s in sys.argv[3:]:
    n = data.count(s.encode())
    if n: print(f"note allowed '{s}' ({n} times)")
    data = data.replace(s.encode(), b'')
open(sys.argv[2], 'wb').write(data)
PY
for pat in 'localhost' '127\.0\.0\.1' '10\.0\.2\.2' '/__e2e/' 'expo-dev-launcher' 'expo-dev-menu'; do
  n=$(grep -a -o -E "$pat" "$T/scan" | wc -l | tr -d ' ')
  if [ "$n" -gt 0 ]; then
    bad "bundle contains '$pat' ($n times):"
    grep -a -o -E ".{0,60}$pat.{0,60}" "$T/scan" | head -3 | sed 's/^/       /'
  else echo "ok   bundle has no '$pat'"; fi
done

want=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["expo"]["extra"]["apiBaseUrl"])' "$APP_JSON")
got=$(python3 -c 'import json,sys; print((json.load(open(sys.argv[1])).get("extra") or {}).get("apiBaseUrl",""))' "$CONFIG")
if [ "$got" = "$want" ]; then echo "ok   embedded apiBaseUrl is $want"
else bad "embedded apiBaseUrl is '$got', not the production '$want' (built with SOCIALNET_API_BASE_URL?)"; fi
case "$want" in https://*) ;; *) bad "app.json's apiBaseUrl is not https";; esac

kb=$(( $(wc -c < "$BUNDLE") / 1024 ))
if [ "$kb" -le "$BUDGET_KB" ]; then echo "ok   bundle ${kb} KB ≤ budget ${BUDGET_KB} KB"
else bad "bundle ${kb} KB > budget ${BUDGET_KB} KB"; fi
echo "bundle-size-kb=$kb"

[ "$fail" -eq 0 ] && echo "release-build check: GREEN" || echo "release-build check: RED"
exit $fail
