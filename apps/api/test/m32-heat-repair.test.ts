// Tests M32 lane FB task 3: repairing / replacing a heat curve while heat.bump entries wait in the outbox must not double count.
/** Guard — the break that turns it red: in src/heat/ddb.ts remove the drain of the episode's pending heat.bump entries from repairHeat / replaceHeat. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('heat repair guard (needs DynamoDB Local: DDB_ENDPOINT)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshDb, signUp } = await import('./harness.ts');
  const { putEpisode } = await import('./put-episode.ts');
  const { createComment } = await import('../src/db/repos/social/comments.ts');
  const { heatCurve, repairHeat, replaceHeat, HEAT_BUMP } = await import('../src/heat/ddb.ts');
  const { drainOutbox, pendingOutbox, parkedOutbox, OUTBOX_PARK_AFTER } = await import('../src/jobs/outbox.ts');

  const EP = 'ep-heat-repair';
  const ep = { feedUrl: 'https://feeds.example.com/repair.xml', guid: 'r1', title: 'Repair', showTitle: 'Show', enclosureUrl: 'https://cdn.example.com/r.mp3', durationMs: 1_000_000 };
  const sum = (b: number[]): number => b.reduce((x, y) => x + y, 0);

  test('FB3: repairHeat before the outbox drains: the later drain does not count the comment a second time', async () => {
    const t = await freshDb();
    try {
      await putEpisode(t, EP, ep);
      const a = await signUp(t, 'r1@example.com', 'R1');
      await createComment(t.db, { episodeId: EP, authorId: a.id, body: 'hi', offsetMs: 500_000 });
      assert.equal((await pendingOutbox(t.store)).filter((o) => o['kind'] === HEAT_BUMP).length, 1, 'a bump waits');
      await repairHeat(t.store, EP);
      await drainOutbox(t.store);
      const b = await heatCurve(t.store, EP);
      assert.equal(b[50], 1, 'one in the bucket, not two');
      assert.equal(sum(b), 1);
    } finally { await t.close(); }
  });

  test('FB3: replaceHeat before the outbox drains: the later drain does not count the comment a second time', async () => {
    const t = await freshDb();
    try {
      await putEpisode(t, EP, ep);
      const a = await signUp(t, 'r2@example.com', 'R2');
      await createComment(t.db, { episodeId: EP, authorId: a.id, body: 'hi', offsetMs: 500_000 });
      await replaceHeat(t.store, EP, [{ listenerId: a.id, bucket: 50, refs: 1 }]);
      await drainOutbox(t.store);
      const b = await heatCurve(t.store, EP);
      assert.equal(b[50], 1);
      assert.equal(sum(b), 1);
    } finally { await t.close(); }
  });

  test('FB3: a parked heat.bump leaves the curve short; repairHeat counts the marks, so it fixes it', async () => {
    const t = await freshDb();
    try {
      await putEpisode(t, EP, ep);
      const a = await signUp(t, 'r3@example.com', 'R3');
      await createComment(t.db, { episodeId: EP, authorId: a.id, body: 'hi', offsetMs: 500_000 });
      const failing = { [HEAT_BUMP]: async () => { throw new Error('boom'); } };
      for (let i = 0; i < OUTBOX_PARK_AFTER; i++) await drainOutbox(t.store, failing);
      assert.equal((await parkedOutbox(t.store)).filter((o) => o['kind'] === HEAT_BUMP).length, 1, 'parked');
      assert.equal(sum(await heatCurve(t.store, EP)), 0, 'the curve is short');
      const r = await repairHeat(t.store, EP);
      assert.equal(r.fixed, true);
      const b = await heatCurve(t.store, EP);
      assert.equal(b[50], 1);
      assert.equal(sum(b), 1);
    } finally { await t.close(); }
  });
}
