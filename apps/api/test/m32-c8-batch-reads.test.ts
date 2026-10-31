// Tests M32 T046 (review finding C8): "my comments" and the comments export read in batches, not one GetItem per comment.
/** Guard — the break that turns it red: in my-comments.ts / export-items.ts go back to `commentItemById` in a loop. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp } from './harness.ts';
import { seedEpisode } from './dv-neutral.ts';
import { seedComment } from './sc-neutral.ts';

function counting(store: { send: (c: { constructor: { name: string } }) => Promise<unknown> }) {
  const c = { get: 0, batch: 0 };
  const orig = store.send.bind(store);
  (store as { send: unknown }).send = (cmd: { constructor: { name: string } }) => {
    if (cmd.constructor.name === 'GetCommand') c.get++; else if (cmd.constructor.name === 'BatchGetCommand') c.batch++;
    return orig(cmd);
  };
  return { c, reset: () => { c.get = 0; c.batch = 0; } };
}

test('C8: 50 comments are read with batch reads and no single GetItem (my comments and the export)', async () => {
  const t = await freshDb({});
  try {
    const a = await signUp(t, 'c8@example.com', 'C8');
    await seedEpisode(t, { id: 'e1', feedUrl: 'https://f.example/1.xml', guid: 'g1', title: 'One' });
    for (let i = 0; i < 50; i++) await seedComment(t, { episodeId: 'e1', authorId: a.id, body: `c${i}`, agoMs: (60 - i) * 60_000 });
    const ops = counting(t.store as never);

    // The function itself, not the route: the route's sign-in check makes reads of its own.
    const { myComments } = await import('../src/db/repos/social/ddb/my-comments.ts');
    const body = await myComments(t.store, t.db, a.id) as unknown as { items: { body: string }[] };
    assert.equal(body.items.length, 50);
    assert.equal(body.items[0]!.body, 'c49', 'newest first');
    assert.equal(ops.c.get, 0, `no single GetItem, got ${ops.c.get}`);
    assert.ok(ops.c.batch <= 3 && ops.c.batch >= 1, `at most 3 batch reads (refs, comments, episodes), got ${ops.c.batch}`);

    ops.reset();
    const { exportItemsSection } = await import('../src/db/repos/account/ddb/export-items.ts');
    const items = await exportItemsSection(t.store, 'comments', a.id);
    assert.equal(items!.length, 50);
    assert.equal(ops.c.get, 0, `export: no single GetItem, got ${ops.c.get}`);
    assert.ok(ops.c.batch <= 2, `export: at most 2 batch reads, got ${ops.c.batch}`);
  } finally { await t.close(); }
});
