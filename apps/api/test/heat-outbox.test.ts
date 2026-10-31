// M32 C6 (specs/034-m32-code-review, review.md C6): a comment never touches the episode's one hot heat item; the outbox applies the curve.
/**
 * Guard G-M32-C6. Break that turns it red: in src/heat/ddb.ts `addHeatMark`, put the curve step back into the
 * comment's transaction (call `curveStep(t, store, heat, m, 1)` after the mark put) — the curve then moves before the drain.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('heat outbox guard (needs DynamoDB Local: DDB_ENDPOINT)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshDb, signUp } = await import('./harness.ts');
  const { putEpisode } = await import('./put-episode.ts');
  const { createComment } = await import('../src/db/repos/social/comments.ts');
  const { heatCurve, HEAT_BUMP } = await import('../src/heat/ddb.ts');
  const { drainOutbox, registeredHandlers, pendingOutbox } = await import('../src/jobs/outbox.ts');
  const { get } = await import('../src/db/ddb/store.ts');
  const K = await import('../src/db/ddb/keys.ts');

  const EP = 'ep-heat-burst';
  const ep = { feedUrl: 'https://feeds.example.com/burst.xml', guid: 'b1', title: 'Burst', showTitle: 'Show', enclosureUrl: 'https://cdn.example.com/b.mp3', durationMs: 1_000_000 };

  test('G-M32-C6: 50 comments at once all succeed without touching the heat item; the drain then counts all 50, once each', async () => {
    const t = await freshDb();
    try {
      await putEpisode(t, EP, ep);
      const people = await Promise.all(Array.from({ length: 50 }, (_, i) => signUp(t, `h${i}@example.com`, `H${i}`)));
      const results = await Promise.allSettled(people.map((p, i) =>
        createComment(t.db, { episodeId: EP, authorId: p.id, body: `c${i}`, offsetMs: i * 20_000 })));
      assert.deepEqual(results.filter((r) => r.status === 'rejected'), [], 'every post succeeded');
      assert.equal(await get(t.store, 'main', K.heat(EP)), undefined, 'the comments did not touch the heat item');
      assert.equal((await pendingOutbox(t.store)).filter((o) => o['kind'] === HEAT_BUMP).length, 50, 'one curve entry per comment');

      const entries = (await pendingOutbox(t.store)).filter((o) => o['kind'] === HEAT_BUMP);
      const r = await drainOutbox(t.store);
      assert.equal(r.failed, 0);
      const b = await heatCurve(t.store, EP);
      assert.equal(b.reduce((x, y) => x + y, 0), 50, 'all 50 are on the curve');
      for (let i = 0; i < 50; i++) assert.equal(b[i * 2], 1, `bucket ${i * 2}`);

      // An entry run twice (a crash between handler and delete) counts once.
      const e = entries[0]!;
      const handler = registeredHandlers()[HEAT_BUMP]!;
      await handler(t.store, { id: String(e['id']), kind: HEAT_BUMP, payload: e['payload'] as Record<string, unknown>, createdAt: String(e['createdAt']), attempts: 0, key: { PK: String(e['PK']), SK: String(e['SK']) } });
      assert.equal((await heatCurve(t.store, EP)).reduce((x, y) => x + y, 0), 50, 'a repeated entry changes nothing');
    } finally { await t.close(); }
  });
}
