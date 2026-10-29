// Checks that no button or link was lost when the screens were redesigned.
/**
 * M17 guard G-E3 (FR-007), carried on by M31: no action is lost while the screens are rebuilt.
 *
 * The M17 baseline (`m17/before.json`) was read with the first inventory script, which missed
 * custom tappables (BarButton, IconButton, …) and let a one-line element take the name of the next
 * one (review fix L9, 2026-10-28). Its names no longer match the corrected script, so the guard now
 * runs the M31 replay: `m31/actions-before.json` (the corrected script on the pre-redesign commit
 * 82b9dc2, which already includes everything M17 kept) against the current source, with
 * `m31/moves.json` for the moves the Pulse drawings approve. A move only counts when its `now`
 * target exists, so a move cannot hide a deletion.
 *
 * The break that turns it red: delete the Clip button in src/ui/player/PlayerTray.tsx
 * (scripts/action-replay.test.mjs covers the logic; this runs it against the real tree).
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

it('G-E3: every action from before the redesign is still there, or its move is recorded', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'action-replay.mjs')], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  const lost = r.stdout.split('\n').filter((l) => l.startsWith('MISSING') || l.startsWith('BAD'));
  expect(lost).toEqual([]);
  expect(r.status).toBe(0);
});
