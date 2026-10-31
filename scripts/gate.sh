#!/bin/sh
# The commit gate: typecheck, lint, every workspace's tests, the coverage thresholds, the guards. Prints each exit code and fails
# loudly. Commit `7278e9f` (2026-09-21) went in with 2 failing tests because an ad-hoc && chain misread its own output;
# this script exists so that cannot happen quietly again.
#
# M27 (FR-045): every suite runs even after one failed, its output is kept in a temp file, and each FAILING suite's last 40 lines
# are printed before the summary — it used to discard all output, so a red gate said "tests=1" and nothing else.
#
# CI speed (2026-10-31): this file is the ONE list of what the gate runs. ci/workflows/gate.yml calls it once per job,
# with a group name, so the jobs still run side by side:
#   scripts/gate.sh                  every group (a Linux session with DynamoDB Local up; never the owner's laptop)
#   scripts/gate.sh typecheck        typecheck + oxlint + eslint + the Studio's no-Node-globals check
#   scripts/gate.sh api              the API tests; GATE_API_SHARD=1/3 runs one node --test shard (needs DDB_ENDPOINT)
#   scripts/gate.sh checks           everything else
# It drifted twice while gate.yml kept its own copy of the list (M7: no a11y audit on a runner; 2026-10: no audit-gate or
# react-is check here). On GitHub Actions (GITHUB_ACTIONS=true) each suite's whole log is printed in a folded group.
set -u
cd "$(dirname "$0")/.."
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
FAILED=""
RAN=""
GROUPS_WANTED=${*:-typecheck api checks}

wants() { case " $GROUPS_WANTED " in *" $1 "*) return 0;; *) return 1;; esac; }
for g in $GROUPS_WANTED; do
  case "$g" in typecheck|api|checks) ;; *) echo "scripts/gate.sh: unknown group '$g' (typecheck, api, checks)" >&2; exit 2;; esac
done

# run <name> <command...>: runs it in a subshell with its output in $OUT/<name>.log; sets R_<name> to its exit code.
run() {
  name=$1; shift
  ( "$@" ) >"$OUT/$name.log" 2>&1
  code=$?
  eval "R_$(echo "$name" | tr - _)=$code"
  RAN="$RAN $name"
  [ "$code" -eq 0 ] || FAILED="$FAILED $name"
  if [ "${GITHUB_ACTIONS:-}" = true ]; then
    echo "::group::$name (exit $code)"; cat "$OUT/$name.log"; echo "::endgroup::"
  fi
}

if wants typecheck; then
  # Each package also checks its src/ alone with no Node or DOM types (tsconfig.src.json, T054).
  run typecheck npm run typecheck
  # oxlint (root devDependency, one .oxlintrc.json per workspace) in api, mobile, studio and the three packages, each with
  # --max-warnings at the count measured when it was added (2026-10-31). It may be lowered, never raised.
  run lint npm run lint --workspaces --if-present
  # M32 T021 (review D1): eslint over the whole repo (root `npm run lint`); rules-of-hooks is an error, the rest warnings
  # (eslint.config.mjs). It stays beside oxlint: it carries the react-hooks and jsx-a11y rules M32 chose.
  run eslint npm run lint
  # Node globals in browser code: the Studio's src has no Node types (tsconfig.json), but a dependency (@vercel/blob -> undici) pulls
  # @types/node into the program anyway, so `process` / `Buffer` would still compile. This looks at the source instead (M32 T056).
  run studio-src-globals sh -c '! grep -rnE "\b(process\.|Buffer\.)" apps/studio/src'
fi

if wants api; then
  # DynamoDB Local (scripts/ddb-local.sh) at $DDB_ENDPOINT; every test makes and drops its own tables (test/harness.ts).
  if [ -n "${GATE_API_SHARD:-}" ]; then
    run api sh -c 'cd apps/api && npx tsx --test --test-timeout=120000 --test-shard="$GATE_API_SHARD" test/*.test.ts'
  else
    run api sh -c 'cd apps/api && npx tsx --test --test-timeout=120000 test/*.test.ts'
  fi
fi

if wants checks; then
  # M23 T050: each suite runs once — the coverage runs ARE the test runs (src/playback 100 % branches in mobile).
  run mobile-coverage sh -c 'cd apps/mobile && npx jest --coverage'
  run studio npm test --workspace=@socialmorning/studio
  run feed-parser npm test -w packages/feed-parser
  run contracts sh -c 'npx tsx --test packages/contracts/test/*.test.ts'
  run social-core npm run test:coverage -w packages/social-core
  run player-core npm run test:coverage -w packages/player-core
  # M6 FR-022: no interactive element without a name a screen reader can speak.
  run a11y sh -c 'cd apps/mobile && node scripts/a11y-audit.mjs'
  # M7 FR-002 (guard G1): every colour comes from src/design/tokens.ts.
  # M31/M32 add the retired-pattern check, the reduce-motion check and the action replay (G-E3 against m31/actions-before.json).
  run tokens sh -c 'cd apps/mobile && node scripts/token-check.mjs && node --test scripts/retired-check.test.mjs && node scripts/retired-check.mjs && node scripts/reduce-motion-check.mjs && node --test scripts/reduce-motion-check.test.mjs && node --test scripts/action-replay.test.mjs scripts/action-replay-moved.test.mjs scripts/action-replay-passer.test.mjs && node scripts/action-replay.mjs'
  # 2026-09-27: every <Text> and <TextInput> names a token colour — a bare <Text> sets no style, so token-check cannot see it.
  run text-colour sh -c 'cd apps/mobile && node scripts/text-colour-check.mjs'
  # Screen capture FR-003: every screen and popup in the code has a capture entry (and the guard's own tests).
  run capture-coverage sh -c 'cd apps/mobile && node --test scripts/capture-coverage.test.mjs && node scripts/capture-coverage.mjs'
  # M23 G-M23-10: the backup refuses to run without its key, and never prints the address.
  run backup-preflight sh scripts/backup-preflight.test.sh
  # M27 G-DV4: the commit script's verdict logic.
  run verdict node --test scripts/gate-verdict.test.mjs
  # M28 US5 (G-M28-AUDIT, G-M28-ALLOW): a high/critical advisory not on security/audit-allow.json, an expired or reasonless
  # entry, or a fixable server-scope entry fails; so does an unreachable registry. Needs the network.
  run audit sh -c 'node --test scripts/audit-gate.test.mjs && node scripts/audit-gate.mjs'
  # M11 (research R9): recharts 3 was reported to resolve react-is@18 under React 19; npm ls fails on an invalid tree.
  run react-is npm ls react-is --workspace=@socialmorning/studio
  # M11: the Studio's production build (its tests run above).
  run studio-build npm run build --workspace=@socialmorning/studio
fi

if [ "${GITHUB_ACTIONS:-}" != true ]; then
  for name in $FAILED; do
    echo "---- $name FAILED (last 40 lines) ----"
    tail -n 40 "$OUT/$name.log"
  done
fi
echo "gate ($GROUPS_WANTED):"
for name in $RAN; do
  eval "v=\$R_$(echo "$name" | tr - _)"
  printf '  %-18s %s\n' "$name" "$([ "$v" -eq 0 ] && echo ok || echo "FAILED (exit $v)")"
done
[ -z "$FAILED" ]
