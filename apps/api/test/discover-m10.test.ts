// Tests Discover's extra sections, hidden shows leaving them, and catalogue outages.
/**
 * M10 (2026-09-27): Discover's additions — shows, newShows, followedHere, said,
 * collections, per-pick stats — and /v1/categories. Guards: G6 (no display name in any
 * Discover payload) and G7/FR-014 (a hidden show leaves every new list at once).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { migrate, type MigrationRunner } from '../src/db/migrate.ts';
import { fromPglite } from '../src/db/db.ts';
import { createApp } from '../src/app.ts';
import { validateCollections } from '../src/catalog/collections.ts';
import { genreName, GENRE_LIST } from '../src/catalog/genres.ts';
import { FIXTURE_FEED } from './fake-apple.ts';
import { TEST_PEPPER, signUp, type TestDb } from './harness.ts';
import shippedCollections from '../collections.json' with { type: 'json' };
import shippedPicks from '../picks.json' with { type: 'json' };

const FX = 'https://feeds.example.com/fx.xml';
const REPLY_ALL = 'https://feeds.megaphone.fm/replyall';
const NEW_A = 'https://feeds.example.com/new-a.xml';
const NEW_B = 'https://feeds.example.com/new-b.xml';
const BIG_C = 'https://feeds.example.com/big-c.xml';
const NO_COUNT = 'https://feeds.example.com/no-count.xml';
const UNKNOWN = 'https://feeds.example.com/never-seen.xml';

type AppleShow = { collectionId: number; collectionName: string; feedUrl: string; trackCount?: number };
/** Chart order: two big shows, a 5-episode show, a 13-episode show, one with no count, a 12-episode show. */
const CHART: AppleShow[] = [
  { collectionId: 360084272, collectionName: 'The Joe Rogan Experience', feedUrl: 'https://feeds.megaphone.fm/GLT1412515089', trackCount: 2400 },
  { collectionId: 941907967, collectionName: 'Reply All', feedUrl: REPLY_ALL, trackCount: 214 },
  { collectionId: 111, collectionName: 'New A', feedUrl: NEW_A, trackCount: 5 },
  { collectionId: 333, collectionName: 'Big C', feedUrl: BIG_C, trackCount: 13 },
  { collectionId: 444, collectionName: 'No Count', feedUrl: NO_COUNT },
  { collectionId: 222, collectionName: 'New B', feedUrl: NEW_B, trackCount: 12 },
  { collectionId: 555, collectionName: 'Sixth', feedUrl: 'https://feeds.example.com/sixth.xml', trackCount: 400 },
  { collectionId: 666, collectionName: 'Seventh', feedUrl: 'https://feeds.example.com/seventh.xml', trackCount: 400 },
];

const showJson = (s: AppleShow) => ({ wrapperType: 'track', kind: 'podcast', collectionId: s.collectionId, collectionName: s.collectionName, artistName: `By ${s.collectionName}`, feedUrl: s.feedUrl, artworkUrl600: `https://img/${s.collectionId}.jpg`, genres: ['Comedy', 'Podcasts'], ...(s.trackCount !== undefined ? { trackCount: s.trackCount } : {}) });
const latestJson = (s: AppleShow) => ({ wrapperType: 'podcastEpisode', kind: 'podcast-episode', trackName: `${s.collectionName} latest`, collectionName: s.collectionName, collectionId: s.collectionId, episodeGuid: `g-${s.collectionId}`, episodeUrl: `https://cdn/${s.collectionId}.mp3`, feedUrl: s.feedUrl, releaseDate: '2026-09-20T10:00:00Z', trackTimeMillis: 1_000_000 });

function fakeCatalog(chart: AppleShow[] = CHART) {
  const calls: string[] = [];
  const state = { appleDown: false };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  const f = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith(FX)) return new Response(FIXTURE_FEED, { status: 200, headers: { 'content-type': 'application/rss+xml' } });
    if (!url.includes('itunes.apple.com')) return new Response('nope', { status: 404 });
    if (state.appleDown) return json({}, 503);
    const u = new URL(url);
    if (url.includes('/rss/toppodcasts/')) {
      const limit = Number(/limit=(\d+)/.exec(url)?.[1] ?? 200);
      return json({ feed: { entry: chart.slice(0, limit).map((s) => ({ id: { attributes: { 'im:id': String(s.collectionId) } } })) } });
    }
    const ids = (u.searchParams.get('id') ?? '').split(',').map(Number);
    if (u.searchParams.get('entity') === 'podcastEpisode') {
      // As Apple answers (read 2026-09-29): every id's show, then its newest episode.
      return json({ results: chart.filter((s) => ids.includes(s.collectionId)).flatMap((s) => [showJson(s), latestJson(s)]) });
    }
    return json({ results: chart.filter((s) => ids.includes(s.collectionId)).map(showJson) });
  }) as typeof fetch;
  return { fetch: f, calls, state };
}

async function appWith(opts: { collectionsRaw?: unknown; chart?: AppleShow[] } = {}) {
  const pg = new PGlite({ extensions: { citext } });
  const runner: MigrationRunner = { exec: (s) => pg.exec(s), query: async <T,>(s: string, p?: unknown[]) => (await pg.query<T>(s, p)).rows };
  await migrate(runner);
  const db = fromPglite(pg);
  const cat = fakeCatalog(opts.chart);
  const picksRaw = [{ date: '2026-09-22', feedUrl: FX, guid: 'g-new', why: 'Today\'s pick.' }];
  const collectionsRaw = opts.collectionsRaw ?? [{ id: 'start-here', title: 'Where to start', subtitle: 'Shows worth a first episode', items: [{ feedUrl: FX }, { feedUrl: FX, guid: 'g-old', why: 'The older one.' }, { feedUrl: FX, guid: 'nope' }] }];
  const warned: string[] = [];
  const orig = console.warn; console.warn = (m: unknown) => { warned.push(String(m)); };
  const app = createApp({ db, pepper: TEST_PEPPER, catalogFetch: cat.fetch, picksRaw, collectionsRaw, today: () => '2026-09-22' });
  console.warn = orig;
  const t: TestDb = {
    pg, db, runner, app,
    q: async <T,>(s: string, p?: unknown[]) => (await pg.query<T>(s, p)).rows,
    call: async (method, path, body, token, headers = {}) => app.request(path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }),
    close: () => pg.close(),
  };
  return { t, cat, warned };
}

type Card = { id: string; feedUrl: string; guid: string; title: string; showTitle: string; enclosureUrl: string };
type Item = { kind: string; key: string; episode: Card; why?: string; reason?: string; stats?: { listeners: number; comments: number } };
type Show = { appleId?: number; feedUrl: string; title: string; author: string; genres: string[]; episodeCount?: number; latestEpisode?: { title: string; publishedAt?: string } };
type Body = {
  date?: string; picks: Item[]; talkedAbout: Item[]; trending: Item[]; stale: boolean; serverTime: string;
  shows?: Show[]; newShows?: { show: Show; episode: Card }[];
  followedHere?: { total: number; shows: { feedUrl: string; title: string; imageUrl?: string; author?: string; followers: number }[] };
  said?: { commentId: string; authorId: string; body: string; createdAt: string; episode: Card }[];
  collections?: { id: string; title: string; subtitle?: string; items: Item[] }[];
};

const PICK_EP = fnv1a64(`${FX}\u0001g-new`);
const NAMES = ['Nameleak Alpha', 'Nameleak Bravo', 'Nameleak Charlie', 'Nameleak Delta'];

/** Four listeners with subscriptions, listens and comments that each rule has to sort. */
async function seed(t: TestDb) {
  const a = await signUp(t, 'a@example.com', NAMES[0]!);
  const b = await signUp(t, 'b@example.com', NAMES[1]!);
  const c = await signUp(t, 'c@example.com', NAMES[2]!);
  const d = await signUp(t, 'd@example.com', NAMES[3]!);
  // followers: FX 2 (a, b), REPLY_ALL 1 (c; d's row is a tombstone), UNKNOWN 1 (no title anywhere)
  await t.q(`INSERT INTO subscriptions (listener_id, feed_url) VALUES ($1, $3), ($2, $3), ($4, $5), ($1, $6)`, [a.id, b.id, FX, c.id, REPLY_ALL, UNKNOWN]);
  await t.q(`INSERT INTO subscriptions (listener_id, feed_url, deleted_at) VALUES ($1, $2, now()), ($1, $3, now())`, [d.id, REPLY_ALL, NEW_A]);
  // Bea listens in public; Alex in private (not counted, G2)
  await t.call('PUT', '/v1/me/privacy', { privateListening: true }, a.token);
  await t.call('PUT', '/v1/me/listened', { deviceId: 'pa', days: [{ episodeId: PICK_EP, day: '2026-09-22', ranges: [[0, 360_000]] }] }, a.token);
  await t.call('PUT', '/v1/me/listened', { deviceId: 'pb', days: [{ episodeId: PICK_EP, day: '2026-09-22', ranges: [[0, 360_000]] }] }, b.token);
  // comments on the pick: one kept, one by a soon-suspended author, one removed, one deleted, one too old
  const ins = (author: string, body: string) => t.q(`INSERT INTO comments (episode_id, author_id, body, offset_ms) VALUES ($1, $2, $3, 1)`, [PICK_EP, author, body]);
  await ins(b.id, 'b-kept');
  await ins(c.id, 'c-suspended');
  await ins(a.id, 'a-removed');
  await ins(d.id, 'd-deleted');
  await ins(b.id, 'b-too-old');
  await t.q(`UPDATE comments SET removed_at = now() WHERE body = 'a-removed'`);
  await t.q(`UPDATE comments SET deleted_at = now() WHERE body = 'd-deleted'`);
  await t.q(`UPDATE comments SET created_at = now() - interval '20 days' WHERE body = 'b-too-old'`);
  await t.q('UPDATE listeners SET suspended_at = now() WHERE id = $1', [c.id]);
  return { a, b, c, d };
}

async function getDiscover(t: TestDb, headers: Record<string, string> = {}) {
  const res = await t.call('GET', '/v1/discover', undefined, undefined, headers);
  return { res, raw: res.status === 200 ? await res.text() : '' };
}

test('M10: every new field is present and shaped; the M5 fields are unchanged; G6 — no display name anywhere; ETag covers the new lists', async () => {
  const { t, cat } = await appWith();
  await getDiscover(t); // registers the pick's episode
  const who = await seed(t);
  const { res, raw } = await getDiscover(t);
  assert.equal(res.status, 200);
  const body = JSON.parse(raw) as Body;

  // M5 fields, as before
  assert.equal(body.date, '2026-09-22');
  assert.deepEqual(body.picks.map((p) => [p.kind, p.episode.title, p.why]), [['pick', 'Newest', 'Today\'s pick.']]);
  assert.equal(body.stale, false);
  assert.ok(typeof body.serverTime === 'string');
  assert.ok(body.trending.length >= 1 && body.trending.length <= 8);
  assert.ok(body.trending.every((x) => x.kind === 'trending' && x.reason === 'Trending on the chart'));
  assert.equal(raw.includes('warnings'), false);
  // one chart call, at 25
  const charts = cat.calls.filter((u) => u.includes('/rss/toppodcasts/'));
  assert.equal(charts.length, 1);
  assert.match(charts[0]!, /toppodcasts\/limit=25\/json$/);

  // stats: all-time, public listeners only (Bea), top-level comments not deleted/removed (b-kept, c-suspended, b-too-old)
  assert.deepEqual(body.picks[0]!.stats, { listeners: 1, comments: 3 });

  // shows: the chart's first six, with Apple's count
  assert.deepEqual(body.shows!.map((s) => s.title), CHART.slice(0, 6).map((s) => s.collectionName));
  assert.equal(body.shows![0]!.episodeCount, 2400);
  assert.equal(body.shows![4]!.episodeCount, undefined);

  // newShows: only episodeCount <= 12, chart order, each with its latest episode, registered
  assert.deepEqual(body.newShows!.map((n) => n.show.feedUrl), [NEW_A, NEW_B]);
  for (const n of body.newShows!) {
    assert.ok(n.show.episodeCount !== undefined && n.show.episodeCount <= 12);
    assert.equal(n.episode.feedUrl, n.show.feedUrl);
    assert.equal(n.episode.id, fnv1a64(`${n.episode.feedUrl}\u0001${n.episode.guid}`));
    assert.equal((await t.q('SELECT id FROM episodes WHERE id = $1', [n.episode.id])).length, 1);
  }

  // followedHere: live rows only, grouped, most followers first; an untitled feed counts but is not listed
  assert.equal(body.followedHere!.total, 3);
  assert.deepEqual(body.followedHere!.shows.map((s) => [s.feedUrl, s.followers]), [[FX, 2], [REPLY_ALL, 1]]);
  assert.equal(body.followedHere!.shows[0]!.title, 'Fixture Show');
  assert.equal(body.followedHere!.shows[0]!.author, 'Fx');
  assert.equal(body.followedHere!.shows[1]!.title, 'Reply All');

  // said: only b-kept — not removed, not deleted, not by the suspended author, not older than 14 days
  assert.deepEqual(body.said!.map((s) => s.body), ['b-kept']);
  assert.equal(body.said![0]!.authorId, who.b.id);
  assert.equal(body.said![0]!.episode.id, PICK_EP);
  assert.ok(!Number.isNaN(Date.parse(body.said![0]!.createdAt)));

  // collections: resolved like picks; the bad guid is dropped with a warning, not a crash
  assert.equal(body.collections!.length, 1);
  const col = body.collections![0]!;
  assert.deepEqual([col.id, col.title, col.subtitle], ['start-here', 'Where to start', 'Shows worth a first episode']);
  assert.deepEqual(col.items.map((i) => [i.kind, i.episode.title, i.why]), [['pick', 'Newest', undefined], ['pick', 'Older', 'The older one.']]);
  assert.deepEqual(col.items[0]!.stats, { listeners: 1, comments: 3 });

  // G6: no display name, anywhere; ids only where a comment is shown
  for (const name of NAMES) assert.equal(raw.includes(name), false, `payload leaks ${name}`);
  for (const id of [who.a.id, who.c.id, who.d.id]) assert.equal(raw.includes(id), false, `payload leaks the id of a listener it shows nothing for`);
  assert.equal(raw.split(who.b.id).length - 1, body.said!.filter((s) => s.authorId === who.b.id).length);

  // ETag: same state → 304; a new comment (said + stats) → 200
  const etag = res.headers.get('etag')!;
  assert.equal((await getDiscover(t, { 'if-none-match': etag })).res.status, 304);
  await t.q(`INSERT INTO comments (episode_id, author_id, body, offset_ms) VALUES ($1, $2, 'b-second', 2)`, [PICK_EP, who.b.id]);
  const after = await getDiscover(t, { 'if-none-match': etag });
  assert.equal(after.res.status, 200);
  assert.equal((JSON.parse(after.raw) as Body).said![0]!.body, 'b-second');
  await t.close();
});

test('M10 G7: a hidden show leaves shows, newShows, followedHere, said and collections at once (no cache wait)', async () => {
  const { t } = await appWith();
  await getDiscover(t);
  await seed(t);
  const before = JSON.parse((await getDiscover(t)).raw) as Body;
  assert.ok(before.shows!.some((s) => s.feedUrl === REPLY_ALL));
  assert.ok(before.newShows!.some((n) => n.show.feedUrl === NEW_A));
  assert.ok(before.followedHere!.shows.some((s) => s.feedUrl === FX));
  assert.ok(before.said!.some((s) => s.episode.feedUrl === FX));
  assert.ok(before.collections!.length === 1);

  await t.q(`INSERT INTO listeners (email, password_hash, display_name) VALUES ('o@example.com', 'x', 'Owner')`);
  const [o] = await t.q<{ id: string }>(`SELECT id FROM listeners WHERE email = 'o@example.com'`);
  const [act] = await t.q<{ id: string }>(`INSERT INTO moderation_actions (actor_id, action, target_kind, target_id) VALUES ($1, 'hide_show', 'show', $2) RETURNING id`, [o!.id, FX]);
  await t.q('INSERT INTO hidden_feeds (feed_url, action_id) VALUES ($1, $4), ($2, $4), ($3, $4)', [FX, REPLY_ALL, NEW_A, act!.id]);

  const { raw } = await getDiscover(t);
  const after = JSON.parse(raw) as Body;
  const hidden = new Set([FX, REPLY_ALL, NEW_A]);
  assert.ok(after.shows!.every((s) => !hidden.has(s.feedUrl)));
  assert.equal(after.shows!.length, 6, 'stored beyond six, so hiding still leaves six');
  assert.ok(after.newShows!.every((n) => !hidden.has(n.show.feedUrl) && !hidden.has(n.episode.feedUrl)));
  assert.deepEqual(after.newShows!.map((n) => n.show.feedUrl), [NEW_B]);
  assert.ok(after.followedHere!.shows.every((s) => !hidden.has(s.feedUrl)));
  assert.equal(after.followedHere!.total, 1, 'the hidden shows leave the total too');
  assert.deepEqual(after.said, []);
  assert.deepEqual(after.collections, [], 'a collection emptied by hiding is dropped');
  assert.deepEqual(after.picks, []);
  for (const h of hidden) assert.equal(raw.includes(h), false, `${h} still in the payload`);
  await t.close();
});

test('M10: a catalogue outage leaves the M5 fields and the DB-only additions standing', async () => {
  const { t, cat } = await appWith({ collectionsRaw: [] });
  cat.state.appleDown = true;
  const res = await t.call('GET', '/v1/discover');
  assert.equal(res.status, 200);
  const body = (await res.json()) as Body;
  assert.deepEqual(body.shows, []);
  assert.deepEqual(body.newShows, []);
  assert.deepEqual(body.trending, []);
  assert.deepEqual(body.followedHere, { total: 0, shows: [] });
  assert.deepEqual(body.said, []);
  assert.deepEqual(body.collections, []);
  assert.equal(body.picks.length, 1);
  await t.close();
});

test('M10: collections validate like picks — a bad entry is a warning, the rest serve', () => {
  const { collections, warnings } = validateCollections([
    { id: 'ok', title: ' Fine ', items: [{ feedUrl: FX }, { feedUrl: 'ftp://x' }, { feedUrl: FX, guid: 3 }, { feedUrl: FX, why: '' }, 'x', { feedUrl: FX, guid: '', why: 'Why.' }] },
    { id: 'ok', title: 'Dup', items: [{ feedUrl: FX }] },
    { id: 'Bad Id', title: 'x', items: [{ feedUrl: FX }] },
    { id: 'no-title', title: '', items: [{ feedUrl: FX }] },
    { id: 'bad-sub', title: 't', subtitle: 7, items: [{ feedUrl: FX }] },
    { id: 'no-items', title: 't' },
    { id: 'empty', title: 't', items: [{ feedUrl: 'nope' }] },
    null,
  ]);
  assert.deepEqual(collections, [{ id: 'ok', title: 'Fine', items: [{ feedUrl: FX }, { feedUrl: FX, why: 'Why.' }] }]);
  assert.equal(warnings.length, 12);
  assert.deepEqual(validateCollections({}), { collections: [], warnings: ['collections: not an array'] });
  const many = validateCollections(Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, title: 't', items: Array.from({ length: 12 }, () => ({ feedUrl: FX })) })));
  assert.equal(many.collections.length, 6);
  assert.ok(many.collections.every((c) => c.items.length === 10));
});

test('M10: the shipped collections.json is valid and uses only feeds already in picks.json', () => {
  const picks = (shippedPicks as unknown as { picks: { feedUrl: string }[] }).picks; // M12: the file is { picks, issues }
  const r = validateCollections(shippedCollections);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.collections.length, 1);
  const pickFeeds = new Set(picks.map((p) => p.feedUrl));
  assert.ok(r.collections[0]!.items.every((i) => pickFeeds.has(i.feedUrl) && i.guid === undefined));
});

test('M10: GET /v1/categories lists Apple\'s genres with display names; /:genreId is the genre chart, cached, stale on an outage, 404 for an unknown genre, hidden shows removed', async () => {
  const { t, cat } = await appWith({ collectionsRaw: [] });
  const list = (await (await t.call('GET', '/v1/categories')).json()) as { categories: { genreId: number; name: string }[] };
  assert.equal(list.categories.length, 19);
  assert.deepEqual(list.categories.find((c) => c.genreId === 1512), { genreId: 1512, name: 'Health & Fitness' });
  assert.deepEqual(list.categories.find((c) => c.genreId === 1309), { genreId: 1309, name: 'TV & Film' });
  assert.equal(genreName(1303), 'Comedy');
  assert.equal(GENRE_LIST.length, 19);

  const res = await t.call('GET', '/v1/categories/1303');
  assert.equal(res.status, 200);
  const one = (await res.json()) as { genreId: number; name: string; shows: Show[]; stale: boolean };
  assert.equal(one.genreId, 1303);
  assert.equal(one.name, 'Comedy');
  assert.equal(one.stale, false);
  assert.equal(one.shows.length, CHART.length);
  assert.ok(one.shows.length <= 20);
  assert.match(cat.calls.find((u) => u.includes('genre=1303'))!, /toppodcasts\/limit=20\/genre=1303\/json$/);
  // M12 FR-072 (guard G-CAT): each show names its newest episode, from the same one lookup.
  assert.deepEqual(one.shows[0]!.latestEpisode, { title: 'The Joe Rogan Experience latest', publishedAt: '2026-09-20T10:00:00Z' });
  assert.ok(one.shows.every((s) => s.latestEpisode?.title === `${s.title} latest`));
  assert.equal(cat.calls.filter((u) => u.includes('/lookup')).length, 1, 'one lookup for the whole chart');
  const n = cat.calls.length;
  await t.call('GET', '/v1/categories/1303');
  assert.equal(cat.calls.length, n, 'served from the cache');

  for (const bad of ['9999', 'abc', '0', '1303x']) {
    const r = await t.call('GET', `/v1/categories/${bad}`);
    assert.equal(r.status, 404, bad);
    assert.equal(((await r.json()) as { error: string }).error, 'not_found');
  }

  // hidden show removed at serve time
  await t.q(`INSERT INTO listeners (email, password_hash, display_name) VALUES ('o@example.com', 'x', 'Owner')`);
  const [o] = await t.q<{ id: string }>('SELECT id FROM listeners');
  const [act] = await t.q<{ id: string }>(`INSERT INTO moderation_actions (actor_id, action, target_kind, target_id) VALUES ($1, 'hide_show', 'show', $2) RETURNING id`, [o!.id, REPLY_ALL]);
  await t.q('INSERT INTO hidden_feeds (feed_url, action_id) VALUES ($1, $2)', [REPLY_ALL, act!.id]);
  const hid = (await (await t.call('GET', '/v1/categories/1303')).json()) as { shows: Show[] };
  assert.ok(hid.shows.every((s) => s.feedUrl !== REPLY_ALL));
  assert.equal(hid.shows.length, CHART.length - 1);

  // Apple down: an expired cached copy is served stale; a genre never fetched is 503
  cat.state.appleDown = true;
  await t.q(`UPDATE cache SET fetched_at = now() - interval '7 hours' WHERE key = 'apple:category:1303'`);
  const stale = (await (await t.call('GET', '/v1/categories/1303')).json()) as { shows: Show[]; stale: boolean };
  assert.equal(stale.stale, true);
  assert.equal(stale.shows.length, CHART.length - 1);
  assert.equal((await t.call('GET', '/v1/categories/1318')).status, 503);
  await t.close();
});

test('Owner 2026-10-05: /v1/categories/:id?page=N pages through the chart 20 at a time, hasMore false on the last page', async () => {
  // 45 shows: page 0 = 20, page 1 = 20, page 2 = 5 and the end.
  const big: AppleShow[] = Array.from({ length: 45 }, (_, i) => ({ collectionId: 9000 + i, collectionName: `Show ${i}`, feedUrl: `https://feeds.example.com/s${i}.xml` }));
  const { t, cat } = await appWith({ collectionsRaw: [], chart: big });
  type Page = { shows: Show[]; hasMore: boolean; stale: boolean };
  const get = async (q: string) => (await (await t.call('GET', `/v1/categories/1303${q}`)).json()) as Page;
  const p0 = await get('');
  assert.deepEqual(p0.shows.map((s) => s.title), big.slice(0, 20).map((s) => s.collectionName));
  assert.equal(p0.hasMore, true, 'a full first page');
  const p1 = await get('?page=1');
  assert.deepEqual(p1.shows.map((s) => s.title), big.slice(20, 40).map((s) => s.collectionName));
  assert.equal(p1.hasMore, true);
  assert.ok(p1.shows.every((s) => s.latestEpisode?.title === `${s.title} latest`), 'each later page names the newest episode too');
  assert.match(cat.calls.find((u) => u.includes('limit=200'))!, /toppodcasts\/limit=200\/genre=1303\/json$/);
  const lookups = cat.calls.filter((u) => u.includes('/lookup')).length;
  const p2 = await get('?page=2');
  assert.deepEqual(p2.shows.map((s) => s.title), big.slice(40).map((s) => s.collectionName));
  assert.equal(p2.hasMore, false, 'the last page says so');
  assert.equal(cat.calls.filter((u) => u.includes('/rss/toppodcasts/')).length, 2, 'the 200 ids are read once and kept');
  assert.equal(cat.calls.filter((u) => u.includes('/lookup')).length, lookups + 1, 'one lookup per page');
  const p3 = await get('?page=3');
  assert.deepEqual([p3.shows.length, p3.hasMore], [0, false]);
  assert.deepEqual(await get('?page=10'), { genreId: 1303, name: 'Comedy', shows: [], stale: false, hasMore: false });
  for (const bad of ['-1', 'x', '1.5', '100']) assert.equal((await t.call('GET', `/v1/categories/1303?page=${bad}`)).status, 422, bad);
  // a short chart: page 0 says there is no more
  await t.close();
  const small = await appWith({ collectionsRaw: [] });
  assert.equal(((await (await small.t.call('GET', '/v1/categories/1303')).json()) as Page).hasMore, false);
  await small.t.close();
});
