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

# M32 T052 (review D8): ONE list of named suites. scripts/gate.sh with no argument runs them all (as before);
# `scripts/gate.sh <suite> [<suite>...]` runs just those, and ci/workflows/gate.yml calls exactly that, one step per suite.
# scripts/workflow-check.mjs fails when this list and the workflow's `scripts/gate.sh <suite>` calls differ. Every script a
# suite calls must be in scripts/push-ci.sh's archive list (the workflow runs in the public mirror).
SUITES="typecheck studio-src-globals lint api studio feed-parser contracts social-core player-core mobile-coverage backup-preflight a11y tokens text-colour capture-coverage verdict audit react-is studio-build"

suite_cmd() {
  case "$1" in
    typecheck) npm run typecheck ;;
    # Node globals in browser code: the Studio's src has no Node types (tsconfig.json), but a dependency (@vercel/blob -> undici) pulls
    # @types/node into the program anyway, so `process` / `Buffer` would still compile. This looks at the source instead (M32 T056).
    studio-src-globals) ! grep -rnE '\b(process\.|Buffer\.)' apps/studio/src ;;
    # M32 T021 (review D1): eslint over the whole repo; rules-of-hooks is an error, the rest warnings (eslint.config.mjs).
    lint) npm run lint ;;
    # GATE_API_ARGS is how the workflow shards: GATE_API_ARGS=--test-shard=1/3
    api) cd apps/api && npx tsx --test --test-timeout=120000 ${GATE_API_ARGS:-} test/*.test.ts ;;
    studio) npm test --workspace=@socialmorning/studio ;;
    feed-parser) npm test -w packages/feed-parser ;;
    contracts) npx tsx --test packages/contracts/test/*.test.ts ;;
    # M23 T050: each suite runs once; the coverage runs ARE the test runs.
    social-core) npm run test:coverage -w packages/social-core ;;
    player-core) npm run test:coverage -w packages/player-core ;;
    mobile-coverage) cd apps/mobile && npx jest --coverage ;;
    # M23 G-M23-10: the backup refuses to run without its key.
    backup-preflight) sh scripts/backup-preflight.test.sh ;;
    # M6 FR-022: no interactive element without a name a screen reader can speak.
    a11y) cd apps/mobile && node scripts/a11y-audit.mjs ;;
    # M7 FR-002 (G1): every colour comes from src/design/tokens.ts.
    tokens) cd apps/mobile && node scripts/token-check.mjs && node --test scripts/retired-check.test.mjs && node scripts/retired-check.mjs && node scripts/reduce-motion-check.mjs && node --test scripts/reduce-motion-check.test.mjs \
      && node --test scripts/action-replay.test.mjs scripts/action-replay-moved.test.mjs scripts/action-replay-passer.test.mjs && node scripts/action-replay.mjs ;;
    # 2026-09-27: every <Text> and <TextInput> names a token colour (a bare one renders black on the black app).
    text-colour) cd apps/mobile && node scripts/text-colour-check.mjs ;;
    # Screen capture FR-003: every screen and popup in the code has a capture entry (and the guard's own tests).
    capture-coverage) cd apps/mobile && node --test scripts/capture-coverage.test.mjs && node scripts/capture-coverage.mjs ;;
    # M27 G-DV4: the commit script's verdict logic.
    verdict) node --test scripts/gate-verdict.test.mjs ;;
    # M28 US5 (G-M28-AUDIT, G-M28-ALLOW): a high/critical advisory not on security/audit-allow.json fails. Needs the network.
    audit) node --test scripts/audit-gate.test.mjs && node scripts/audit-gate.mjs ;;
    # M11 (research R9): recharts 3 was reported to resolve react-is@18 under React 19; list what it resolves.
    react-is) npm ls react-is --workspace=@socialmorning/studio ;;
    # M11: the Studio's production build (its tests run in `studio`).
    studio-build) npm run build --workspace=@socialmorning/studio ;;
    *) echo "gate.sh: unknown suite '$1' (known: $SUITES)" >&2; return 2 ;;
  esac
}

# run <name>: runs the suite in a subshell with its output in $OUT/<name>.log; sets R_<name> to its exit code.
run() {
  name=$1
  ( suite_cmd "$name" ) >"$OUT/$name.log" 2>&1
  code=$?
  eval "R_$(echo "$name" | tr - _)=$code"
  [ "$code" -eq 0 ] || FAILED="$FAILED $name"
}

if [ "$#" -gt 0 ]; then
  # Named suites only (what ci/workflows/gate.yml calls): show the whole log, exit non-zero if any failed.
  for name in "$@"; do
    case " $SUITES " in *" $name "*) ;; *) echo "gate.sh: unknown suite '$name' (known: $SUITES)" >&2; exit 2;; esac
    run "$name"
    cat "$OUT/$name.log"
    eval "v=\$R_$(echo "$name" | tr - _)"
    echo "gate: $name=$v"
  done
  [ -z "$FAILED" ]
  exit $?
fi

for name in $SUITES; do run "$name"; done

for name in $FAILED; do
  echo "---- $name FAILED (last 40 lines) ----"
  tail -n 40 "$OUT/$name.log"
done
# Same summary line as before (suites folded into the old names), then the per-suite table.
sum() { for n in "$@"; do eval "v=\$R_$(echo $n | tr - _)"; [ "$v" -eq 0 ] || { echo 1; return; }; done; echo 0; }
U=$(sum api studio feed-parser social-core player-core)
echo "gate: typecheck=$R_typecheck tests=$U mobile-coverage=$R_mobile_coverage a11y=$R_a11y tokens=$R_tokens text-colour=$R_text_colour backup-preflight=$R_backup_preflight capture-coverage=$R_capture_coverage studio-build=$R_studio_build lint=$R_lint audit=$R_audit react-is=$R_react_is studio-src-globals=$R_studio_src_globals"
for name in $SUITES; do
  eval "v=\$R_$(echo $name | tr - _)"
  printf '  %-18s %s\n' "$name" "$([ "$v" -eq 0 ] && echo ok || echo "FAILED (exit $v)")"
done
[ -z "$FAILED" ]
