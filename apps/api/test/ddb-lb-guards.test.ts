// Lane LB guards on DynamoDB Local: heat counts a listener once per bucket under racing taps; a late older position never wins; a 3 MB cache body round-trips through chunks.
/**
 * M26 lane LB (tasks.md LB-T10). Each guard names the break that turns it red (seen red on `lane-lb-red`):
 *
 * - G-M26-LB1 (constitution: one count per listener per bucket): a reaction and a timestamped comment by one
 *   listener in one bucket, written at the same moment with the first transaction cancelled by a conflict,
 *   count ONCE; removing one keeps the count, removing both clears it. Break: in src/heat/ddb.ts
 *   `addHeatMark`, also bump the curve when the mark already had refs (count things, not listeners).
 * - G-M26-LB2 (data-model.md §13): a 3 MB feed body round-trips through `CHUNK#n` items; a missing chunk is a
 *   miss, never a corrupt body. Break: in src/db/repos/library/ddb/cache.ts `writeEntry`, always store the
 *   gzip inline (no chunks).
 * - G-M26-LB3 (the positions merge keys on playback progress, never the wall clock): an older observation
 *   whose write lands after a further one keeps the further one. Break: in
 *   src/db/repos/library/ddb/positions.ts `observeOne`, drop the version condition from the Put.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('lane LB guards (need DynamoDB Local: DDB_ENDPOINT, ci/workflows/ddb-api.yml)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshStore } = await import('./harness.ts');
  const { commentItem, episodeItem } = await import('./fixtures.ts');
  const { PutCommand } = await import('@aws-sdk/lib-dynamodb');
  const { encode } = await import('../src/db/ddb/codec.ts');
  const K = await import('../src/db/ddb/keys.ts');
  const { del, get, wrapStore } = await import('../src/db/ddb/store.ts');
  const { withConflicts } = await import('../src/db/ddb/test-wrappers.ts');
  const { drainOutbox } = await import('../src/jobs/outbox.ts');
  const { addHeatMark, heatCurve, removeHeatMark, repairHeat } = await import('../src/heat/ddb.ts');
  const { observeOne } = await import('../src/db/repos/library/ddb/positions.ts');
  const { readEntry, writeEntry, CHUNK_BYTES } = await import('../src/db/repos/library/ddb/cache.ts');
  const { upsertEpisode } = await import('../src/db/repos/library/episodes.ts');
  const { cached } = await import('../src/db/repos/cache.ts');
  const { withStore } = await import('../src/db/backend-ddb.ts');
  type Db = import('../src/db/db.ts').Db;

  /** A Db for DynamoDB-only calls: no Postgres behind it, the bridge off. */
  const noPg: Db = {
    query: async () => { throw new Error('no Postgres in this test'); },
    exec: async () => { throw new Error('no Postgres in this test'); },
    transaction: async () => { throw new Error('no Postgres in this test'); },
  };

  const EP = 'ep-heat';
  const L = '00000000-0000-4000-8000-00000000000a';
  const M = '00000000-0000-4000-8000-00000000000b';

  test('G-M26-LB1: a reaction and a comment by one listener in one bucket count once, even racing with a conflict', async () => {
    const s = await freshStore();
    try {
      const racing = withConflicts(s.store, (n) => n === 1);
      const at = '2026-10-10T01:00:00.000Z';
      const reaction = (t: import('../src/db/ddb/tx.ts').Tx) => t.put('main', encode('reaction', K.reaction(L, EP, 17), { listenerId: L, episodeId: EP, bucket: 17 }), { condition: 'attribute_not_exists(PK)', label: 'reaction' });
      const comment = (t: import('../src/db/ddb/tx.ts').Tx) => t.put('main', encode('comment', K.comment(EP, at, 'c1'), { id: 'c1', episodeId: EP, authorId: L, body: 'x', offsetMs: 17_500, bucket: 17, createdAt: at }), { condition: 'attribute_not_exists(PK)', label: 'comment' });
      await Promise.all([
        addHeatMark(racing, { episodeId: EP, listenerId: L, bucket: 17 }, reaction),
        addHeatMark(racing, { episodeId: EP, listenerId: L, bucket: 17 }, comment),
      ]);
      assert.equal(racing.cancelled(), 1, 'one transaction was cancelled by the conflict and retried');
      assert.ok(await get(s.store, 'main', K.reaction(L, EP, 17)), 'the reaction is stored');
      assert.ok(await get(s.store, 'main', K.comment(EP, at, 'c1')), 'the comment is stored');
      let b = await heatCurve(s.store, EP);
      assert.equal(b[17], 1, 'one listener, one bucket: counted once');
      assert.equal(b.reduce((x, y) => x + y, 0), 1);
      assert.equal(b.length, 100);

      await addHeatMark(s.store, { episodeId: EP, listenerId: M, bucket: 17 });
      assert.equal((await heatCurve(s.store, EP))[17], 2, 'another listener in the same bucket counts');

      await removeHeatMark(s.store, { episodeId: EP, listenerId: L, bucket: 17 }, (t) => t.delete('main', K.reaction(L, EP, 17), { condition: 'attribute_exists(PK)' }));
      assert.equal((await heatCurve(s.store, EP))[17], 2, 'the comment still holds the bucket for L');
      await removeHeatMark(s.store, { episodeId: EP, listenerId: L, bucket: 17 });
      b = await heatCurve(s.store, EP);
      assert.equal(b[17], 1, 'only M is left');
      assert.equal((await repairHeat(s.store, EP)).fixed, false, 'the curve equals a recount from the marks');
      await removeHeatMark(s.store, { episodeId: EP, listenerId: L, bucket: 17 });
      assert.equal((await heatCurve(s.store, EP))[17], 1, 'removing what is not there changes nothing');
    } finally { await s.close(); }
  });

  test('heat: comments parked without a duration are placed by the outbox once it is known, once', async () => {
    const s = await freshStore();
    try {
      const feedUrl = 'https://feeds.example.com/heat.xml';
      await episodeItem(s.store, { id: 'ep-park', feedUrl, guid: 'g', title: 'T', durationMs: null });
      await commentItem(s.store, { episodeId: 'ep-park', authorId: L, body: 'early', offsetMs: 30_000 });
      await commentItem(s.store, { episodeId: 'ep-park', authorId: L, body: 'early too', offsetMs: 30_500 });
      await commentItem(s.store, { episodeId: 'ep-park', authorId: M, body: 'no moment' });
      const db = withStore(noPg, s.store, { bridge: false });
      const row = await upsertEpisode(db, { id: 'ep-park', feedUrl, guid: 'g', title: 'T', enclosureUrl: 'https://cdn/x.mp3', durationMs: 100_000 });
      assert.equal(row.duration_ms, 100_000);
      assert.equal((await heatCurve(s.store, 'ep-park'))[30], 0, 'placed after the commit, by the outbox');
      const r = await drainOutbox(s.store);
      assert.equal(r.failed, 0);
      const b = await heatCurve(s.store, 'ep-park');
      assert.equal(b[30], 1, 'two moments of one listener in bucket 30 count once');
      assert.equal(b.reduce((x, y) => x + y, 0), 1);
      const again = await upsertEpisode(db, { id: 'ep-park', feedUrl, guid: 'g', title: 'T', enclosureUrl: 'https://cdn/x.mp3', durationMs: 5 });
      assert.equal(again.duration_ms, 100_000, 'a known duration is never overwritten');
      await drainOutbox(s.store);
      assert.equal((await heatCurve(s.store, 'ep-park'))[30], 1, 'nothing placed twice');
    } finally { await s.close(); }
  });

  test('G-M26-LB2: a 3 MB feed body round-trips through chunks; a missing chunk is a cache miss', async () => {
    const s = await freshStore();
    try {
      const body = { episodes: [{ guid: 'g', blob: randomBytes(2_300_000).toString('base64') }] };
      const key = 'feed:https://feeds.example.com/big.xml';
      assert.ok(JSON.stringify(body).length > 3_000_000);
      await writeEntry(s.store, key, body, Date.parse('2026-10-10T00:00:00Z'));
      const entry = await get(s.store, 'cache', K.cacheEntry(key));
      const chunks = Number(entry?.['chunks'] ?? 0);
      assert.ok(chunks > 1, `stored in ${chunks} chunks of ≤ ${CHUNK_BYTES} bytes`);
      assert.equal(entry?.['gz'], undefined);
      assert.deepEqual((await readEntry(s.store, key))?.body, body, 'read back equal');

      // Through the repo function the app calls (no fetch: the copy is fresh).
      const db = withStore(noPg, s.store, { bridge: false });
      const got = await cached(db, key, Number.MAX_SAFE_INTEGER, async () => { throw new Error('should not fetch'); });
      assert.deepEqual(got.body, body);

      // A smaller body over it: the leftover chunks of the bigger one go.
      await writeEntry(s.store, key, { small: true }, Date.parse('2026-10-10T00:01:00Z'));
      assert.deepEqual((await readEntry(s.store, key))?.body, { small: true });
      assert.equal(await get(s.store, 'cache', K.cacheChunk(key, 1)), undefined, 'no chunk left behind');

      // A piece missing: a miss (refetched), never a corrupt body.
      await writeEntry(s.store, key, body, Date.parse('2026-10-10T00:02:00Z'));
      await del(s.store, 'cache', K.cacheChunk(key, 1));
      assert.equal(await readEntry(s.store, key), undefined);
      const refetched = await cached(db, key, Number.MAX_SAFE_INTEGER, async () => ({ fresh: 1 }));
      assert.deepEqual(refetched, { body: { fresh: 1 }, stale: false });
    } finally { await s.close(); }
  });

  test('G-M26-LB3: an older position whose write lands after a further one never replaces it', async () => {
    const s = await freshStore();
    try {
      const obs = (offsetMs: number, progressSeq: number) => ({ episodeId: 'ep-pos', offsetMs, finished: false, progressSeq, explicitSeek: false });
      let injected = 0;
      // Phone B read the (empty) position; before its write lands, phone A's further position is written.
      const late = wrapStore(s.store, async (cmd, next) => {
        const item = (cmd.input as { Item?: { SK?: string } }).Item;
        if (cmd instanceof PutCommand && String(item?.SK).startsWith('POS#') && injected === 0) {
          injected++;
          await observeOne(s.store, L, 'phoneA', obs(960_000, 5), new Date('2026-10-10T00:00:01Z'));
        }
        return next(cmd);
      });
      const row = await observeOne(late, L, 'phoneB', obs(900_000, 9), new Date('2026-10-10T00:00:02Z'));
      assert.equal(injected, 1);
      assert.equal(row.offset_ms, 960_000, 'the further position stands');
      assert.equal(row.device_id, 'phoneA');
      const stored = await get(s.store, 'main', K.position(L, 'ep-pos'));
      assert.equal(stored?.['offsetMs'], 960_000);
      assert.equal(stored?.['deviceId'], 'phoneA');

      // The same rule with a write already there: progress never goes backwards; an explicit seek does.
      assert.equal((await observeOne(s.store, L, 'phoneB', obs(100, 10), new Date('2026-10-10T00:00:03Z'))).offset_ms, 960_000);
      const seek = await observeOne(s.store, L, 'phoneB', { ...obs(300_000, 11), explicitSeek: true }, new Date('2026-10-10T00:00:04Z'));
      assert.equal(seek.offset_ms, 300_000);
    } finally { await s.close(); }
  });
}
