// Tests comment likes: not your own, repeat-safe, hidden comments not likeable.
/**
 * M12 FR-023 — comment likes. Guard G-C2: your own comment cannot be liked (403 own_comment).
 * The break: drop the author check in `likeable` (src/db/repos/social/comment-likes.ts) — the
 * own-like then answers 200 and this file goes red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { initialsOf } from '../src/db/repos/social/comment-likes.ts';

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', title: 'Ep', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);

async function setup(t: TestDb) {
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 1_000_000 });
  const a = await signUp(t, 'a@example.com', 'alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  const c = await signUp(t, 'c@example.com', '9 lives');
  const res = await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'hello', offsetMs: 1000 }, a.token);
  const id = ((await res.json()) as { comment: { id: string } }).comment.id;
  return { a, b, c, id };
}

type Social = { comments: { id: string; likeCount: number; likedByMe?: boolean; initials: string | null }[] };
const social = async (t: TestDb, token?: string, etag?: string) => t.call('GET', `/v1/episodes/${EP}/social`, undefined, token, etag ? { 'if-none-match': etag } : {});

test('G-C2: liking your own comment is 403 own_comment and stores nothing', async () => {
  const t = await freshDb();
  const { a, id } = await setup(t);
  const r = await t.call('PUT', `/v1/comments/${id}/like`, undefined, a.token);
  assert.equal(r.status, 403);
  assert.equal(((await r.json()) as { error: string }).error, 'own_comment');
  assert.deepEqual(await t.q('SELECT count(*)::int AS n FROM comment_likes'), [{ n: 0 }]);
  await t.close();
});

test('FR-023: like and un-like are idempotent, answer the count, need a session; the poll shows likeCount, likedByMe and initials, and its ETag moves', async () => {
  const t = await freshDb();
  const { b, c, id } = await setup(t);
  assert.equal((await t.call('PUT', `/v1/comments/${id}/like`)).status, 401);
  const first = await social(t, b.token);
  const etag = first.headers.get('etag')!;
  const before = (await first.json()) as Social;
  assert.deepEqual([before.comments[0]!.likeCount, before.comments[0]!.likedByMe, before.comments[0]!.initials], [0, false, 'A']);

  for (let i = 0; i < 2; i++) {
    const r = await t.call('PUT', `/v1/comments/${id}/like`, undefined, b.token);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { likeCount: 1, likedByMe: true });
  }
  assert.deepEqual(await (await t.call('PUT', `/v1/comments/${id}/like`, undefined, c.token)).json(), { likeCount: 2, likedByMe: true });
  const after = await social(t, b.token, etag);
  assert.equal(after.status, 200, 'a like changes the ETag');
  const body = (await after.json()) as Social;
  assert.deepEqual([body.comments[0]!.likeCount, body.comments[0]!.likedByMe], [2, true]);
  const anon = (await (await social(t)).json()) as Social;
  assert.equal(anon.comments[0]!.likeCount, 2);
  assert.equal('likedByMe' in anon.comments[0]!, false, 'likedByMe only for a signed-in viewer');

  const etag2 = after.headers.get('etag')!;
  for (let i = 0; i < 2; i++) {
    const r = await t.call('DELETE', `/v1/comments/${id}/like`, undefined, b.token);
    assert.deepEqual(await r.json(), { likeCount: 1, likedByMe: false });
  }
  assert.equal((await social(t, b.token, etag2)).status, 200, 'an un-like changes the ETag too');
  const unchanged = await social(t, b.token);
  assert.equal((await social(t, b.token, unchanged.headers.get('etag')!)).status, 304);
  assert.equal((await t.call('DELETE', '/v1/comments/00000000-0000-0000-0000-000000000000/like', undefined, b.token)).status, 404);
  await t.close();
});

test('FR-023: a comment you cannot see is 404 — deleted, removed, hidden by the host, or across a block either way; a like goes with its comment', async () => {
  const t = await freshDb();
  const { a, b, c, id } = await setup(t);
  assert.equal((await t.call('PUT', '/v1/comments/not-a-uuid/like', undefined, b.token)).status, 404);
  assert.equal((await t.call('PUT', '/v1/comments/00000000-0000-0000-0000-000000000000/like', undefined, b.token)).status, 404);

  await t.call('POST', '/v1/me/blocks', { listenerId: b.id }, a.token); // the author blocked the liker
  assert.equal((await t.call('PUT', `/v1/comments/${id}/like`, undefined, b.token)).status, 404);
  await t.call('DELETE', `/v1/me/blocks/${b.id}`, undefined, a.token);
  await t.call('POST', '/v1/me/blocks', { listenerId: a.id }, c.token); // the liker blocked the author
  assert.equal((await t.call('PUT', `/v1/comments/${id}/like`, undefined, c.token)).status, 404);

  assert.equal((await t.call('PUT', `/v1/comments/${id}/like`, undefined, b.token)).status, 200);
  await t.q('UPDATE comments SET host_hidden_at = now() WHERE id = $1', [id]);
  assert.equal((await t.call('PUT', `/v1/comments/${id}/like`, undefined, b.token)).status, 404);
  await t.q('UPDATE comments SET host_hidden_at = NULL, removed_at = now() WHERE id = $1', [id]);
  assert.equal((await t.call('PUT', `/v1/comments/${id}/like`, undefined, b.token)).status, 404);
  await t.q('UPDATE comments SET removed_at = NULL WHERE id = $1', [id]);

  assert.equal((await t.call('DELETE', `/v1/comments/${id}`, undefined, a.token)).status, 200);
  assert.deepEqual(await t.q('SELECT count(*)::int AS n FROM comment_likes'), [{ n: 0 }], 'cascade: the like went with the comment');
  await t.close();
});

test('initials: first letter or digit, upper-cased; none → null', () => {
  assert.equal(initialsOf('alex'), 'A');
  assert.equal(initialsOf('  _9 lives'), '9');
  assert.equal(initialsOf('小宇'), '小');
  assert.equal(initialsOf('***'), null);
  assert.equal(initialsOf(null), null);
});
