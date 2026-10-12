#!/bin/sh
# The commit gate: typecheck, every workspace's tests, the mobile playback coverage
# threshold. Prints each exit code and fails loudly. Commit `7278e9f` (2026-09-21) went
# in with 2 failing tests because an ad-hoc && chain misread its own output; this
# script exists so that cannot happen quietly again.
#
# M27 (FR-045): every suite runs even after one failed, its output is kept in a temp file, and each FAILING suite's last 40 lines
# are printed before the summary — it used to discard all output, so a red gate said "tests=1" and nothing else.
set -u
cd "$(dirname "$0")/.."
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
FAILED=""

# run <name> <command...>: runs it in a subshell with its output in $OUT/<name>.log; sets R_<name> to its exit code.
run() {
  name=$1; shift
  ( "$@" ) >"$OUT/$name.log" 2>&1
  code=$?
  eval "R_$(echo "$name" | tr - _)=$code"
  [ "$code" -eq 0 ] || FAILED="$FAILED $name"
}
# M23 T050: each suite runs once — the coverage runs ARE the test runs (as ci/workflows/gate.yml).
run typecheck npm run typecheck
run api sh -c 'cd apps/api && npx tsx --test --test-timeout=120000 test/*.test.ts'
run studio npm test --workspace=@socialmorning/studio
run feed-parser npm test -w packages/feed-parser
run social-core npm run test:coverage -w packages/social-core
run player-core npm run test:coverage -w packages/player-core
run mobile-coverage sh -c 'cd apps/mobile && npx jest --coverage'
# M23 G-M23-10: the backup refuses to run without its key.
run backup-preflight sh scripts/backup-preflight.test.sh
# M6 FR-022: no interactive element without a name a screen reader can speak.
run a11y sh -c 'cd apps/mobile && node scripts/a11y-audit.mjs'
# M7 FR-002 (guard G1): every colour comes from src/design/tokens.ts. Wired in at T020,
# once the restyle had actually taken the count from 188 to 0 — a check that is red on
# every commit is a check people learn to ignore.
run tokens sh -c 'cd apps/mobile && node scripts/token-check.mjs'
# 2026-09-27: every <Text> and <TextInput> names a token colour — a bare <Text> sets no
# style, so token-check cannot see it, and it renders black on the black app.
run text-colour sh -c 'cd apps/mobile && node scripts/text-colour-check.mjs'
# M27 G-DV4: the commit script's verdict logic.
run verdict node --test scripts/gate-verdict.test.mjs
# M11: the Studio's production build (its tests run in `npm test` above).
run studio-build npm run build --workspace=@socialmorning/studio

for name in $FAILED; do
  echo "---- $name FAILED (last 40 lines) ----"
  tail -n 40 "$OUT/$name.log"
done
# Same summary line as before (suites folded into the old names), then the per-suite table.
sum() { for n in "$@"; do eval "v=\$R_$(echo $n | tr - _)"; [ "$v" -eq 0 ] || { echo 1; return; }; done; echo 0; }
U=$(sum api studio feed-parser social-core player-core)
echo "gate: typecheck=$R_typecheck tests=$U mobile-coverage=$R_mobile_coverage a11y=$R_a11y tokens=$R_tokens text-colour=$R_text_colour backup-preflight=$R_backup_preflight studio-build=$R_studio_build"
for name in typecheck api studio feed-parser social-core player-core mobile-coverage backup-preflight a11y tokens text-colour verdict studio-build; do
  eval "v=\$R_$(echo $name | tr - _)"
  printf '  %-18s %s\n' "$name" "$([ "$v" -eq 0 ] && echo ok || echo "FAILED (exit $v)")"
done
[ -z "$FAILED" ]
