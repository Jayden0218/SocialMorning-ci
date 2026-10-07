#!/bin/sh
# The commit gate: typecheck, every workspace's tests, the mobile playback coverage
# threshold. Prints each exit code and fails loudly. Commit `7278e9f` (2026-09-21) went
# in with 2 failing tests because an ad-hoc && chain misread its own output; this
# script exists so that cannot happen quietly again.
set -u
cd "$(dirname "$0")/.."
npm run typecheck >/dev/null 2>&1; T=$?
# M23 T050: each suite runs once — the coverage runs ARE the test runs (as ci/workflows/gate.yml).
(cd apps/api && npx tsx --test --test-timeout=120000 test/*.test.ts >/dev/null 2>&1) \
  && npm test --workspace=@socialmorning/studio >/dev/null 2>&1 \
  && npm test -w packages/feed-parser >/dev/null 2>&1 \
  && npm run test:coverage -w packages/social-core >/dev/null 2>&1 \
  && npm run test:coverage -w packages/player-core >/dev/null 2>&1; U=$?
(cd apps/mobile && npx jest --coverage >/dev/null 2>&1); C=$?
# M23 G-M23-10: the backup refuses to run without its key.
sh scripts/backup-preflight.test.sh >/dev/null 2>&1; B=$?
# M6 FR-022: no interactive element without a name a screen reader can speak.
(cd apps/mobile && node scripts/a11y-audit.mjs >/dev/null 2>&1); A=$?
# M7 FR-002 (guard G1): every colour comes from src/design/tokens.ts. Wired in at T020,
# once the restyle had actually taken the count from 188 to 0 — a check that is red on
# every commit is a check people learn to ignore.
(cd apps/mobile && node scripts/token-check.mjs >/dev/null 2>&1); K=$?
# 2026-09-27: every <Text> and <TextInput> names a token colour — a bare <Text> sets no
# style, so token-check cannot see it, and it renders black on the black app.
(cd apps/mobile && node scripts/text-colour-check.mjs >/dev/null 2>&1); X=$?
# M11: the Studio's production build (its tests run in `npm test` above).
npm run build --workspace=@socialmorning/studio >/dev/null 2>&1; S=$?
echo "gate: typecheck=$T tests=$U mobile-coverage=$C a11y=$A tokens=$K text-colour=$X backup-preflight=$B studio-build=$S"
[ "$T" -eq 0 ] && [ "$U" -eq 0 ] && [ "$C" -eq 0 ] && [ "$A" -eq 0 ] && [ "$K" -eq 0 ] && [ "$X" -eq 0 ] && [ "$B" -eq 0 ] && [ "$S" -eq 0 ]
