// Tests host moderation: the bottom pin is last under every order, and a ban stops text and voice comments on that show only.
/**
 * M22 US10 (FR-030–FR-032; contracts/api.md "Host moderation"). Guards:
 * - G-M22-10: a banned listener can't post on that show — text AND voice — and still can elsewhere.
 *   Break: remove the `isMutedOn` line in src/routes/social/voice-comments.ts → the voice case goes red.
 * - G-M22-11: the bottom-pinned comment is last in the server's list both ways round (the phone's
 *   sorts are guarded in packages/social-core/test/order.test.ts).
 *   Break: drop the `bottom` lines at the end of listComments in src/db/repos/social/comments.ts.
 * The banned message keeps the wire code `muted_on_show` that shipped phones already understand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { proveClaim, sCall, studioLogin } from './studio-harness.ts';
import type { VoiceStorage } from '../src/storage/voice-blob.ts';

const FEED = 'https://feeds.example.com/mine.xml';
const OTHER = 'https://feeds.example.com/other.xml';
const epOf = (feedUrl: string, guid: string) => ({ id: fnv1a64(feedUrl + '\u0001' + guid), body: { feedUrl, guid, title: guid, enclosureUrl: `https://cdn/${guid}.mp3` } });

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (type: string, body: number[]) => [...be32(8 + body.length), ...[...type].map((c) => c.charCodeAt(0)), ...body];
function m4a(ms: number, timescale = 44_100): Uint8Array {
  const dur = Math.round((ms * timescale) / 1000);
  const mvhd = box('mvhd', [0, 0, 0, 0, ...be32(0), ...be32(0), ...be32(timescale), ...be32(dur), ...new Array(80).fill(0)]);
  return new Uint8Array([...box('ftyp', [...'M4A '].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0])), ...box('moov', mvhd)]);
}
const store: VoiceStorage = { ready: true, put: async (path) => ({ url: `https://blob.example/${path}`, pathname: path }), remove: async () => {} };
const voice = (t: TestDb, episodeId: string, token: string) =>
  t.app.request(`/v1/episodes/${episodeId}/comments/voice`, { method: 'POST', body: m4a(5_000) as unknown as BodyInit, headers: { 'content-type': 'audio/mp4', 'x-duration-ms': '5000', authorization: `Bearer ${token}` } });

type C = { id: string; pinned?: true; pinnedBottom?: true };
const list = async (t: TestDb, episodeId: string, dir: 'asc' | 'desc') =>
  ((await (await t.call('GET', `/v1/episodes/${episodeId}/social?dir=${dir}`)).json()) as { comments: C[] }).comments;

test('G-M22-11: a bottom pin is last both ways round, one per episode, from the Studio or the app; others get 403', async () => {
  const t = await freshDb();
  const owner = await studioLogin(t, 'o@example.com', 'Owner');
  const key = await proveClaim(t, owner.id, FEED);
  const ep = epOf(FEED, 'g1');
  await putEpisode(t, `${ep.id}`, ep.body);
  const ids: string[] = [];
  for (const n of ['a', 'b', 'c']) {
    const who = await signUp(t, `${n}@example.com`, n.toUpperCase());
    const r = await t.call('POST', `/v1/episodes/${ep.id}/comments`, { body: `comment ${n}` }, who.token);
    assert.equal(r.status, 200, await r.clone().text());
    ids.push(((await r.json()) as { comment: { id: string } }).comment.id);
  }
  const [a, b, c] = ids as [string, string, string];
  // a is the oldest: pinned to the bottom it would be last under "oldest first" anyway — so pin it and read newest first too.
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/comments/${a}/pin-bottom`, owner)).status, 204);
  for (const dir of ['asc', 'desc'] as const) {
    const l = await list(t, ep.id, dir);
    assert.equal(l.at(-1)!.id, a, dir);
    assert.equal(l.at(-1)!.pinnedBottom, true);
    assert.equal(l.filter((x) => x.pinnedBottom).length, 1);
  }
  const studioList = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/comments`, owner)).json()) as { items: { id: string; pinnedBottom: boolean }[] };
  assert.equal(studioList.items.find((i) => i.id === a)!.pinnedBottom, true);

  // The app route, as the verified host: c replaces a (one per episode).
  assert.equal((await t.call('PUT', `/v1/comments/${c}/pin-bottom`, undefined, owner.token)).status, 204);
  for (const dir of ['asc', 'desc'] as const) {
    const l = await list(t, ep.id, dir);
    assert.deepEqual([l.at(-1)!.id, l.filter((x) => x.pinnedBottom).map((x) => x.id)], [c, [c]], dir);
  }
  // Not a host → 403; a top pin takes it off the bottom.
  const stranger = await signUp(t, 'z@example.com', 'Zed');
  assert.equal((await t.call('PUT', `/v1/comments/${b}/pin-bottom`, undefined, stranger.token)).status, 403);
  assert.equal((await t.call('PUT', `/v1/comments/${c}/pin`, undefined, owner.token)).status, 204);
  const after = await list(t, ep.id, 'desc');
  assert.equal(after.find((x) => x.id === c)!.pinned, true);
  assert.equal(after.find((x) => x.id === c)!.pinnedBottom, undefined);
  // Unpin from the bottom.
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/comments/${b}/pin-bottom`, owner)).status, 204);
  assert.equal((await sCall(t, 'DELETE', `/v1/studio/shows/${key}/comments/${b}/pin-bottom`, owner)).status, 204);
  assert.equal((await list(t, ep.id, 'desc')).some((x) => x.pinnedBottom), false);
  await t.close();
});

test('G-M22-10: a banned listener can post neither text nor voice on that show — still elsewhere; a co-host cannot be banned; the ban lifts', async () => {
  const t = await freshDb({ voiceStorage: store });
  const owner = await studioLogin(t, 'o@example.com', 'Owner');
  const key = await proveClaim(t, owner.id, FEED);
  const mine = epOf(FEED, 'g1');
  const theirs = epOf(OTHER, 'g2');
  await putEpisode(t, `${mine.id}`, mine.body);
  await putEpisode(t, `${theirs.id}`, theirs.body);
  const l = await signUp(t, 'l@example.com', 'Troll');

  assert.equal((await sCall(t, 'PUT', `/v1/studio/shows/${key}/bans/${l.id}`, owner, { reason: 'Spam links' })).status, 204);
  const bans = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/bans`, owner)).json()) as { items: { listenerId: string; name: string; reason: string | null }[] };
  assert.deepEqual(bans.items.map((x) => [x.listenerId, x.name, x.reason]), [[l.id, 'Troll', 'Spam links']]);

  const text = await t.call('POST', `/v1/episodes/${mine.id}/comments`, { body: 'again' }, l.token);
  assert.equal(text.status, 403);
  assert.deepEqual(await text.json(), { error: 'muted_on_show', message: 'The host has turned off comments for you on this show.' });
  const v = await voice(t, mine.id, l.token);
  assert.equal(v.status, 403, 'voice comments are refused too');
  assert.equal(((await v.json()) as { error: string }).error, 'muted_on_show');
  assert.equal((await t.q('SELECT 1 FROM comments WHERE author_id = $1', [l.id])).length, 0);
  assert.equal((await t.call('POST', `/v1/episodes/${theirs.id}/comments`, { body: 'elsewhere' }, l.token)).status, 200, 'other shows are open');

  // An invited co-host can't be banned.
  const co = await signUp(t, 'co@example.com', 'Co');
  await t.q('INSERT INTO show_hosts (feed_url, listener_id) VALUES ($1, $2)', [FEED, co.id]);
  const refused = await sCall(t, 'PUT', `/v1/studio/shows/${key}/bans/${co.id}`, owner, {});
  assert.equal(refused.status, 409);
  assert.equal(((await refused.json()) as { error: string }).error, 'is_cohost');

  assert.equal((await sCall(t, 'DELETE', `/v1/studio/shows/${key}/bans/${l.id}`, owner)).status, 204);
  await t.q("UPDATE comments SET created_at = created_at - interval '10 seconds'");
  assert.equal((await t.call('POST', `/v1/episodes/${mine.id}/comments`, { body: 'sorry' }, l.token)).status, 200);
  await t.close();
});
