// Tests M21 notifications: reply, like, mention and follow notices, the self/block/mute guard, paging and seen.
/**
 * M21 US10 (specs/022-m21-the-xiaoyuzhou-gaps, T107).
 *
 * G-M21-9 — `notifications` is never written for a self-act, nor to a recipient who blocked or
 *   muted the actor.
 *   The break that turns it red: in `src/db/repos/social/notifications.ts` `notify`, drop the
 *   self / block / mute conditions from the INSERT … SELECT — Alex's self-mention then fails the
 *   table's CHECK (500), Cy's mention reaches Alex who blocked her, and Bea's reply reaches Alex
 *   who muted her.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { noticeCount, seedFollowNotices, shiftNotices, shiftSeenAt } from './sg-neutral.ts';
import { mentionCandidates, mentionedIds, notify } from '../src/db/repos/social/notifications.ts';

type Item = { id: string; kind: string; actor: { id: string; name: string; avatarUrl: string | null }; ref: Record<string, string>; createdAt: string; unread: boolean };

const ep = { feedUrl: 'https://feeds.example.com/n.xml', guid: 'n1', title: 'Ep N', showTitle: 'Show', enclosureUrl: 'https://cdn/n.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);

async function setup() {
  const t = await freshDb();
  await putEpisode(t, `${EP}`, { ...ep, durationMs: 2_000_000 });
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bea');
  const c = await signUp(t, 'c@example.com', 'Cy');
  return { t, a, b, c };
}

/** Posts a comment; the 5 s rate floor is stepped over by ageing the author's earlier comments. */
async function post(t: TestDb, who: { id: string; token: string }, body: string, parentId?: string): Promise<string> {
  await t.q(`UPDATE comments SET created_at = created_at - interval '1 minute' WHERE author_id = $1`, [who.id]);
  const res = await t.call('POST', `/v1/episodes/${EP}/comments`, { body, ...(parentId ? { parentId } : {}) }, who.token);
  assert.equal(res.status, 200, await res.clone().text());
  return ((await res.json()) as { comment: { id: string } }).comment.id;
}
const inbox = async (t: TestDb, token: string, cursor?: string) => {
  const res = await t.call('GET', `/v1/me/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, undefined, token);
  assert.equal(res.status, 200);
  return (await res.json()) as { items: Item[]; next: string | null };
};

test('reply, like, mention and follow each write one notice to the right person', async () => {
  const { t, a, b, c } = await setup();
  const mine = await post(t, a, 'Alex on the episode');
  const reply = await post(t, b, 'Bea answers', mine);
  assert.equal((await t.call('PUT', `/v1/comments/${mine}/like`, undefined, b.token)).status, 200);
  // Un-like and like again: still one like notice.
  await t.call('DELETE', `/v1/comments/${mine}/like`, undefined, b.token);
  await t.call('PUT', `/v1/comments/${mine}/like`, undefined, b.token);
  assert.equal((await t.call('PUT', `/v1/listeners/${a.id}/follow`, undefined, b.token)).status, 204);
  const shout = await post(t, c, 'Hey @alex, and @BEA! look');

  const forA = await inbox(t, a.token);
  assert.deepEqual(forA.items.map((i) => [i.kind, i.actor.name]), [['mention', 'Cy'], ['follow', 'Bea'], ['like', 'Bea'], ['reply', 'Bea']]);
  const r = forA.items.find((i) => i.kind === 'reply')!;
  assert.equal(r.ref.commentId, reply);
  assert.equal(r.ref.parentId, mine);
  assert.equal(r.ref.episodeId, EP);
  assert.equal(r.ref.excerpt, 'Bea answers');
  assert.equal(r.ref.episodeTitle, 'Ep N');
  assert.deepEqual(r.actor, { id: b.id, name: 'Bea', avatarUrl: null });
  assert.equal(forA.items.find((i) => i.kind === 'like')!.ref.commentId, mine);
  assert.equal(forA.items.find((i) => i.kind === 'mention')!.ref.commentId, shout);
  assert.ok(forA.items.every((i) => i.unread), 'never seen: all unread');
  assert.equal(forA.next, null);

  const forB = await inbox(t, b.token);
  assert.deepEqual(forB.items.map((i) => [i.kind, i.actor.name]), [['mention', 'Cy']]);
  assert.deepEqual((await inbox(t, c.token)).items, [], 'Cy acted only');

  // Seen: everything so far is read; a newer notice is unread.
  assert.equal((await t.call('POST', '/v1/me/notifications/seen', undefined, a.token)).status, 204);
  assert.ok((await inbox(t, a.token)).items.every((i) => !i.unread));
  await shiftSeenAt(t, a.id, 60_000);
  await shiftNotices(t, a.id, 120_000);
  await post(t, c, 'Again @Alex');
  const after = await inbox(t, a.token);
  assert.deepEqual(after.items.map((i) => i.unread), [true, false, false, false, false]);
  assert.equal((await t.call('GET', '/v1/me/notifications')).status, 401);
  await t.close();
});

test('G-M21-9: no notice for a self-act, to a blocker, or to a muter', async () => {
  const { t, a, b, c } = await setup();
  const mine = await post(t, a, 'Alex speaks');
  // Self: Alex replies under his own comment and mentions himself.
  await post(t, a, 'and me again @Alex', mine);
  assert.deepEqual((await inbox(t, a.token)).items, [], 'self-acts write nothing');

  // Block: Alex blocks Cy; Cy can still post a top-level comment that mentions him.
  assert.equal((await t.call('POST', '/v1/me/blocks', { listenerId: c.id }, a.token)).status, 201);
  await post(t, c, 'Talking about @Alex');
  // Mute: Alex mutes Bea; her reply, like and follow all still happen — silently for Alex.
  assert.equal((await t.call('PUT', `/v1/me/mutes/${b.id}`, undefined, a.token)).status, 204);
  await post(t, b, 'Bea replies', mine);
  assert.equal((await t.call('PUT', `/v1/comments/${mine}/like`, undefined, b.token)).status, 200);
  assert.equal((await t.call('PUT', `/v1/listeners/${a.id}/follow`, undefined, b.token)).status, 204);
  assert.deepEqual((await inbox(t, a.token)).items, [], 'nothing from Cy (blocked) or Bea (muted)');
  assert.equal(await noticeCount(t, a.id), 0, 'not merely hidden on read: never written');

  // The repo call itself: self, blocked, muted → false; a stranger → true.
  assert.equal(await notify(t.db, { recipientId: a.id, actorId: a.id, kind: 'follow' }), false);
  assert.equal(await notify(t.db, { recipientId: a.id, actorId: c.id, kind: 'mention', ref: { commentId: mine } }), false);
  assert.equal(await notify(t.db, { recipientId: a.id, actorId: b.id, kind: 'reply', ref: { commentId: mine } }), false);
  assert.equal(await notify(t.db, { recipientId: c.id, actorId: b.id, kind: 'follow' }), true);
  assert.equal(await notify(t.db, { recipientId: c.id, actorId: b.id, kind: 'follow' }), false, 'a follow is reported once');

  // Unmute: Bea's next act reaches Alex again.
  await t.call('DELETE', `/v1/me/mutes/${b.id}`, undefined, a.token);
  await post(t, b, 'Bea again', mine);
  assert.deepEqual((await inbox(t, a.token)).items.map((i) => i.kind), ['reply']);
  await t.close();
});

test('mentions: longest exact display name, case-insensitive, at most 5 per comment', async () => {
  const { t, a } = await setup();
  const annLee = await signUp(t, 'd@example.com', 'Ann Lee');
  const ann = await signUp(t, 'e@example.com', 'Ann');
  assert.deepEqual(mentionCandidates('hi @Ann Lee, ok'), [['ann', 'ann lee', 'ann lee, ok']]);
  assert.deepEqual(await mentionedIds(t.db, 'hi @ann lee, ok'), [annLee!.id]);
  assert.deepEqual(await mentionedIds(t.db, 'hi @ANN'), [ann!.id]);
  assert.deepEqual(await mentionedIds(t.db, 'mail me at x@nobody'), []);
  assert.deepEqual(await mentionedIds(t.db, 'no at sign'), []);
  for (let i = 0; i < 7; i += 1) await signUp(t, `m${i}@example.com`, `M${i}`);
  const many = await mentionedIds(t.db, '@m0 @m1 @m2 @m3 @m4 @m5 @m6 @m0');
  assert.equal(many.length, 5);
  void a;
  await t.close();
});

test('paging: 30 a page, newest first, the cursor continues', async () => {
  const { t, a, b } = await setup();
  await seedFollowNotices(t, a.id, b.id, 35);
  const one = await inbox(t, a.token);
  assert.equal(one.items.length, 30);
  assert.ok(one.next);
  const two = await inbox(t, a.token, one.next!);
  assert.equal(two.items.length, 5);
  assert.equal(two.next, null);
  const all = [...one.items, ...two.items].map((i) => i.createdAt);
  assert.deepEqual(all, [...all].sort().reverse(), 'newest first');
  assert.equal(new Set([...one.items, ...two.items].map((i) => i.id)).size, 35);
  await t.close();
});
