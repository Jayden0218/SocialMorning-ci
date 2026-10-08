#!/bin/sh
# M25 G2 guard: scripts/release-gate.sh must go RED when one required workflow has no green run
# on the commit, and GREEN only when all have. Runs in the gate (ci/workflows/gate.yml, checks),
# never on the laptop. A fake `gh` answers from FAKE_RUNS (one "workflow conclusion" per line).
set -u
cd "$(dirname "$0")/.."
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
cat > "$T/gh" <<'FAKE'
#!/bin/sh
# Answers exactly the calls release-gate.sh makes, already filtered as its --jq would.
case "$1 $2" in
  "api repos/m/commits/aaaa1111")
    printf 'aaaa1111 subject\n\nsource: bbbb222\n'; exit 0;;
  "api repos/p/commits/bbbb222") echo bbbb2222full; exit 0;;
  "api repos/m/actions/workflows?per_page=100")
    printf '%s\n' .github/workflows/gate.yml .github/workflows/e2e.yml .github/workflows/contracts.yml; exit 0;;
  "run list")
    shift 2; repo=""; wf=""; sha=""
    while [ $# -gt 0 ]; do case "$1" in -R) repo=$2; shift;; -w) wf=$2; shift;; -c) sha=$2; shift;; esac; shift; done
    c=$(printf '%s\n' "$FAKE_RUNS" | awk -v w="$repo:$wf:$sha" '$1==w {print $2}' | head -1)
    if [ -z "$c" ]; then echo '[]'; else echo "[{\"databaseId\": 42, \"conclusion\": \"$c\", \"status\": \"completed\"}]"; fi
    exit 0;;
esac
exit 1
FAKE
chmod +x "$T/gh"
ALL="m:gate.yml:aaaa1111 success
m:e2e.yml:aaaa1111 success
m:android-compile.yml:aaaa1111 success
m:ios.yml:aaaa1111 success
m:ios-journey.yml:aaaa1111 success
m:android-journey.yml:aaaa1111 success
m:contracts.yml:aaaa1111 success
p:smoke.yml:bbbb2222full success"
run() { FAKE_RUNS="$1" MIRROR=m PRIVATE=p GH="$T/gh" sh scripts/release-gate.sh $2 > "$T/out" 2>&1; echo $?; }
fail=0
expect() { # want got name
  if [ "$1" = "$2" ]; then echo "ok   $3"; else echo "FAIL $3 (exit $2, wanted $1)"; cat "$T/out"; fail=1; fi
}
expect 0 "$(run "$ALL" aaaa1111)" "all green on one commit → green"
expect 1 "$(run "$(printf '%s\n' "$ALL" | grep -v ios-journey)" aaaa1111)" "ios-journey missing → red"
grep -q "ios-journey" "$T/out" || { echo "FAIL the red output names ios-journey"; fail=1; }
expect 1 "$(run "$(printf '%s\n' "$ALL" | sed 's/^m:android-journey.yml:aaaa1111 success/m:android-journey.yml:aaaa1111 failure/')" aaaa1111)" "android-journey red → red"
expect 1 "$(run "$(printf '%s\n' "$ALL" | grep -v contracts)" aaaa1111)" "an optional workflow that exists (contracts) is required"
expect 1 "$(run "$(printf '%s\n' "$ALL" | grep -v smoke)" aaaa1111)" "smoke missing in the private repo → red"
expect 0 "$(run "$(printf '%s\n' "$ALL" | grep -v smoke)" "--mirror-only aaaa1111")" "--mirror-only skips smoke"
expect 1 "$(run "$ALL" ffff9999)" "an unknown commit → red"
exit $fail
