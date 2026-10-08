#!/bin/sh
# M25 G2: the release gate. A build may be released only when EVERY required workflow has a
# green run on the SAME commit (docs/plans/m25-audit/plan-tests.md §6).
#
#   scripts/release-gate.sh <sha>              → one table; exit 0 all green, 1 with the missing list
#   scripts/release-gate.sh --mirror-only <sha> → skip the private repo's smoke (used inside the
#                                                 mirror's release.yml, whose token cannot read it)
#
# <sha> may be the private repo's commit or the mirror's: the mirror commit is found by its
# "source: <short sha>" line (scripts/push-ci.sh writes it). Smoke is looked up in the private
# repo on the private sha.
#
# Required in the mirror: gate, studio-e2e, android-compile (holds the Android release-build
# checks), ios (holds the iOS release-build checks), ios-journey, android-journey.
# Required when the workflow exists (lane GB adds them): postgres-api, contracts.
# Required in the private repo: smoke (unless --mirror-only).
#
# Env (tests): MIRROR, PRIVATE, GH (the gh binary).
set -u
MIRROR=${MIRROR:-Jayden0218/SocialMorning-ci}
PRIVATE=${PRIVATE:-Jayden0218/SocialMorning}
GH=${GH:-gh}
MIRROR_ONLY=0
if [ "${1:-}" = "--mirror-only" ]; then MIRROR_ONLY=1; shift; fi
SHA=${1:?usage: scripts/release-gate.sh [--mirror-only] <sha>}

REQUIRED="gate.yml e2e.yml android-compile.yml ios.yml ios-journey.yml android-journey.yml"
OPTIONAL="postgres-api.yml contracts.yml"

# Resolve the mirror commit and the private one.
MSHA=""; PSHA=""
full=$($GH api "repos/$MIRROR/commits/$SHA" --jq '.sha + " " + .commit.message' 2>/dev/null || true)
if [ -n "$full" ]; then
  MSHA=${full%% *}
  PSHA=$(printf '%s\n' "$full" | sed -n 's/^source: \([0-9a-f]*\).*/\1/p' | head -1)
else
  # A private sha: find the mirror commit whose message names it.
  short=$(printf '%s' "$SHA" | cut -c1-7)
  MSHA=$($GH api "repos/$MIRROR/commits?per_page=100" --jq ".[] | select(.commit.message | test(\"source: $short\")) | .sha" 2>/dev/null | head -1)
  PSHA=$SHA
fi
if [ -z "$MSHA" ]; then
  echo "release gate: no mirror commit for $SHA (push it with scripts/push-ci.sh first)" >&2
  exit 1
fi
echo "release gate for mirror $MSHA (source ${PSHA:-unknown})"

present=$($GH api "repos/$MIRROR/actions/workflows?per_page=100" --jq '.workflows[].path' 2>/dev/null | sed 's#.*/##')
for w in $OPTIONAL; do
  if printf '%s\n' "$present" | grep -qx "$w"; then REQUIRED="$REQUIRED $w"; fi
done

missing=""
row() { printf '  %-22s %-10s %s\n' "$1" "$2" "$3"; }
row WORKFLOW STATE RUN
check() { # repo workflow sha label
  out=$($GH run list -R "$1" -w "$2" -c "$3" -L 50 --json databaseId,conclusion,status 2>/dev/null || echo '[]')
  green=$(printf '%s' "$out" | python3 -c 'import json,sys
r=json.load(sys.stdin)
ok=[x for x in r if x.get("conclusion")=="success"]
print(ok[0]["databaseId"] if ok else "")')
  state=$(printf '%s' "$out" | python3 -c 'import json,sys
r=json.load(sys.stdin)
print("missing" if not r else (r[0].get("conclusion") or r[0].get("status")))')
  if [ -n "$green" ]; then row "$4" green "$green"; else row "$4" "$state" "-"; missing="$missing $4"; fi
}
for w in $REQUIRED; do
  label=${w%.yml}; [ "$w" = e2e.yml ] && label=studio-e2e
  check "$MIRROR" "$w" "$MSHA" "$label"
done
if [ "$MIRROR_ONLY" -eq 0 ]; then
  if [ -z "$PSHA" ]; then row smoke missing "-"; missing="$missing smoke"
  else
    # The private sha may be short: ask the private repo for the full one.
    PFULL=$($GH api "repos/$PRIVATE/commits/$PSHA" --jq .sha 2>/dev/null || echo "$PSHA")
    check "$PRIVATE" smoke.yml "$PFULL" "smoke (private)"
  fi
fi

if [ -n "$missing" ]; then
  echo "release gate RED — not green on this commit:$missing"
  exit 1
fi
echo "release gate GREEN — every required workflow is green on $MSHA"
