// Tests M21 US7 on the server: the three charts, the treasure hunt, the plaza, daily picks, faces on picks, search's date filter.
/**
 * M21 US7 (T080). The treasure hunt and the plaza are OUR OWN DESIGN (owner, 2026-10-06).
 *
 * Guard "hunt never offers a show you follow or turned down" — the break that turns it red:
 * delete the `NOT EXISTS (SELECT 1 FROM subscriptions …)` line (or the `rec_dismissals` one) in
 * `hunt()` in src/db/repos/discover/explore.ts; the "never subscribed" test goes red.
 * Guard "the hunt holds all day" — the break: put `Date.now()` into the seed in `hunt()`; the
 * "same three all day" test goes red.
 * Guard "search since=30d" — the break: drop the `sinceMs` line in src/routes/discover/search.ts;
 * the date-filter test goes red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromPglite } from '../src/db/db.ts';
import { createApp } from '../src/app.ts';
import { likedByFollowed } from '../src/db/repos/discover/explore.ts';
import { CASEY, fakeApple } from './fake-apple.ts';
import { migratedPg, freshDb, signUp, TEST_PEPPER, type TestDb } from './harness.ts';

type Ep = { id: string; feedUrl: string; title: string };
const feed = (n: number) => `https://f.example/${n}.xml`;

/** `n` shows with one episode each: show i → episode `e<i>`, published i days ago (show 1 is newest). */
async function shows(t: TestDb, n: number) {
  for (let i = 1; i <= n; i++) {
    await t.q(
      `INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url, image_url, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now() - ($8 || ' days')::interval)`,
      [`e${i}`, feed(i), `g${i}`, `Episode ${i}`, `Show ${i}`, `https://cdn/${i}.mp3`, `https://img/${i}.jpg`, String(i)],
    );
  }
}
const huntOf = async (t: TestDb, token?: string, shuffle = 0) => {
  const r = await t.call('GET', `/v1/discover/hunt?shuffle=${shuffle}`, undefined, token);
  assert.equal(r.status, 200);
  return (await r.json()) as { day: string; shuffle: number; items: Ep[] };
};
const ids = (items: { id: string }[]) => items.map((i) => i.id).sort();

test('hunt: the same three all day, from three shows; another set the next day; Shuffle gives another set', async () => {
  let today = '2026-10-06';
  const t = await freshDb({ picksRaw: [], today: () => today });
  const a = await signUp(t);
  await shows(t, 20);
  const one = await huntOf(t, a.token);
  assert.equal(one.day, '2026-10-06');
  assert.equal(one.items.length, 3);
  assert.equal(new Set(one.items.map((i) => i.feedUrl)).size, 3, 'three different shows');
  assert.deepEqual(ids((await huntOf(t, a.token)).items), ids(one.items), 'the same three on a second look');
  const shuffled = await huntOf(t, a.token, 1);
  assert.notDeepEqual(ids(shuffled.items), ids(one.items), 'Shuffle: another set');
  assert.deepEqual(ids((await huntOf(t, a.token, 1)).items), ids(shuffled.items), 'set 1 is stable too');
  today = '2026-10-07';
  assert.notDeepEqual(ids((await huntOf(t, a.token)).items), ids(one.items), 'a new day, a new set');
  const anon = await huntOf(t);
  assert.equal(anon.items.length, 3, 'signed out still gets a hunt');
  assert.equal((await t.call('GET', '/v1/discover/hunt?shuffle=-1')).status, 422);
  assert.equal((await t.call('GET', '/v1/discover/hunt?shuffle=x')).status, 422);
  await t.close();
});

test('hunt: never a subscribed show, a turned-down show or episode, or a well-played episode', async () => {
  const t = await freshDb({ picksRaw: [] });
  const a = await signUp(t);
  const b = await signUp(t, 'b@example.com', 'Bo');
  await shows(t, 24);
  // Shows 1–2 subscribed, show 3 turned down, episode e4 turned down.
  for (let i = 1; i <= 2; i++) await t.q('INSERT INTO subscriptions (listener_id, feed_url) VALUES ($1, $2)', [a.id, feed(i)]);
  await t.q("INSERT INTO rec_dismissals (listener_id, kind, item_key) VALUES ($1, 'show', $2)", [a.id, feed(3)]);
  await t.q("INSERT INTO rec_dismissals (listener_id, kind, item_key) VALUES ($1, 'episode', 'e4')", [a.id]);
  // 20 candidates left (e5–e24). e15–e24 are played — the top half — so never "lesser-heard".
  for (let i = 15; i <= 24; i++) await t.q("INSERT INTO activity (actor_id, kind, episode_id, day) VALUES ($1, 'listened', $2, current_date)", [b.id, `e${i}`]);
  const allowed = new Set(Array.from({ length: 10 }, (_, k) => `e${k + 5}`));
  const seen = new Set<string>();
  for (let n = 0; n < 15; n++) {
    for (const it of (await huntOf(t, a.token, n)).items) {
      assert.ok(allowed.has(it.id), `shuffle ${n} offered ${it.id}`);
      seen.add(it.id);
    }
  }
  assert.ok(seen.size >= 3);
  await t.close();
});

test('plaza: newest shows, 60 a page with a cursor, each once; Shuffle reorders; a hidden show is out', async () => {
  const t = await freshDb({ picksRaw: [] });
  const a = await signUp(t);
  await shows(t, 70);
  type Page = { shuffle: number; items: { feedUrl: string; title: string; imageUrl?: string; episodes: number }[]; next?: string };
  const get = async (q: string) => (await (await t.call('GET', `/v1/discover/plaza${q}`, undefined, a.token)).json()) as Page;
  const p1 = await get('');
  assert.equal(p1.items.length, 60);
  assert.equal(p1.next, '60');
  const p2 = await get('?cursor=60');
  assert.equal(p2.items.length, 10);
  assert.equal(p2.next, undefined);
  const all = [...p1.items, ...p2.items].map((s) => s.feedUrl);
  assert.equal(new Set(all).size, 70, 'every show once');
  assert.equal(p1.items[0]!.episodes, 1);
  assert.ok(p1.items[0]!.imageUrl);
  assert.deepEqual((await get('')).items.map((s) => s.feedUrl), p1.items.map((s) => s.feedUrl), 'the same order on a second look');
  assert.notDeepEqual((await get('?shuffle=1')).items.map((s) => s.feedUrl), p1.items.map((s) => s.feedUrl), 'Shuffle reorders');
  const [action] = await t.q<{ id: string }>("INSERT INTO moderation_actions (actor_id, action, target_kind, target_id) VALUES ($1, 'hide_show', 'show', $2) RETURNING id", [a.id, feed(3)]);
  await t.q('INSERT INTO hidden_feeds (feed_url, action_id) VALUES ($1, $2)', [feed(3), action!.id]);
  const again = [...(await get('')).items, ...(await get('?cursor=60')).items].map((s) => s.feedUrl);
  assert.equal(again.length, 69);
  assert.ok(!again.includes(feed(3)));
  assert.equal((await t.call('GET', '/v1/discover/plaza?cursor=-5')).status, 422);
  await t.close();
});

test('charts: new = newest first episode; rising = grew this week; updatedAt is kept for 5 min; a bad kind is 422', async () => {
  const t = await freshDb({ picksRaw: [] });
  const a = await signUp(t);
  await shows(t, 4);
  // Show 1 also has an episode from a year ago: its first episode is old, so it is not new.
  await t.q("INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url, published_at) VALUES ('old1', $1, 'old', 'Old', 'Show 1', 'https://cdn/o.mp3', now() - interval '365 days')", [feed(1)]);
  type Chart = { kind: string; items: { rank: number; episode: { id: string; feedUrl: string }; reason?: string }[]; updatedAt: string };
  const get = async (q: string) => (await (await t.call('GET', `/v1/discover/chart${q}`)).json()) as Chart;
  const fresh = await get('?kind=new');
  assert.equal(fresh.kind, 'new');
  assert.deepEqual(fresh.items.map((i) => i.episode.feedUrl), [feed(2), feed(3), feed(4), feed(1)]);
  assert.equal(fresh.items[3]!.episode.id, 'e1', 'a show comes with its newest episode');
  assert.deepEqual(fresh.items.map((i) => i.rank), [1, 2, 3, 4]);
  assert.ok(!Number.isNaN(Date.parse(fresh.updatedAt)));
  // Rising: e3 has 3 comments this week and 1 the week before (+2); e4 has 1 now and 2 before (shrank).
  const comment = (ep: string, daysAgo: number) =>
    t.q("INSERT INTO comments (episode_id, author_id, body, created_at) VALUES ($1, $2, 'x', now() - ($3 || ' days')::interval)", [ep, a.id, String(daysAgo)]);
  for (const d of [1, 2, 3]) await comment('e3', d);
  await comment('e3', 10);
  await comment('e4', 1);
  for (const d of [9, 10]) await comment('e4', d);
  const rising = await get('?kind=rising');
  assert.deepEqual(rising.items.map((i) => i.episode.id), ['e3']);
  assert.match(rising.items[0]!.reason!, /^\+2 this week/);
  // Cached 5 min: a new comment does not move it, and updatedAt stays.
  await comment('e4', 1); await comment('e4', 1);
  const again = await get('?kind=rising');
  assert.equal(again.updatedAt, rising.updatedAt);
  assert.deepEqual(again.items.map((i) => i.episode.id), ['e3']);
  assert.equal((await get('')).kind, 'talked', 'talked is the default');
  assert.equal((await t.call('GET', '/v1/discover/chart?kind=hot')).status, 422);
  await t.close();
});

test('daily: today\'s picks with the editor\'s notes; an episode the server knows comes as a card', async () => {
  const picksRaw = [
    { date: '2026-10-05', feedUrl: feed(1), guid: 'g1', why: 'Yesterday.' },
    { date: '2026-10-06', feedUrl: feed(1), guid: 'g1', why: 'A quiet one.', order: 2 },
    { date: '2026-10-06', feedUrl: feed(9), why: 'A show we like.', order: 1 },
  ];
  const t = await freshDb({ picksRaw, today: () => '2026-10-06' });
  await shows(t, 1);
  const r = await t.call('GET', '/v1/discover/daily');
  assert.equal(r.status, 200);
  const body = (await r.json()) as { date: string; items: { why: string; episode: { id: string } | null }[] };
  assert.equal(body.date, '2026-10-06');
  assert.deepEqual(body.items.map((i) => [i.why, i.episode?.id ?? null]), [['A show we like.', null], ['A quiet one.', 'e1']]);
  await t.close();
});

test('faces on picks: at most 3 people I follow who liked it — never private likes, never a block', async () => {
  const t = await freshDb({ picksRaw: [] });
  const me = await signUp(t, 'me@example.com', 'Me');
  const others = [];
  for (const n of ['b', 'c', 'd', 'e', 'f', 'g']) others.push(await signUp(t, `${n}@example.com`, n.toUpperCase()));
  await shows(t, 2);
  for (const o of others) await t.call('PUT', '/v1/episodes/e1/like', {}, o.token);
  // I follow b, c, d, e, f — not g. e's likes are private; I blocked f.
  for (const o of others.slice(0, 5)) await t.q('INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2)', [me.id, o.id]);
  await t.call('PATCH', '/v1/me', { likesPublic: false }, others[3]!.token);
  await t.call('POST', '/v1/me/blocks', { listenerId: others[4]!.id }, me.token);
  const faces = await likedByFollowed(t.db, me.id, ['e1', 'e2']);
  const names = (faces.get('e1') ?? []).map((f) => f.displayName).sort();
  assert.equal(names.length, 3);
  assert.deepEqual(names, ['B', 'C', 'D']);
  assert.equal(faces.get('e2'), undefined);
  await t.close();
});

test('search since=30d|180d keeps only episodes published in that time; rows carry counts; a bad value is 422', async () => {
  const { pg } = await migratedPg();
  const apple = fakeApple();
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  const episodes = [
    { ...CASEY, episodeGuid: 'recent', trackName: 'Ten days old', releaseDate: daysAgo(10) },
    { ...CASEY, episodeGuid: 'mid', trackName: 'Ninety days old', releaseDate: daysAgo(90) },
    { ...CASEY, episodeGuid: 'old', trackName: 'Two years old', releaseDate: daysAgo(730) },
  ];
  const f = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('entity=podcastEpisode') && url.includes('/search')) return new Response(JSON.stringify({ resultCount: 3, results: episodes }), { status: 200, headers: { 'content-type': 'application/json' } });
    return apple.fetch(input);
  }) as typeof fetch;
  const app = createApp({ db: fromPglite(pg), pepper: TEST_PEPPER, catalogFetch: f, picksRaw: [] });
  let ip = 0;
  const get = async (q: string) => app.request(`/v1/search?q=casey${q}`, { headers: { 'x-forwarded-for': `9.9.9.${ip++}` } });
  type Body = { episodes: { title: string; stats?: { listeners: number; comments: number } }[] };
  const titles = async (q: string) => ((await (await get(q)).json()) as Body).episodes.map((e) => e.title);
  assert.deepEqual(await titles(''), ['Ten days old', 'Ninety days old', 'Two years old']);
  assert.deepEqual(await titles('&since=30d'), ['Ten days old']);
  assert.deepEqual(await titles('&since=180d'), ['Ten days old', 'Ninety days old']);
  const withCounts = (await (await get('')).json()) as Body;
  assert.deepEqual(withCounts.episodes[0]!.stats, { listeners: 0, comments: 0 });
  assert.equal((await get('&since=7d')).status, 422);
  await pg.close();
});
