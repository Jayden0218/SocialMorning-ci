/**
 * M11 US3 — the creator reads, answers and hides comments (FR-014..FR-016).
 *
 * Guard G-H1: a host-hidden comment is gone for everyone but its author. The break that turns
 * it red: in `src/db/repos/comments.ts` `toPublic`, set `hostHidden` to `false`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { proveClaim, sCall, studioLogin } from './studio-harness.ts';

const FEED = 'https://feeds.example.com/mine.xml';
const ep = { feedUrl: FEED, guid: 'g1', title: 'Ep 1', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);

type Thread = { id: string; body: string | null; deleted: boolean; host?: true; hiddenByHost?: true; mine?: boolean; replies: Thread }[];

async function setup(t: TestDb) {
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 1_000_000 });
  const owner = await studioLogin(t, 'o@example.com', 'Host');
  const key = await proveClaim(t, owner.id, FEED);
  const listener = await signUp(t, 'l@example.com', 'Mei');
  const other = await signUp(t, 'x@example.com', 'Xu');
  const posted = await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'That bit at 14:32!', offsetMs: 872_000 }, listener.token);
  const commentId = ((await posted.json()) as { comment: { id: string } }).comment.id;
  return { owner, key, listener, other, commentId };
}

const thread = async (t: TestDb, token?: string) =>
  ((await (await t.call('GET', `/v1/episodes/${EP}/social`, undefined, token)).json()) as { comments: Thread }).comments;

test('Comments lists the show\'s comments with author, episode and moment; search and episode filter work', async () => {
  const t = await freshDb();
  const { owner, key } = await setup(t);
  type L = { items: { body: string; author: { displayName: string }; episodeTitle: string; offsetMs: number; state: string }[] };
  const all = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/comments`, owner)).json()) as L;
  assert.deepEqual(all.items.map((c) => [c.body, c.author.displayName, c.episodeTitle, c.offsetMs, c.state]), [['That bit at 14:32!', 'Mei', 'Ep 1', 872_000, 'visible']]);
  const hit = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/comments?q=14%3A32`, owner)).json()) as L;
  const miss = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/comments?q=nothing`, owner)).json()) as L;
  const pct = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/comments?q=%25`, owner)).json()) as L;
  const other = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/comments?episodeId=0000000000000000`, owner)).json()) as L;
  assert.deepEqual([hit.items.length, miss.items.length, pct.items.length, other.items.length], [1, 0, 0, 0], 'a % is searched as a character, not a wildcard');
  await t.close();
});

test('SC-003 path: the owner\'s reply reaches the app thread with the Host mark; an operator\'s reply has none', async () => {
  const t = await freshDb();
  const { owner, key, listener, commentId } = await setup(t);
  const r = await sCall(t, 'POST', `/v1/studio/shows/${key}/comments/${commentId}/reply`, owner, { body: 'Glad you liked it' });
  assert.equal(r.status, 201);
  const op = await studioLogin(t, 'op@example.com', 'Helper');
  await t.q('INSERT INTO show_members (feed_url, listener_id) VALUES ($1, $2)', [FEED, op.id]);
  await t.q("UPDATE comments SET created_at = created_at - interval '10 seconds'");
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/comments/${commentId}/reply`, op, { body: 'Me too' })).status, 201);
  const [top] = await thread(t, listener.token);
  assert.deepEqual(top!.replies.map((x) => [x.body, x.host === true]), [['Glad you liked it', true], ['Me too', false]]);
  // The app's 5 s floor applies to the Studio too (the operator's reply is the fresh one).
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/comments/${commentId}/reply`, op, { body: 'again' })).status, 429);
  await t.close();
});

test('G-H1: a hidden comment is a placeholder for others, still readable (marked) by its author; un-hide restores it', async () => {
  const t = await freshDb();
  const { owner, key, listener, other, commentId } = await setup(t);
  const heatBefore = await t.q('SELECT count(*)::int AS n FROM episode_heat WHERE episode_id = $1', [EP]);
  assert.equal(Number(heatBefore[0]!.n) > 0, true);
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/comments/${commentId}/hide`, owner)).status, 204);

  const [forOther] = await thread(t, other.token);
  assert.deepEqual([forOther!.body, forOther!.deleted, forOther!.hiddenByHost], [null, true, true]);
  const [anon] = await thread(t);
  assert.equal(anon!.body, null);
  const [forAuthor] = await thread(t, listener.token);
  assert.deepEqual([forAuthor!.body, forAuthor!.hiddenByHost, forAuthor!.mine], ['That bit at 14:32!', true, true]);
  assert.equal((await t.q("SELECT count(*)::int AS n FROM activity WHERE kind = 'commented' AND ref_id = $1", [commentId]))[0]!.n, 0, 'out of the feeds');
  assert.equal((await t.q('SELECT count(*)::int AS n FROM episode_heat WHERE episode_id = $1', [EP]))[0]!.n, 0, 'off the rail');
  const log = await t.q<{ action: string }>("SELECT action FROM moderation_actions WHERE target_id = $1 ORDER BY created_at", [commentId]);
  assert.deepEqual(log.map((l) => l.action), ['host_hide']);
  const mine = (await (await t.call('GET', '/v1/me/comments', undefined, listener.token)).json()) as { items: { hiddenByHost?: true; body: string }[] };
  assert.deepEqual([mine.items[0]!.hiddenByHost, mine.items[0]!.body], [true, 'That bit at 14:32!']);

  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/comments/${commentId}/unhide`, owner)).status, 204);
  const [back] = await thread(t, other.token);
  assert.deepEqual([back!.body, back!.hiddenByHost], ['That bit at 14:32!', undefined]);
  assert.equal((await t.q("SELECT count(*)::int AS n FROM activity WHERE kind = 'commented' AND ref_id = $1", [commentId]))[0]!.n, 1);
  assert.deepEqual((await t.q<{ action: string }>("SELECT action FROM moderation_actions WHERE target_id = $1 ORDER BY created_at", [commentId])).map((l) => l.action), ['host_hide', 'host_unhide']);
  await t.close();
});

test('a comment on another show cannot be answered or hidden from this one', async () => {
  const t = await freshDb();
  const { owner, key, listener } = await setup(t);
  const otherFeed = 'https://feeds.example.com/theirs.xml';
  const theirs = fnv1a64(otherFeed + '\u0001' + 'g9');
  await t.call('PUT', `/v1/episodes/${theirs}`, { feedUrl: otherFeed, guid: 'g9', title: 'Theirs', enclosureUrl: 'https://cdn/9.mp3' });
  await t.q("UPDATE comments SET created_at = created_at - interval '10 seconds'");
  const id = ((await (await t.call('POST', `/v1/episodes/${theirs}/comments`, { body: 'elsewhere' }, listener.token)).json()) as { comment: { id: string } }).comment.id;
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/comments/${id}/hide`, owner)).status, 404);
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/comments/${id}/reply`, owner, { body: 'x' })).status, 404);
  await t.close();
});
