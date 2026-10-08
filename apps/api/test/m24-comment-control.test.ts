// Tests the host's comment control: closed refuses, review holds a comment only its author sees until approved.
/**
 * M24 US8 (specs/025-m24-gaps-and-look, lane A2).
 *
 * Guard G-M24-1 — a closed show refuses comments (403 comments_closed), and a held comment is
 * seen by nobody but its author until the host approves it. The breaks that turn it red:
 *   - in `src/db/repos/studio/comment-policy.ts` `commentControl`, let `closed` through
 *     (`if (mode !== 'review' || …) return null`);
 *   - in `heldForAuthor`, drop `AND h.author_id = $2` (everyone is then given the held comment).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { proveClaim, sCall, studioLogin } from './studio-harness.ts';

const FEED = 'https://feeds.example.com/control.xml';
const EP = fnv1a64(FEED + '\u0001' + 'g1');
const EP2 = fnv1a64(FEED + '\u0001' + 'g2');

type C = { id: string; body: string | null; held?: true; mine?: boolean; replies: C[] };

async function setup(t: TestDb) {
  await putEpisode(t, EP, { feedUrl: FEED, guid: 'g1', title: 'Ep 1', enclosureUrl: 'https://cdn/1.mp3', durationMs: 1_000_000 });
  await putEpisode(t, EP2, { feedUrl: FEED, guid: 'g2', title: 'Ep 2', enclosureUrl: 'https://cdn/2.mp3', durationMs: 1_000_000 });
  const owner = await studioLogin(t, 'o@example.com', 'Host');
  const key = await proveClaim(t, owner.id, FEED);
  const mei = await signUp(t, 'mei@example.com', 'Mei');
  const xu = await signUp(t, 'xu@example.com', 'Xu');
  return { owner, key, mei, xu };
}

const thread = async (t: TestDb, ep: string, token?: string) =>
  ((await (await t.call('GET', `/v1/episodes/${ep}/social`, undefined, token)).json()) as { comments: C[] }).comments;
const post = (t: TestDb, token: string, body: string, ep = EP, extra: Record<string, unknown> = {}) =>
  t.call('POST', `/v1/episodes/${ep}/comments`, { body, ...extra }, token);
const older = (t: TestDb) => Promise.all([
  t.q("UPDATE comments SET created_at = created_at - interval '10 seconds'"),
  t.q("UPDATE held_comments SET created_at = created_at - interval '10 seconds'"),
]);

test('G-M24-1: a closed show refuses comments with comments_closed; open again takes them', async () => {
  const t = await freshDb();
  const { owner, key, mei } = await setup(t);
  assert.equal((await sCall(t, 'PUT', `/v1/studio/shows/${key}/comment-policy`, owner, { mode: 'closed' })).status, 200);
  const r = await post(t, mei.token, 'Hello?');
  assert.equal(r.status, 403);
  assert.equal(((await r.json()) as { error: string }).error, 'comments_closed');
  assert.equal((await t.q('SELECT count(*)::int AS n FROM comments'))[0]!.n, 0);
  // The host's own team still writes on a closed show.
  assert.equal((await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'Host here' }, owner.token)).status, 200);
  const policy = (await (await sCall(t, 'PUT', `/v1/studio/shows/${key}/comment-policy`, owner, { mode: 'open' })).json()) as { show: string };
  assert.equal(policy.show, 'open');
  assert.equal((await post(t, mei.token, 'Now?')).status, 200);
  await t.close();
});

test('G-M24-1: under review, a comment is seen by its author only — until Approve; Reject deletes it', async () => {
  const t = await freshDb();
  const { owner, key, mei, xu } = await setup(t);
  await sCall(t, 'PUT', `/v1/studio/shows/${key}/comment-policy`, owner, { mode: 'review' });
  const r = await post(t, mei.token, 'Waiting for you', EP, { offsetMs: 30_000 });
  assert.equal(r.status, 200);
  const held = (await r.json()) as { held: boolean; comment: { id: string; held?: true } };
  assert.deepEqual([held.held, held.comment.held], [true, true]);
  assert.equal((await t.q('SELECT count(*)::int AS n FROM comments'))[0]!.n, 0, 'not in comments at all');

  const mine = await thread(t, EP, mei.token);
  assert.deepEqual(mine.map((c) => [c.body, c.held === true, c.mine]), [['Waiting for you', true, true]]);
  assert.deepEqual(await thread(t, EP, xu.token), [], 'another listener sees nothing');
  assert.deepEqual(await thread(t, EP), [], 'nor does a signed-out reader');
  assert.deepEqual((await t.q('SELECT count(*)::int AS n FROM episode_heat'))[0]!.n, 0, 'no heat from a held comment');

  type P = { items: { id: string; body: string; author: { displayName: string } }[] };
  const pending = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/comments/pending`, owner)).json()) as P;
  assert.deepEqual(pending.items.map((p) => [p.body, p.author.displayName]), [['Waiting for you', 'Mei']]);
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/comments/pending/${pending.items[0]!.id}/approve`, owner)).status, 200);
  const seen = await thread(t, EP, xu.token);
  assert.deepEqual(seen.map((c) => [c.body, c.held === true]), [['Waiting for you', false]], 'approved: everyone sees it');
  assert.equal((await t.q('SELECT count(*)::int AS n FROM held_comments'))[0]!.n, 0);

  await older(t);
  const second = (await (await post(t, mei.token, 'Second thought')).json()) as { comment: { id: string } };
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/comments/pending/${second.comment.id}/reject`, owner)).status, 204);
  assert.deepEqual((await thread(t, EP, mei.token)).map((c) => c.body), ['Waiting for you'], 'rejected: gone for its author too');
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/comments/pending/${second.comment.id}/approve`, owner)).status, 404);
  await t.close();
});

test('US8: an episode\'s own setting wins over the show\'s; null follows the show again; a held reply sits under its parent for its author', async () => {
  const t = await freshDb();
  const { owner, key, mei, xu } = await setup(t);
  await sCall(t, 'PUT', `/v1/studio/shows/${key}/comment-policy`, owner, { mode: 'closed' });
  const p = (await (await sCall(t, 'PUT', `/v1/studio/shows/${key}/comment-policy`, owner, { episodeId: EP2, mode: 'open' })).json()) as { show: string; episodes: { episodeId: string; mode: string }[] };
  assert.deepEqual(p, { show: 'closed', episodes: [{ episodeId: EP2, mode: 'open' }] });
  assert.equal((await post(t, mei.token, 'On ep 1')).status, 403);
  const top = (await (await post(t, xu.token, 'On ep 2', EP2)).json()) as { comment: { id: string } };
  await sCall(t, 'PUT', `/v1/studio/shows/${key}/comment-policy`, owner, { episodeId: EP2, mode: 'review' });
  await older(t);
  const reply = (await (await post(t, mei.token, 'A reply', EP2, { parentId: top.comment.id })).json()) as { held: boolean };
  assert.equal(reply.held, true);
  const forMei = await thread(t, EP2, mei.token);
  assert.deepEqual(forMei.map((c) => [c.body, c.replies.map((r) => [r.body, r.held === true])]), [['On ep 2', [['A reply', true]]]]);
  const forXu = await thread(t, EP2, xu.token);
  assert.deepEqual(forXu.map((c) => c.replies.length), [0]);
  await sCall(t, 'PUT', `/v1/studio/shows/${key}/comment-policy`, owner, { episodeId: EP2, mode: null });
  assert.deepEqual(((await (await sCall(t, 'GET', `/v1/studio/shows/${key}/comment-policy`, owner)).json()) as { episodes: unknown[] }).episodes, []);
  assert.equal((await sCall(t, 'PUT', `/v1/studio/shows/${key}/comment-policy`, owner, { mode: null })).status, 422, 'the show itself needs a mode');
  assert.equal((await sCall(t, 'PUT', `/v1/studio/shows/${key}/comment-policy`, owner, { episodeId: 'nope', mode: 'open' })).status, 404);
  await t.close();
});
