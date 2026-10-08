#!/bin/sh
# M25 G6: run the phone journeys in order, each against its time budget, on one booted device.
# Used by ci/workflows/ios-journey.yml and android-journey.yml — never on the laptop.
#
#   scripts/maestro-run.sh <device-id> <output-dir> [only-regex]
#
# The list and the budgets are apps/mobile/.maestro/flows.txt ("<file> <budget seconds>"),
# run in that order: the first signs in, the rest reuse the session. A flow that fails, or that
# takes longer than its budget, makes the run red; a failed flow stops the run (the next flows
# depend on it). One table goes to the job summary.
set -u
DEVICE=${1:?usage: maestro-run.sh <device> <out> [only]}
OUT=${2:?usage: maestro-run.sh <device> <out> [only]}
ONLY=${3:-.}
cd "$(dirname "$0")/../apps/mobile/.maestro"
mkdir -p "$OUT"
SUMMARY=${GITHUB_STEP_SUMMARY:-/dev/null}
{ echo "| flow | result | seconds | budget |"; echo "|---|---|---|---|"; } >> "$SUMMARY"
fail=0
while read -r flow budget; do
  case "$flow" in ''|'#'*) continue;; esac
  echo "$flow" | grep -Eq "$ONLY" || { echo "skip $flow"; continue; }
  start=$(date +%s)
  if maestro --device "$DEVICE" test "$flow" --test-output-dir "$OUT/${flow%.yaml}" < /dev/null; then r=passed; else r=FAILED; fi
  secs=$(( $(date +%s) - start ))
  if [ "$r" = passed ] && [ "$secs" -gt "$budget" ]; then r="OVER BUDGET"; fi
  echo "== $flow: $r in ${secs}s (budget ${budget}s)"
  echo "| $flow | $r | $secs | $budget |" >> "$SUMMARY"
  if [ "$r" != passed ]; then fail=1; [ "$r" = FAILED ] && break; fi
done < flows.txt
exit $fail
