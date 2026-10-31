// Tests M32 lane FB task 2: an episode item missing title / feedUrl / enclosureUrl must not fail "my comments" or the export.
/** Guard — the break that turns it red: in db/repos/social/ddb/my-comments.ts read `title`, `feedUrl` or `enclosureUrl` with `str` again. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp } from './harness.ts';
import { seedEpisode } from './dv-neutral.ts';
import { seedComment } from './sc-neutral.ts';

test('FB2: an episode item without title, feedUrl and enclosureUrl: GET my comments and the export still answer, comment present', async () => {
  const t = await freshDb({});
  try {
    const a = await signUp(t, 'fb2@example.com', 'FB2');
    await seedEpisode(t, { id: 'e-partial', feedUrl: 'https://f.example/p.xml', guid: 'gp', title: 'Partial' });
    await seedComment(t, { episodeId: 'e-partial', authorId: a.id, body: 'still here', agoMs: 60_000 });
    const { update } = await import('../src/db/ddb/store.ts');
    const K = await import('../src/db/ddb/keys.ts');
    await update(t.store, 'main', K.episode('e-partial'), { update: 'REMOVE #t, #f, #e', names: { '#t': 'title', '#f': 'feedUrl', '#e': 'enclosureUrl' } });

    const res = await t.call('GET', '/v1/me/comments', undefined, a.token);
    assert.equal(res.status, 200);
    const body = await res.json() as { items: { body: string; episode: { title: string; feedUrl: string; enclosureUrl: string } }[] };
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0]!.body, 'still here');
    assert.equal(typeof body.items[0]!.episode.title, 'string');

    const { exportData } = await import('../src/db/repos/account/data-export.ts');
    const exported = await exportData(t.db, a.id) as { comments: { body: string }[] };
    assert.equal(exported.comments.length, 1);
    assert.equal(exported.comments[0]!.body, 'still here');
  } finally { await t.close(); }
});
