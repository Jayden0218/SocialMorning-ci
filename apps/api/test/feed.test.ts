/** quickstart A7 (ordering half): the Following feed — clips and comments by followed people, newest first, gone on unfollow, ETag/304. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', title: 'Ep 1', showTitle: 'Show', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
type Item = { id: number; kind: string; actor: { displayName: string }; episode: { title: string }; momentMs: number | null; refId: string | null };
const feedOf = async (t: TestDb, token: string, before?: string) => {
  const r = await t.call('GET', `/v1/me/feed${before ? `?before=${encodeURIComponent(before)}` : ''}`, undefined, token);
  return { status: r.status, etag: r.headers.get('etag'), body: r.status === 200 ? ((await r.json()) as { items: Item[]; next?: string }) : undefined };
};

test('A7: A follows B; B clips and comments; A sees both newest first with the moment; a reply is not an item; unfollow empties it', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 2_000_000 });
  const a = await signUp(t);
  const b = await signUp(t, 'b@example.com', 'Bea');
  assert.deepEqual((await feedOf(t, a.token)).body!.items, []);
  await t.call('PUT', `/v1/listeners/${b.id}/follow`, undefined, a.token);
  const clip = ((await (await t.call('POST', `/v1/episodes/${EP}/clips`, { clientId: 'k', startMs: 872_000, endMs: 910_000 }, b.token)).json()) as { clip: { id: string } }).clip;
  const comment = ((await (await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'hello', offsetMs: 141_603 }, b.token)).json()) as { comment: { id: string } }).comment;
  await t.q(`UPDATE activity SET created_at = created_at + interval '1 minute' WHERE kind = 'commented'`);
  await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'a reply', parentId: comment.id }, b.token);
  const f = await feedOf(t, a.token);
  assert.equal(f.status, 200);
  assert.ok(f.etag);
  assert.deepEqual(f.body!.items.map((i) => [i.kind, i.actor.displayName, i.episode.title, i.momentMs, i.refId]), [
    ['commented', 'Bea', 'Ep 1', 141_603, comment.id],
    ['clipped', 'Bea', 'Ep 1', 872_000, clip.id],
  ]);
  const again = await t.call('GET', '/v1/me/feed', undefined, a.token, { 'if-none-match': f.etag! });
  assert.equal(again.status, 304);
  // B's own feed does not contain B's activity (nobody follows themselves).
  assert.deepEqual((await feedOf(t, b.token)).body!.items, []);
  await t.call('DELETE', `/v1/listeners/${b.id}/follow`, undefined, a.token);
  assert.deepEqual((await feedOf(t, a.token)).body!.items, []);
  // Deleting the comment removes its item even for followers.
  await t.call('PUT', `/v1/listeners/${b.id}/follow`, undefined, a.token);
  await t.call('DELETE', `/v1/comments/${comment.id}`, undefined, b.token);
  assert.deepEqual((await feedOf(t, a.token)).body!.items.map((i) => i.kind), ['clipped']);
  await t.close();
});

test('A7: 20 a page with a (created_at, id) cursor', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 2_000_000 });
  const a = await signUp(t);
  const b = await signUp(t, 'b@example.com', 'Bea');
  await t.call('PUT', `/v1/listeners/${b.id}/follow`, undefined, a.token);
  for (let i = 0; i < 23; i++) await t.call('POST', `/v1/episodes/${EP}/clips`, { clientId: `c${i}`, startMs: i * 1000, endMs: i * 1000 + 5000 }, b.token);
  const p1 = (await feedOf(t, a.token)).body!;
  assert.equal(p1.items.length, 20);
  assert.ok(p1.next);
  const p2 = (await feedOf(t, a.token, p1.next)).body!;
  assert.equal(p2.items.length, 3);
  assert.equal(p2.next, undefined);
  const ids = [...p1.items, ...p2.items].map((i) => i.id);
  assert.deepEqual(ids, [...ids].sort((x, y) => y - x));
  assert.equal(new Set(ids).size, 23);
  assert.equal((await feedOf(t, a.token, 'garbage')).body!.items.length, 20); // a bad cursor is ignored
  await t.close();
});
