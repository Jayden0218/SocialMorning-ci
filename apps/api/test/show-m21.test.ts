// Tests the M21 show page data: subscribers, hosts, host picks, tint, and the Show info page.
/**
 * M21 US5 T065 (contracts/api.md "Episode and show"): `GET /v1/shows/extras` adds `subscribers`
 * (live rows only; 0 for a hidden feed), `hosts` (owner first, with faces), `hostPicks` (the
 * host's order) and the cover `tint`; `PUT /v1/studio/shows/:show/host-picks` is for a verified
 * host only; `GET /v1/shows/info` says who stands behind the show.
 *
 * The break that turns it red: in `src/db/repos/studio/show-page.ts` `subscriberCount`, drop
 * `AND deleted_at IS NULL` (an unsubscribed listener is counted: 3, not 2).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Resvg } from '@resvg/resvg-wasm';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { addEpisode, proveClaim, sCall, studioLogin } from './studio-harness.ts';
import { assets } from '../src/share/card.ts';

const FEED = 'https://feeds.example.com/m21.xml';
const COVER = 'https://img.example/m21.png';

type Extras = { subscribers: number; hosts: { id: string; name: string; avatarUrl: string | null }[]; hostPicks: string[]; tint: string | null; episodeTint?: string | null };
const extras = async (t: TestDb, q = '') => (await (await t.call('GET', `/v1/shows/extras?feedUrl=${encodeURIComponent(FEED)}${q}`)).json()) as Extras;

async function cover(): Promise<Uint8Array> {
  await assets();
  return new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#2e86c1"/></svg>').render().asPng();
}

test('subscribers counts live rows only, and reads 0 for a feed moderation hid', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'A');
  const b = await signUp(t, 'b@example.com', 'B');
  const c = await signUp(t, 'c@example.com', 'C');
  await t.q('INSERT INTO subscriptions (listener_id, feed_url) VALUES ($1, $3), ($2, $3)', [a.id, b.id, FEED]);
  await t.q('INSERT INTO subscriptions (listener_id, feed_url, deleted_at) VALUES ($1, $2, now())', [c.id, FEED]);
  assert.equal((await extras(t)).subscribers, 2);
  const [act] = await t.q<{ id: string }>("INSERT INTO moderation_actions (actor_id, action, target_kind, target_id) VALUES ($1, 'hide_show', 'show', $2) RETURNING id", [a.id, FEED]);
  await t.q('INSERT INTO hidden_feeds (feed_url, action_id) VALUES ($1, $2)', [FEED, act!.id]);
  assert.equal((await extras(t)).subscribers, 0);
  await t.close();
});

test('hosts: the proven owner first, then invited hosts, with faces; suspended accounts left out; none for a plain feed', async () => {
  const t = await freshDb();
  assert.deepEqual((await extras(t)).hosts, []);
  const owner = await signUp(t, 'o@example.com', 'Owner');
  const host = await signUp(t, 'h@example.com', 'Host');
  const gone = await signUp(t, 'g@example.com', 'Gone');
  await t.q("UPDATE listeners SET avatar_url = 'https://img.example/o.png' WHERE id = $1", [owner.id]);
  await proveClaim(t, owner.id, FEED);
  await t.q('INSERT INTO show_hosts (feed_url, listener_id) VALUES ($1, $2), ($1, $3)', [FEED, host.id, gone.id]);
  await t.q('UPDATE listeners SET suspended_at = now() WHERE id = $1', [gone.id]);
  assert.deepEqual((await extras(t)).hosts, [
    { id: owner.id, name: 'Owner', avatarUrl: 'https://img.example/o.png' },
    { id: host.id, name: 'Host', avatarUrl: null },
  ]);
  await t.close();
});

test('host picks: a verified host sets them in order (≤ 20, this show only); anyone else gets 403; the app reads them in order', async () => {
  const t = await freshDb();
  const owner = await studioLogin(t, 'o@example.com', 'Owner');
  const stranger = await studioLogin(t, 's@example.com', 'Stranger');
  const key = await proveClaim(t, owner.id, FEED);
  for (const id of ['e1', 'e2', 'e3']) await addEpisode(t, FEED, id, `Episode ${id}`, 60_000);
  await addEpisode(t, 'https://other.example.com/f.xml', 'x1', 'Not ours', 60_000);

  assert.deepEqual((await extras(t)).hostPicks, []);
  const put = await sCall(t, 'PUT', `/v1/studio/shows/${key}/host-picks`, owner, { episodeIds: ['e3', 'e1'] });
  assert.equal(put.status, 200);
  assert.deepEqual(((await put.json()) as { items: { id: string }[] }).items.map((i) => i.id), ['e3', 'e1']);
  assert.deepEqual((await extras(t)).hostPicks, ['e3', 'e1']);
  const got = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/host-picks`, owner)).json()) as { items: { id: string; title: string }[] };
  assert.deepEqual(got.items, [{ id: 'e3', title: 'Episode e3' }, { id: 'e1', title: 'Episode e1' }]);

  assert.equal((await sCall(t, 'PUT', `/v1/studio/shows/${key}/host-picks`, stranger, { episodeIds: ['e2'] })).status, 403);
  assert.equal((await sCall(t, 'PUT', `/v1/studio/shows/${key}/host-picks`, owner, { episodeIds: ['x1'] })).status, 422);
  assert.equal((await sCall(t, 'PUT', `/v1/studio/shows/${key}/host-picks`, owner, { episodeIds: Array.from({ length: 21 }, (_, i) => `e${i}`) })).status, 422);
  assert.deepEqual((await extras(t)).hostPicks, ['e3', 'e1'], 'a refused write changes nothing');

  await sCall(t, 'PUT', `/v1/studio/shows/${key}/host-picks`, owner, { episodeIds: [] });
  assert.deepEqual((await extras(t)).hostPicks, []);
  await t.close();
});

test('tint: the cover the page draws comes back as #rrggbb (null while first worked out); episodeImage gives episodeTint', async () => {
  const png = await cover();
  const imageFetch = (async (input: string | URL | Request) => (String(input) === COVER
    ? new Response(png, { status: 200, headers: { 'content-type': 'image/png' } })
    : new Response('no', { status: 404 }))) as typeof fetch;
  const t = await freshDb({ imageFetch });
  let x = await extras(t, `&image=${encodeURIComponent(COVER)}&episodeImage=${encodeURIComponent(COVER)}`);
  for (let i = 0; i < 20 && x.tint === null; i++) {
    await new Promise((r) => setTimeout(r, 200));
    x = await extras(t, `&image=${encodeURIComponent(COVER)}&episodeImage=${encodeURIComponent(COVER)}`);
  }
  assert.match(x.tint ?? '', /^#[0-9a-f]{6}$/);
  assert.equal(x.episodeTint, x.tint);
  assert.equal((await extras(t)).episodeTint, undefined, 'no episodeImage, no episodeTint');
  await t.close();
});

test('Show info: a plain feed, a claimed show with its owner\'s country, a show made in the Studio', async () => {
  const t = await freshDb();
  const info = async (feed: string) => (await (await t.call('GET', `/v1/shows/info?feedUrl=${encodeURIComponent(feed)}`)).json()) as Record<string, unknown>;
  assert.deepEqual(await info(FEED), { ownerType: 'feed', ownerCountry: null, feedUrl: FEED, claimedAt: null });
  const owner = await signUp(t, 'o@example.com', 'Owner');
  await t.q("UPDATE listeners SET country = 'MY' WHERE id = $1", [owner.id]);
  await proveClaim(t, owner.id, FEED, '2026-10-01T00:00:00.000Z');
  assert.deepEqual(await info(FEED), { ownerType: 'claimed', ownerCountry: 'MY', feedUrl: FEED, claimedAt: '2026-10-01T00:00:00.000Z' });
  const made = 'https://h.example.com/feed.xml';
  await t.q('INSERT INTO hosted_shows (owner_id, feed_url, title) VALUES ($1, $2, $3)', [owner.id, made, 'Made here']);
  await proveClaim(t, owner.id, made);
  assert.equal((await info(made)).ownerType, 'studio');
  assert.equal((await t.call('GET', '/v1/shows/info?feedUrl=nope')).status, 422);
  await t.close();
});
