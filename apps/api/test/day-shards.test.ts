// M32 C7 (specs/034-m32-code-review, review.md C7): the day index `DAY#<day>` is sharded `DAY#<day>#<0-7>`; readers also read the old unsharded key.
/**
 * Guard G-M32-C7. Break that turns it red: in src/db/ddb/keys.ts `E1`, return `DAY#${d}` again (no shard) — "writes spread
 * over more than one shard" fails; or in src/db/ddb/day-index.ts `dayPks`, drop the unsharded key — the old-shaped item vanishes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('day shard guard (needs DynamoDB Local: DDB_ENDPOINT)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshStore } = await import('./harness.ts');
  const K = await import('../src/db/ddb/keys.ts');
  const { put, get } = await import('../src/db/ddb/store.ts');
  const { encode } = await import('../src/db/ddb/codec.ts');
  const { listenMarkItem, listensSince } = await import('../src/db/repos/discover/ddb/listens.ts');
  const { recordEvents, sweepOldRecEvents } = await import('../src/db/repos/library/ddb/rec-events.ts');
  const { withStore } = await import('../src/db/backend-ddb.ts');

  test('E1: new writes spread over the 8 shards of their day, the same item always lands on the same one', () => {
    const pks = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const g = K.E1('2026-10-10', 'lsn', `2026-10-10T01:00:00.000Z#${i}`);
      assert.match(g.E1PK, /^DAY#2026-10-10#[0-7]$/);
      assert.equal(K.E1('2026-10-10', 'lsn', `2026-10-10T01:00:00.000Z#${i}`).E1PK, g.E1PK, 'stable');
      pks.add(g.E1PK);
    }
    assert.ok(pks.size > 1, `writes spread over more than one shard (saw ${pks.size})`);
    assert.equal(pks.size <= 8, true);
  });

  test('listens: an old-shaped index item (DAY#<day>) and new-shaped ones are all returned by the day reader', async () => {
    const s = await freshStore();
    try {
      const at = '2026-10-10T01:00:00.000Z';
      // Before the change: E1PK = DAY#<day>, nothing after it.
      const oldMark = listenMarkItem({ actorId: 'old-actor', episodeId: 'ep-old', day: '2026-10-10', hidden: false, createdAt: at });
      await put(s.store, 'events', { ...oldMark, E1PK: 'DAY#2026-10-10' });
      const shards = new Set<string>();
      for (let i = 0; i < 24; i++) {
        const m = listenMarkItem({ actorId: `a${i}`, episodeId: `ep${i}`, day: '2026-10-10', hidden: false, createdAt: `2026-10-10T01:00:0${i % 10}.${String(100 + i)}Z` });
        shards.add(String(m['E1PK']));
        await put(s.store, 'events', m);
      }
      assert.ok(shards.size > 1, 'new listen writes spread over shards');
      const got = await listensSince(s.store, Date.parse('2026-10-10T00:00:00.000Z'), Date.parse('2026-10-10T12:00:00.000Z'));
      assert.equal(got.length, 25, 'old + new shapes');
      assert.ok(got.some((g) => g.actorId === 'old-actor'), 'the old-shaped one is still visible');
      const times = got.map((g) => g.at);
      assert.deepEqual(times, [...times].sort(), 'still in time order');
    } finally { await s.close(); }
  });

  test('rec events: the 90-day sweep deletes old-shaped and new-shaped items of a day', async () => {
    const s = await freshStore();
    try {
      const day90 = Date.now() - 100 * 86_400_000;
      const at = new Date(day90).toISOString();
      const db = withStore(undefined, s.store);
      await recordEvents(s.store, db, 'l1', Array.from({ length: 12 }, (_, i) => ({ episodeId: `e${i}`, channel: 'chart' as const, rank: i, kind: 'impression' as const, at })));
      // An item of the same day in the old shape.
      const old = encode('recEvent', K.ev.recEvent('l-old', K.ts(at), 9999), { id: 9999, listenerId: 'l-old', episodeId: 'e', channel: 'home', rank: 1, kind: 'impression', at: K.ts(at) },
        { gsi: { E1PK: `DAY#${K.day(at)}`, E1SK: `re#l-old#9999` } });
      await put(s.store, 'events', old);
      const n = await sweepOldRecEvents(s.store, db);
      assert.equal(n, 13);
      assert.equal(await get(s.store, 'events', K.ev.recEvent('l-old', K.ts(at), 9999)), undefined, 'the old-shaped item was swept');
    } finally { await s.close(); }
  });
}
