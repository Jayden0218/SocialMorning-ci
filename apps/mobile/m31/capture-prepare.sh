#!/usr/bin/env bash
# Capture-only preparation of an EXPORT WORKTREE (lane C34; never run in the repo's own tree):
#   git worktree add <dir> <commit>; cp -al node_modules (root, apps/mobile, packages/*) into it; then
#   apps/mobile/m31/capture-prepare.sh <dir>; (cd <dir>/apps/mobile && M27_WEB=1 CI=1 npx expo export -p web --output-dir <out>)
# 1. the sqlite shim that seeds the in-memory stores from localStorage `m31.seed`; 2. the download manager's scheduler off (the web has no downloader,
#    and a seeded in-progress row sent the page into an endless retry loop).
set -euo pipefail
wt="$1"; here="$(cd "$(dirname "$0")" && pwd)"
cp "$here/capture-sqlite-shim.ts" "$wt/apps/mobile/m27/web-shims/sqlite.ts"
sed -i 's|^  async function tick(): Promise<void> {|  async function tick(): Promise<void> {\n    if ((globalThis as { __m31NoTick?: boolean }).__m31NoTick !== false) return; // capture-only (lane C34): the web has no downloader|' "$wt/apps/mobile/src/downloads/manager.ts"
