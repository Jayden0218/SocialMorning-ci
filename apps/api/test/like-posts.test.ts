// Tests M21 like posts: one like with its comments and reactions, private likes, blocks and deleting.
/**
 * M21 US7 (T081). The like-post page is OUR OWN DESIGN (owner, 2026-10-06).
 *
 * Guard "a block keeps comments apart" — the break that turns it red: drop the
 * `NOT ${BLOCKED_EITHER('$3::uuid', 'c.author_id')}` line in `likePost()` in
 * src/db/repos/social/likes.ts; the block test sees the blocked author's comment and goes red.
 * Guard "a private like has no post" — the break: drop `AND (l.likes_public = true OR …)` in
 * `visibleLike()`; the private test gets 200 and goes red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp, type TestDb } from './harness.ts';

type Post = {
  like: { listener: { id: string; displayName: string }; episode: { id: string }; note?: string };
  comments: { id: string; author: { displayName: string }; body: string; mine: boolean }[];
  reactions: { counts: { emoji: string; n: number }[]; mine?: string };
};

async function setup() {
  const t = await freshDb({ picksRaw: [] });
  const owner = await signUp(t, 'o@example.com', 'Owner');
  const a = await signUp(t, 'a@example.com', 'Alex');
  const c = await signUp(t, 'c@example.com', 'Cy');
  await t.q("INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url) VALUES ('e1','https://f/x.xml','g1','Ep one','Show','https://cdn/1.mp3')");
  assert.equal((await t.call('PUT', '/v1/episodes/e1/like', { note: 'Worth an hour.' }, owner.token)).status, 200);
  return { t, owner, a, c, path: `/v1/likes/${owner.id}/e1` };
}
const read = async (t: TestDb, path: string, token?: string) => {
  const r = await t.call('GET', path, undefined, token);
  return { status: r.status, body: r.status === 200 ? ((await r.json()) as Post) : undefined };
};

test('a like post: the like and its note, comments in order (≤ 280), one reaction each, counted', async () => {
  const { t, owner, a, c, path } = await setup();
  const empty = await read(t, path);
  assert.equal(empty.status, 200, 'public: signed out may read');
  assert.equal(empty.body!.like.note, 'Worth an hour.');
  assert.equal(empty.body!.like.listener.displayName, 'Owner');
  assert.deepEqual(empty.body!.comments, []);
  assert.deepEqual(empty.body!.reactions, { counts: [] });

  assert.equal((await t.call('POST', `${path}/comments`, { body: 'Agreed.' })).status, 401, 'signed in to comment');
  const r1 = await t.call('POST', `${path}/comments`, { body: 'Agreed.' }, a.token);
  assert.equal(r1.status, 201);
  assert.equal(((await r1.json()) as { body: string; mine: boolean }).mine, true);
  assert.equal((await t.call('POST', `${path}/comments`, { body: 'Me too.' }, c.token)).status, 201);
  assert.equal((await t.call('POST', `${path}/comments`, { body: 'x'.repeat(281) }, a.token)).status, 422);
  assert.equal((await t.call('POST', `${path}/comments`, { body: '   ' }, a.token)).status, 422);

  assert.equal((await t.call('PUT', `${path}/reactions`, { emoji: '🔥' }, a.token)).status, 204);
  assert.equal((await t.call('PUT', `${path}/reactions`, { emoji: '🔥' }, c.token)).status, 204);
  assert.equal((await t.call('PUT', `${path}/reactions`, { emoji: '👏' }, owner.token)).status, 204);
  assert.equal((await t.call('PUT', `${path}/reactions`, { emoji: 'x'.repeat(17) }, a.token)).status, 422);
  const seen = (await read(t, path, a.token)).body!;
  assert.deepEqual(seen.comments.map((x) => [x.author.displayName, x.body, x.mine]), [['Alex', 'Agreed.', true], ['Cy', 'Me too.', false]]);
  assert.deepEqual(seen.reactions, { counts: [{ emoji: '🔥', n: 2 }, { emoji: '👏', n: 1 }], mine: '🔥' });

  // One reaction per listener: a new emoji replaces mine; DELETE clears it.
  await t.call('PUT', `${path}/reactions`, { emoji: '👏' }, a.token);
  assert.deepEqual((await read(t, path, a.token)).body!.reactions, { counts: [{ emoji: '👏', n: 2 }, { emoji: '🔥', n: 1 }], mine: '👏' });
  assert.equal((await t.call('DELETE', `${path}/reactions`, undefined, a.token)).status, 204);
  assert.equal((await read(t, path, a.token)).body!.reactions.mine, undefined);

  assert.equal((await read(t, `/v1/likes/${owner.id}/nope`)).status, 404);
  assert.equal((await read(t, '/v1/likes/not-a-uuid/e1')).status, 404);
  await t.close();
});

test('a private like has no post for anyone else; its owner still sees it', async () => {
  const { t, owner, a, path } = await setup();
  await t.call('PATCH', '/v1/me', { likesPublic: false }, owner.token);
  assert.equal((await read(t, path, a.token)).status, 404);
  assert.equal((await read(t, path)).status, 404);
  assert.equal((await t.call('POST', `${path}/comments`, { body: 'Hi' }, a.token)).status, 404);
  assert.equal((await t.call('PUT', `${path}/reactions`, { emoji: '🔥' }, a.token)).status, 404);
  assert.equal((await read(t, path, owner.token)).status, 200);
  await t.close();
});

test('blocks: the owner blocked you → no post, no comment; you blocked a commenter → their comment is gone for you only', async () => {
  const { t, owner, a, c, path } = await setup();
  await t.call('POST', `${path}/comments`, { body: 'From Cy.' }, c.token);
  await t.call('POST', '/v1/me/blocks', { listenerId: c.id }, a.token);
  assert.deepEqual((await read(t, path, a.token)).body!.comments.map((x) => x.body), [], 'A blocked Cy: Cy\'s comment is out for A');
  assert.deepEqual((await read(t, path, owner.token)).body!.comments.map((x) => x.body), ['From Cy.'], 'the owner still sees it');
  await t.call('POST', '/v1/me/blocks', { listenerId: a.id }, owner.token);
  assert.equal((await read(t, path, a.token)).status, 404);
  assert.equal((await t.call('POST', `${path}/comments`, { body: 'Hi' }, a.token)).status, 404);
  await t.close();
});

test('a comment is deleted by its author or the like\'s owner, nobody else; unliking removes the post', async () => {
  const { t, owner, a, c, path } = await setup();
  const mine = (await (await t.call('POST', `${path}/comments`, { body: 'One' }, a.token)).json()) as { id: string };
  const other = (await (await t.call('POST', `${path}/comments`, { body: 'Two' }, a.token)).json()) as { id: string };
  assert.equal((await t.call('DELETE', `${path}/comments/${mine.id}`, undefined, c.token)).status, 404, 'not Cy');
  assert.equal((await t.call('DELETE', `${path}/comments/${mine.id}`, undefined, a.token)).status, 204, 'the author');
  assert.equal((await t.call('DELETE', `${path}/comments/${other.id}`, undefined, owner.token)).status, 204, 'the owner');
  assert.deepEqual((await read(t, path)).body!.comments, []);
  await t.call('DELETE', '/v1/episodes/e1/like', undefined, owner.token);
  assert.equal((await read(t, path)).status, 404);
  await t.close();
});
