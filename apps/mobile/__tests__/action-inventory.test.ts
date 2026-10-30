// Checks that no button or link was lost when the screens were redesigned.
/**
 * M17 guard G-E3 (FR-007): no action is lost while the screens are rebuilt. `m17/before.json`
 * is every interactive element (role, accessible name, destination) as it was before wave 1;
 * the current source is scanned with the same script, and every `before` entry must still be
 * found — the same surface, name and destination, as many times as before — unless
 * `m17/moves.json` records where it went and why.
 *
 * The break that turns it red: delete the Wallet `MenuRow` in app/(tabs)/me.tsx.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Entry = { surface: string; name: string; destination: string };
const ROOT = join(__dirname, '..');
const key = (e: Entry) => `${e.surface} | ${e.name} | ${e.destination}`;
const count = (es: Entry[]) => es.reduce((m, e) => m.set(key(e), (m.get(key(e)) ?? 0) + 1), new Map<string, number>());

it('G-E3: every action from before wave 1 is still there, or its move is recorded', () => {
  const before = JSON.parse(readFileSync(join(ROOT, 'm17', 'before.json'), 'utf8')).entries as Entry[];
  const moves = JSON.parse(readFileSync(join(ROOT, 'm17', 'moves.json'), 'utf8')) as (Entry & { why: string })[];
  const now = JSON.parse(execFileSync(process.execPath, [join(ROOT, 'scripts', 'action-inventory.mjs'), '--commit', '0000000'], { encoding: 'utf8' })).entries as Entry[];
  expect(before.length).toBeGreaterThan(300);
  for (const m of moves) expect(m.why.length).toBeGreaterThan(10);
  const have = count(now);
  const moved = count(moves);
  const lost: string[] = [];
  for (const [k, n] of count(before)) {
    const short = n - (have.get(k) ?? 0) - (moved.get(k) ?? 0);
    if (short > 0) lost.push(`${k}  (×${short})`);
  }
  expect(lost).toEqual([]);
});
