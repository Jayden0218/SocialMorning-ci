#!/bin/bash
# The device check (docs/device-check/routes.md) on the iPhone simulator, from ci/workflows/ios-journey.yml
# with suite=check. Runs every route flow r*.yaml in this folder one at a time, so a red flow never stops
# the next one, then sets the largest text size and Reduce Motion and runs R04, R07, R08 and R13 again
# (R20, R21) with "-xl" screenshot names. Never run on a laptop: CI only.
#
#   run-check.sh <simulator udid> <output dir>
#
# Writes into <output dir>: summary.tsv (flow, exit code, seconds), junit/<flow>.xml, maestro/<flow>/ (Maestro's
# test output: commands.json, logs, failing-step screenshots and view hierarchy), hierarchy/<flow>-end.json (the
# view hierarchy of the screen each flow ended on), screenshots/ (every takeScreenshot, flat), started-at.txt,
# a11y-settings.txt (what the simulator says after R20/R21 are set). Exits 0; the workflow reads summary.tsv.
set -u
UDID=$1
OUT=$2
API=${E2E_API:-http://localhost:8787}
cd "$(dirname "$0")/.." # apps/mobile/.maestro: flows reference subflows by relative path
mkdir -p "$OUT/junit" "$OUT/maestro" "$OUT/hierarchy" "$OUT/screenshots"
date '+%Y-%m-%d %H:%M:%S' > "$OUT/started-at.txt" # local time, the form `log show --start` takes
printf 'flow\texit\tseconds\n' > "$OUT/summary.tsv"
# Ids from the seed (apps/api/scripts/journey.ts writes JOURNEY_OUT) for pages that only open by path.
J=${JOURNEY_OUT:-../../api/journey.json}
EP1_ID=$(jq -r '.episodes[0].episodeId // empty' "$J" 2> /dev/null)
EP2_ID=$(jq -r '.episodes[1].episodeId // empty' "$J" 2> /dev/null)
echo "episode ids from $J: ${EP1_ID:-none} ${EP2_ID:-none}"

faults_off() {
  # R18 makes the test server slow on purpose (POST /__e2e/fault); never leave it on for the next flow.
  curl -s -m 5 -X POST -H 'content-type: application/json' -d '{"mode":"off"}' "$API/__e2e/fault" > /dev/null || true
}

run_flow() {
  local name=$1 file=$2
  shift 2
  local start code=0
  start=$(date +%s)
  echo "::group::$name"
  maestro --device "$UDID" test "$file" --format junit --output "$OUT/junit/$name.xml" \
    --test-output-dir "$OUT/maestro/$name" -e "EP1_ID=$EP1_ID" -e "EP2_ID=$EP2_ID" "$@" || code=$?
  # The screen the flow ended on, as Maestro reads it (labels, frames) — for the accessibility review.
  maestro --device "$UDID" hierarchy > "$OUT/hierarchy/$name-end.json" 2> "$OUT/hierarchy/$name-end.err" || true
  faults_off
  echo "::endgroup::"
  printf '%s\t%s\t%s\n' "$name" "$code" "$(($(date +%s) - start))" >> "$OUT/summary.tsv"
  [ "$code" -eq 0 ] || echo "::error title=device check::$name failed (exit $code)"
}

# 035 (A3): what was DRAWN. a11y-frames.mjs reads every hierarchy this run wrote and fails on a labelled icon control under 44 x 44 pt;
# its result is one more row of summary.tsv (`a11y-frames`), so the workflow's verdict goes red with it.
frames_check() {
  if node check/a11y-frames.mjs "$OUT" > "$OUT/a11y-frames.txt" 2>&1; then code=0; else code=$?; fi
  cat "$OUT/a11y-frames.txt"
  printf 'a11y-frames\t%s\t0\n' "$code" >> "$OUT/summary.tsv"
  [ "$code" -eq 0 ] || echo "::error title=device check::a11y-frames failed (exit $code), see a11y-frames.txt"
}

# 039 (T020): the layout grid. edges-check.mjs reads hierarchy/ of every route flow r*.yaml in this folder (and -xl; a flow that was not run is `skipped`) and fails text left of the 20 pt gutter or more than 4 distinct
# left edges; its table is edges-check.txt and its result one more row of summary.tsv (`edges-check`). A red row never stops the other flows (they have run).
edges_check() {
  local code=0
  node check/edges-check.mjs "$OUT" > "$OUT/edges-check.txt" 2>&1 || code=$?
  cat "$OUT/edges-check.txt"
  printf 'edges-check\t%s\t0\n' "$code" >> "$OUT/summary.tsv"
  [ "$code" -eq 0 ] || echo "::error title=device check::edges-check failed (exit $code), see edges-check.txt"
}

# 036 (C2): how many `GET /v1/categories/` one Discover visit asked for. r25-categories.yaml brackets its two visits with marker requests in
# api.log (the test server's request log, which ios-journey writes at the repo root); check-categories.mjs counts between them. Its result is
# one more row of summary.tsv (`categories-count`), only when r25 ran. A missing api.log is a red row, not a skipped one.
categories_check() {
  [ -e "$OUT/maestro/r25-categories" ] || return 0
  local log=${E2E_API_LOG:-../../../api.log} code=0 # this script runs in apps/mobile/.maestro: the repo root is three levels up
  node check/check-categories.mjs "$log" > "$OUT/categories-count.txt" 2>&1 || code=$?
  cat "$OUT/categories-count.txt"
  printf 'categories-count\t%s\t0\n' "$code" >> "$OUT/summary.tsv"
  [ "$code" -eq 0 ] || echo "::error title=device check::categories-count failed (exit $code), see categories-count.txt"
}

# CHECK_FLOWS (workflow input check_flows): a glob of route flows, default every one. Anything narrower skips
# the R20/R21 re-runs (used for the guard: one flow broken on purpose, run alone).
PATTERN=${CHECK_FLOWS:-r*}
for f in check/$PATTERN.yaml; do
  [ -e "$f" ] || { echo "::error title=device check::no flow matches $PATTERN"; printf 'none\t1\t0\n' >> "$OUT/summary.tsv"; break; }
  run_flow "$(basename "$f" .yaml)" "$f"
done
if [ "$PATTERN" != "r*" ]; then
  find "$OUT/maestro" -path '*takeScreenshot*' -name '*.png' -exec cp {} "$OUT/screenshots/" \; 2> /dev/null || true
  frames_check
  edges_check
  categories_check
  cat "$OUT/summary.tsv"
  exit 0
fi

# R20: the largest accessibility text size (`xcrun simctl ui <udid> content_size <size>`).
# R21: Reduce Motion. simctl has no switch for it; it is the com.apple.Accessibility default ReduceMotionEnabled,
# read by apps at launch (every flow launches the app again). The workflow already sets it at boot for the
# driver's sake, so R21 here is written again and read back, not toggled from off.
xcrun simctl ui "$UDID" content_size accessibility-extra-extra-extra-large
xcrun simctl spawn "$UDID" defaults write com.apple.Accessibility ReduceMotionEnabled -bool true
{
  echo "content_size: $(xcrun simctl ui "$UDID" content_size 2>&1)"
  echo "ReduceMotionEnabled: $(xcrun simctl spawn "$UDID" defaults read com.apple.Accessibility ReduceMotionEnabled 2>&1)"
} | tee "$OUT/a11y-settings.txt"
for n in r04-discover r07-episode-player r08-comments r13-me; do
  run_flow "$n-xl" "check/$n.yaml" -e SUFFIX=-xl
done
xcrun simctl ui "$UDID" content_size large || true

# Every takeScreenshot in one flat folder (Maestro writes them under each flow's takeScreenshot/).
find "$OUT/maestro" -path '*takeScreenshot*' -name '*.png' -exec cp {} "$OUT/screenshots/" \; 2> /dev/null || true
find . .. -maxdepth 1 -name 'r[0-9]*.png' -exec cp {} "$OUT/screenshots/" \; 2> /dev/null || true
echo "screenshots: $(find "$OUT/screenshots" -name '*.png' | wc -l)"
frames_check
edges_check
categories_check
cat "$OUT/summary.tsv"
exit 0
