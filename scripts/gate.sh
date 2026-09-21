#!/bin/sh
# The commit gate: typecheck, every workspace's tests, the mobile playback coverage
# threshold. Prints each exit code and fails loudly. Commit `7278e9f` (2026-09-21) went
# in with 2 failing tests because an ad-hoc && chain misread its own output; this
# script exists so that cannot happen quietly again.
set -u
cd "$(dirname "$0")/.."
npm run typecheck >/dev/null 2>&1; T=$?
npm test >/dev/null 2>&1; U=$?
(cd apps/mobile && npx jest --coverage >/dev/null 2>&1); C=$?
echo "gate: typecheck=$T tests=$U mobile-coverage=$C"
[ "$T" -eq 0 ] && [ "$U" -eq 0 ] && [ "$C" -eq 0 ]
