// Tests that JSON stored as text reads correctly and the repair migration fixes it.
/**
 * The `postgres` driver double-encodes a string parameter cast `$n::jsonb` (a JSON string, not an
 * array or object); pglite does not, so these rows are written by hand the way production stored
 * them before the fix (found 2026-09-29 by the M14 e2e on real PostgreSQL).
 *
 * The break that turns it red: in `src/db/repos/studio/studio-numbers.ts` `completion`, pass `r.ranges`
 * straight to `isComplete` again — the string-stored listen no longer counts as complete.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freshDb, signUp } from './harness.ts';
import { addEpisode, day } from './studio-harness.ts';
import { completion } from '../src/db/repos/studio/studio-numbers.ts';

const FEED = 'https://feeds.example.com/j.xml';

test('string-stored ranges and payloads read correctly, and migration 012 repairs them', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'A');
  await addEpisode(t, FEED, 'E1', 'One', 1_000_000);
  await t.q("INSERT INTO activity (actor_id, kind, episode_id, day, hidden) VALUES ($1, 'listened', 'E1', $2, false)", [a.id, day(0)]);
  await t.q('INSERT INTO listened_ranges (listener_id, episode_id, day, device_id, ranges) VALUES ($1, $2, $3, $4, to_jsonb($5::text))',
    [a.id, 'E1', day(0), 'd1', '[[0,950000]]']);
  await t.q("INSERT INTO library_items (listener_id, kind, item_key, payload, updated_at) VALUES ($1, 'moment', 'm1', to_jsonb($2::text), now())",
    [a.id, '{"note":"hello"}']);

  // Read before the repair: completion counts the listen (95 %), the library hands back an object.
  assert.equal((await completion(t.db, FEED)).all, 1);
  const lib = (await (await t.call('GET', '/v1/me/library', undefined, a.token)).json()) as { items: { key: string; payload: unknown }[] };
  assert.deepEqual(lib.items.find((i) => i.key === 'm1')?.payload, { note: 'hello' });

  // The repair: every UPDATE of migration 012, run again over the bad rows.
  const sql = readFileSync(new URL('../src/db/migrations/012_jsonb_repair.sql', import.meta.url), 'utf8');
  for (const stmt of sql.split('\n').filter((l) => l.startsWith('UPDATE'))) await t.q(stmt);
  const [r] = await t.q<{ a: string; b: string }>(
    `SELECT (SELECT jsonb_typeof(ranges) FROM listened_ranges) AS a, (SELECT jsonb_typeof(payload) FROM library_items) AS b`);
  assert.deepEqual([r!.a, r!.b], ['array', 'object']);
  assert.equal((await completion(t.db, FEED)).all, 1);
  await t.close();
});
