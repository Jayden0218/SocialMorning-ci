// Tests M32 T049 (review finding A6): reply-depth errors are typed (ApiError 'reply_depth'); the error mapper does not read message text.
/** Guard — the break that turns it red: put `/reply_depth/.test(err.message)` back in app.ts's onError. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp } from './harness.ts';
import { seedEpisode } from './dv-neutral.ts';
import { seedComment } from './sc-neutral.ts';

test('A6: a reply to a reply is 422 reply_depth with the same body', async () => {
  const t = await freshDb({});
  try {
    const a = await signUp(t, 'a6@example.com', 'A6');
    await seedEpisode(t, { id: 'e1', feedUrl: 'https://f.example/1.xml', guid: 'g1', title: 'One' });
    const top = await seedComment(t, { episodeId: 'e1', authorId: a.id, body: 'top', agoMs: 60_000 });
    const reply = await seedComment(t, { episodeId: 'e1', authorId: a.id, body: 'reply', parentId: top, agoMs: 30_000 });
    const r = await t.call('POST', '/v1/episodes/e1/comments', { body: 'too deep', parentId: reply }, a.token);
    assert.equal(r.status, 422);
    assert.deepEqual(await r.json(), { error: 'reply_depth', message: 'You can reply to a comment, not to a reply.' });
  } finally { await t.close(); }
});

test('A6: a generic Error whose message mentions reply_depth is a 500, not a 422', async () => {
  const t = await freshDb({});
  try {
    (t.app as unknown as { get: (p: string, h: () => never) => void }).get('/v1/_a6_boom', () => { throw new Error('something reply_depth something'); });
    const r = await t.app.request('/v1/_a6_boom');
    assert.equal(r.status, 500);
  } finally { await t.close(); }
});
