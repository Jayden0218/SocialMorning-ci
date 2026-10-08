#!/bin/sh
# M25 G6: run the phone journeys in order, each against its time budget, on one booted device.
# Used by ci/workflows/ios-journey.yml and android-journey.yml — never on the laptop.
#
#   PLATFORM=android|ios scripts/maestro-run.sh <device-id> <output-dir> [only-regex]
#
# The list and the budgets are apps/mobile/.maestro/flows.txt ("<file> <android s> <ios s>"),
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
PLATFORM=${PLATFORM:?set PLATFORM=android or ios}
while read -r flow android ios; do
  case "$flow" in ''|'#'*) continue;; esac
  if [ "$PLATFORM" = ios ]; then budget=$ios; else budget=$android; fi
  if [ "$budget" = "-" ]; then
    echo "== $flow: NOT RUN on $PLATFORM (flows.txt says why)"
    echo "| $flow | not run on $PLATFORM | - | - |" >> "$SUMMARY"
    continue
  fi
  echo "$flow" | grep -Eq "$ONLY" || { echo "skip $flow"; continue; }
  # One retry, shown as such in the summary: the iOS simulator's Maestro driver crashed mid-tap on
  # an overloaded runner (run 37731489175) — infrastructure, not the app. Fails twice → red.
  # The budget applies to the attempt that passed.
  r=FAILED
  for attempt in 1 2; do
    start=$(date +%s)
    suffix=""; [ "$attempt" = 2 ] && suffix="-retry" && echo "== retrying $flow"
    # A hung driver must not eat the whole job (iOS run 37747667576 hung 80 min): each attempt
    # is killed after 3× its budget. perl's alarm, as macOS has no `timeout`.
    if perl -e 'alarm shift; exec @ARGV' $((budget * 3)) maestro --device "$DEVICE" test "$flow" --test-output-dir "$OUT/${flow%.yaml}$suffix" < /dev/null; then
      r=passed; [ "$attempt" = 2 ] && r="passed on retry"; break
    fi
  done
  secs=$(( $(date +%s) - start ))
  case "$r" in passed*) [ "$secs" -gt "$budget" ] && r="OVER BUDGET ($r)";; esac
  echo "== $flow: $r in ${secs}s (budget ${budget}s)"
  echo "| $flow | $r | $secs | $budget |" >> "$SUMMARY"
  case "$r" in passed*) ;; FAILED) fail=1; break;; *) fail=1;; esac
done < flows.txt
exit $fail
