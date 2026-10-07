// Tests that comment counts include only live top-level comments.
/**
 * M12 FR-080 — the Updates list's comment counts, one call for the page. Guard G-U1: a count
 * leaves out a deleted, a removed and a host-hidden comment and every reply; an unknown id is 0.
 * The break: drop `c.deleted_at IS NULL` from `statsFor` (src/db/repos/discover/discover-extras.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp } from './harness.ts';
import { putEpisode } from './put-episode.ts';

const ep = (guid: string) => ({ feedUrl: 'https://feeds.example.com/x.xml', guid, title: `Ep ${guid}`, enclosureUrl: `https://cdn/${guid}.mp3` });
const id = (guid: string) => fnv1a64('https://feeds.example.com/x.xml\u0001' + guid);

test('G-U1: counts are top-level, live comments only; unknown ids are 0; the body is checked', async () => {
  const t = await freshDb();
  for (const g of ['g1', 'g2']) await putEpisode(t, `${id(g)}`, { ...ep(g), durationMs: 1_000_000 });
  const a = await signUp(t);
  // Straight into the table: the route allows one comment every few seconds.
  const post = async (g: string, parentId: string | null = null) =>
    (await t.q<{ id: string }>('INSERT INTO comments (episode_id, author_id, parent_id, body, offset_ms) VALUES ($1, $2, $3, $4, 1000) RETURNING id', [id(g), a.id, parentId, 'hi']))[0]!.id;
  const first = await post('g1');
  await post('g1');
  await post('g1', first);
  const gone = await post('g1');
  const removed = await post('g1');
  const hidden = await post('g1');
  await t.q('UPDATE comments SET deleted_at = now() WHERE id = $1', [gone]);
  await t.q('UPDATE comments SET removed_at = now() WHERE id = $1', [removed]);
  await t.q('UPDATE comments SET host_hidden_at = now() WHERE id = $1', [hidden]);
  await post('g2');

  const res = await t.call('POST', '/v1/episodes/comment-counts', { ids: [id('g1'), id('g2'), 'never-seen'] });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { counts: Record<string, number>; listeners: Record<string, number> };
  assert.deepEqual(body.counts, { [id('g1')]: 2, [id('g2')]: 1, 'never-seen': 0 });
  assert.deepEqual(body.listeners, { [id('g1')]: 0, [id('g2')]: 0, 'never-seen': 0 });

  assert.equal((await t.call('POST', '/v1/episodes/comment-counts', { ids: [] })).status, 422);
  assert.equal((await t.call('POST', '/v1/episodes/comment-counts', { ids: Array.from({ length: 101 }, (_, i) => `e${i}`) })).status, 422);
  await t.close();
});
