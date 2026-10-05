// Tests comment pins, "unfriendly" folding and the reply page.
/**
 * M19 US5 (quickstart A6). Guard G-M19-5: only a host can pin, and one pin per episode. Guard
 * G-M19-6: the payload never says who marked a comment unfriendly. The breaks: drop the
 * `hosts.includes` check in `setPinned` (src/db/repos/social/comment-extras.ts), or add
 * listener ids to `foldedOnEpisode`'s result; this file goes red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp } from './harness.ts';

type C = { id: string; pinned?: true; folded?: true; replyCount?: number; replies?: C[] };

async function setup() {
  const t = await freshDb();
  const host = await signUp(t, 'host@example.com', 'Host');
  const others = [] as { token: string; id: string }[];
  for (let i = 0; i < 6; i++) others.push(await signUp(t, `l${i}@example.com`, `L${i}`));
  await t.q("INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url) VALUES ('e1','https://f/x.xml','g','Ep','Show','https://c/x.mp3')");
  await t.q("INSERT INTO creator_claims (listener_id, feed_url, code, status, proven_at) VALUES ($1, 'https://f/x.xml', 'c1', 'proven', now())", [host.id]);
  const ids: string[] = [];
  for (const [i, body] of ['first', 'second'].entries()) {
    const [r] = await t.q<{ id: string }>("INSERT INTO comments (episode_id, author_id, body, offset_ms, created_at) VALUES ('e1', $1, $2, 1000, now() - ($3 || ' minutes')::interval) RETURNING id", [others[i]!.id, body, String(10 - i)]);
    ids.push(r!.id);
  }
  return { t, host, others, ids };
}
const list = async (t: Awaited<ReturnType<typeof setup>>['t'], token?: string) => ((await (await t.call('GET', '/v1/episodes/e1/social', undefined, token)).json()) as { comments: C[] }).comments;

test('G-M19-5: the host pins one comment; pinning another moves the pin; others cannot', async () => {
  const { t, host, others, ids } = await setup();
  assert.equal((await t.call('PUT', `/v1/comments/${ids[0]}/pin`, undefined, others[2]!.token)).status, 403);
  assert.equal((await t.call('PUT', `/v1/comments/${ids[0]}/pin`, undefined, host.token)).status, 204);
  assert.deepEqual((await list(t)).filter((c) => c.pinned).map((c) => c.id), [ids[0]]);
  await t.call('PUT', `/v1/comments/${ids[1]}/pin`, undefined, host.token);
  assert.deepEqual((await list(t)).filter((c) => c.pinned).map((c) => c.id), [ids[1]], 'one pin per episode');
  assert.equal((await t.call('DELETE', `/v1/comments/${ids[1]}/pin`, undefined, host.token)).status, 204);
  assert.equal((await list(t)).filter((c) => c.pinned).length, 0);
  await t.close();
});

test('G-M19-6: five unfriendly marks fold a comment; the voters are never in the payload; not your own', async () => {
  const { t, others, ids } = await setup();
  assert.equal((await t.call('PUT', `/v1/comments/${ids[0]}/unfriendly`, undefined, others[0]!.token)).status, 403, 'own comment');
  for (let i = 1; i <= 4; i++) assert.deepEqual(await (await t.call('PUT', `/v1/comments/${ids[0]}/unfriendly`, undefined, others[i]!.token)).json(), { folded: false });
  assert.deepEqual(await (await t.call('PUT', `/v1/comments/${ids[0]}/unfriendly`, undefined, others[5]!.token)).json(), { folded: true });
  const raw = await (await t.call('GET', '/v1/episodes/e1/social', undefined, others[0]!.token)).text();
  // others[1] wrote the second comment, so its id is there as an author; the voters who wrote nothing must not appear.
  for (let i = 2; i <= 5; i++) assert.ok(!raw.includes(others[i]!.id), 'a voter id leaked');
  assert.equal((JSON.parse(raw) as { comments: C[] }).comments.find((c) => c.id === ids[0])!.folded, true);
  await t.call('DELETE', `/v1/comments/${ids[0]}/unfriendly`, undefined, others[5]!.token);
  assert.equal((await list(t)).find((c) => c.id === ids[0])!.folded, undefined, 'four is not five');
  await t.close();
});

test('the reply page: parent first, every reply under it; replyCount on the list', async () => {
  const { t, others, ids } = await setup();
  for (const i of [2, 3]) await t.q("INSERT INTO comments (episode_id, author_id, body, parent_id) VALUES ('e1', $1, 'a reply', $2)", [others[i]!.id, ids[0]]);
  assert.equal((await list(t)).find((c) => c.id === ids[0])!.replyCount, 2);
  const th = (await (await t.call('GET', `/v1/comments/${ids[0]}/thread`)).json()) as { parent: C; replies: C[] };
  assert.equal(th.parent.id, ids[0]);
  assert.equal(th.replies.length, 2);
  assert.equal((await t.call('GET', '/v1/comments/00000000-0000-0000-0000-000000000000/thread')).status, 404);
  await t.close();
});
