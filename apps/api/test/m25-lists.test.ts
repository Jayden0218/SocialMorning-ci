// Tests M25 lane AL: admin pins and hides on every list, hiding a show or episode everywhere, For You rules and weights, the /mod pages in Admin.
/**
 * specs/026-m25-control-security-release, lane AL (A1–A6, A9).
 *
 * Guard G-AL-A1 (server half; the phone half is apps/mobile/__tests__/m25-category.test.ts):
 * a pin is first and a hide is gone on the category page (Hot = the server's order) and on the
 * chart's Top tab. The break that turns it red: in `applyList` (src/db/repos/discover/lists.ts)
 * return `[...items]` straight away (pins and hides ignored).
 *
 * Guard G-AL-A3: a show the owner hides from Admin (no report) leaves search, For You, the
 * chart's Top tab and the New shows chart. The break that turns it red: in `showAct`
 * (src/routes/admin/lists.ts) call `act()` with 'dismiss' instead of the action asked for.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { aCall, adminSetup, FX } from './admin-harness.ts';
import { putEpisode } from './put-episode.ts';
import { migrate } from '../src/db/migrate.ts';
import { createFeedback } from '../src/db/repos/account/feedback.ts';
import { addSearchRequest } from '../src/routes/discover/search-requests.ts';

const TODAY = '2026-09-22';
const JRE = 'https://feeds.megaphone.fm/GLT1412515089';
const REPLY_ALL = 'https://feeds.megaphone.fm/replyall';
const L = (id: string) => `/v1/admin/lists/${encodeURIComponent(id)}`;

type Show = { feedUrl: string; title: string; pinned?: true };
type Cat = { shows: Show[]; pinned?: string[]; defaultSort?: string; hasMore: boolean };
type Item = { key: string; episode: { id: string; feedUrl: string; guid: string; title: string } };
type Disc = { trending: Item[]; talkedAbout: Item[]; shows?: Show[]; premium?: Show[]; said?: { commentId: string }[] };

async function setup() {
  const s = await adminSetup({ picksRaw: [], today: () => TODAY, collectionsRaw: [] });
  // The fixture show's parsed feed, as the server keeps it (a pinned show off the chart is drawn from it).
  await s.t.q(`INSERT INTO cache (key, body, fetched_at) VALUES ($1, ($2::text)::jsonb, now())`,
    [`feed:${FX}`, JSON.stringify({ show: { title: 'Fixture Show', author: 'Fx' }, episodes: [], warnings: [] })]);
  const ep = { feedUrl: FX, guid: 'g-pin', title: 'Pinned One', showTitle: 'Fixture Show', enclosureUrl: 'https://cdn/pin.mp3', publishedAt: '2026-09-20T00:00:00Z' };
  await putEpisode(s.t, fnv1a64(`${ep.feedUrl}\u0001${ep.guid}`), { ...ep, durationMs: 1_000_000 });
  return s;
}

test('G-AL-A1 (server): a category pin is first (marked, listed) and a hide is gone on every page; Top takes pins and hides; the default chip is served', async () => {
  const { t, owner } = await setup();
  try {
    const before = (await (await t.call('GET', '/v1/categories/1303')).json()) as Cat;
    assert.deepEqual(before.shows.map((s) => s.feedUrl), [JRE], 'the fake genre chart');
    assert.equal(before.pinned, undefined, 'an untouched category answers as before');

    assert.equal((await aCall(t, 'POST', L('category:1303'), owner, { kind: 'pin', feedUrl: FX, position: 1 })).status, 200);
    assert.equal((await aCall(t, 'PUT', `${L('category:1303')}/default-tab`, owner, { tab: 'newest' })).status, 200);
    let cat = (await (await t.call('GET', '/v1/categories/1303')).json()) as Cat;
    assert.deepEqual(cat.shows.map((s) => s.feedUrl), [FX, JRE], 'the pin is first (Hot); the chart follows');
    assert.equal(cat.shows[0]!.pinned, true);
    assert.equal(cat.shows[0]!.title, 'Fixture Show', 'a show off the chart is drawn from what the server knows');
    assert.deepEqual(cat.pinned, [FX], 'the phone keeps these first under For you and Newest');
    assert.equal(cat.defaultSort, 'newest');

    assert.equal((await aCall(t, 'POST', L('category:1303'), owner, { kind: 'hide', feedUrl: JRE, note: 'not this one' })).status, 200);
    cat = (await (await t.call('GET', '/v1/categories/1303')).json()) as Cat;
    assert.deepEqual(cat.shows.map((s) => s.feedUrl), [FX], 'the hide is gone');
    for (const page of [1, 2]) {
      const p = (await (await t.call('GET', `/v1/categories/1303?page=${page}`)).json()) as Cat;
      assert.equal(p.shows.some((s) => s.feedUrl === JRE || s.feedUrl === FX), false, `page ${page}: no hide, no repeated pin`);
    }

    // The chart's Top tab: a pin first, a hidden episode gone (list `trending`).
    assert.equal((await aCall(t, 'POST', L('trending'), owner, { kind: 'pin', feedUrl: FX, guid: 'g-pin' })).status, 200);
    assert.equal((await aCall(t, 'POST', L('trending'), owner, { kind: 'hide', feedUrl: JRE, guid: 'jre-2400' })).status, 200);
    const d = (await (await t.call('GET', '/v1/discover')).json()) as Disc;
    assert.equal(d.trending[0]!.episode.title, 'Pinned One');
    assert.equal(d.trending.some((i) => i.episode.feedUrl === JRE), false);

    // Admin sees the list as served, pins marked.
    const admin = (await (await aCall(t, 'GET', L('category:1303'), owner)).json()) as { overrides: { kind: string; feedUrl: string; note: string | null }[]; live: { feedUrl: string; pinned: boolean }[]; defaultTab: string | null };
    assert.deepEqual(admin.live.map((r) => [r.feedUrl, r.pinned]), [[FX, true]]);
    assert.equal(admin.defaultTab, 'newest');
    assert.equal(admin.overrides.find((o) => o.kind === 'hide')!.note, 'not this one');
  } finally { await t.close(); }
});

test('A1: start and end times — a pin not started yet, or already over, is not applied; one row per item (a pin replaces a hide); removing a row', async () => {
  const { t, owner } = await setup();
  try {
    const later = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    assert.equal((await aCall(t, 'POST', L('category:1303'), owner, { kind: 'pin', feedUrl: FX, position: 1, startsAt: later })).status, 200);
    assert.equal((await aCall(t, 'POST', L('category:1303'), owner, { kind: 'hide', feedUrl: JRE, endsAt: past })).status, 200);
    let cat = (await (await t.call('GET', '/v1/categories/1303')).json()) as Cat;
    assert.deepEqual(cat.shows.map((s) => s.feedUrl), [JRE], 'neither row counts now');
    // The same item again replaces its row: the fixture pin, live now, at slot 2.
    assert.equal((await aCall(t, 'POST', L('category:1303'), owner, { kind: 'pin', feedUrl: FX, startsAt: past, endsAt: later, position: 2 })).status, 200);
    cat = (await (await t.call('GET', '/v1/categories/1303')).json()) as Cat;
    assert.deepEqual(cat.shows.map((s) => s.feedUrl), [JRE, FX], 'slot 2');
    // A pin on JRE replaces its (expired) hide.
    assert.equal((await aCall(t, 'POST', L('category:1303'), owner, { kind: 'pin', feedUrl: JRE, position: 1 })).status, 200);
    const rows = (await (await aCall(t, 'GET', L('category:1303'), owner)).json()) as { overrides: { id: string; kind: string; feedUrl: string; live: boolean }[] };
    assert.deepEqual(rows.overrides.filter((o) => o.feedUrl === JRE).map((o) => o.kind), ['pin'], 'the pin replaced the hide');
    assert.equal(rows.overrides.filter((o) => o.feedUrl === FX).length, 1, 'one row per item');
    const id = rows.overrides.find((o) => o.feedUrl === JRE)!.id;
    assert.equal((await aCall(t, 'DELETE', `${L('category:1303')}/${id}`, owner)).status, 200);
    assert.equal((await aCall(t, 'DELETE', `${L('category:1303')}/${id}`, owner)).status, 404);
    // Validation: an unknown list, a list that takes hides only, a show list given an episode, an end before the start.
    assert.equal((await aCall(t, 'POST', L('nope'), owner, { kind: 'hide', feedUrl: FX })).status, 404);
    assert.equal((await aCall(t, 'POST', L('nextup'), owner, { kind: 'pin', feedUrl: FX })).status, 422);
    assert.equal((await aCall(t, 'POST', L('popular'), owner, { kind: 'pin', feedUrl: FX, guid: 'g-pin' })).status, 422);
    assert.equal((await aCall(t, 'POST', L('said'), owner, { kind: 'pin', feedUrl: FX })).status, 422);
    assert.equal((await aCall(t, 'POST', L('trending'), owner, { kind: 'pin', feedUrl: FX, startsAt: later, endsAt: past })).status, 422);
    assert.equal((await aCall(t, 'PUT', `${L('trending')}/default-tab`, owner, { tab: 'all' })).status, 422);
    const audit = await t.q<{ area: string; action: string }>("SELECT area, action FROM admin_audit WHERE area = 'discover' ORDER BY id");
    assert.ok(audit.length >= 4 && audit.every((a) => a.action.startsWith('list ')), 'every list write is recorded');
  } finally { await t.close(); }
});

test('G-AL-A3: a show hidden from Admin (no report, with a reason) leaves search, For You, the Top tab and the New shows chart; showing it again brings it back', async () => {
  const { t, owner } = await setup();
  try {
    const search = async () => (await (await t.call('GET', '/v1/search?q=Casey%20Wants%20to%20Believe')).json()) as { shows: Show[]; episodes: { feedUrl: string }[] };
    const forYou = async () => (await (await t.call('GET', '/v1/for-you?interests=1303')).json()) as { items: Item[] };
    const top = async () => ((await (await t.call('GET', '/v1/discover')).json()) as Disc).trending;
    const newChart = async () => ((await (await t.call('GET', '/v1/discover/chart?kind=new')).json()) as { items: Item[] }).items;

    assert.ok((await search()).shows.some((s) => s.feedUrl === REPLY_ALL), 'before: found by search');
    assert.ok((await top()).some((i) => i.episode.feedUrl === JRE), 'before: on the Top tab');
    assert.ok((await forYou()).items.some((i) => i.episode.feedUrl === JRE), 'before: in For You');
    assert.ok((await newChart()).some((i) => i.episode.feedUrl === JRE), 'before: on the New shows chart');

    assert.equal((await aCall(t, 'POST', '/v1/admin/hidden/show', owner, { feedUrl: JRE })).status, 422, 'a reason is needed');
    assert.equal((await aCall(t, 'POST', '/v1/admin/hidden/show', owner, { feedUrl: JRE, reason: 'Owner test' })).status, 200);
    const res = await aCall(t, 'POST', '/v1/admin/hidden/show', owner, { feedUrl: REPLY_ALL, reason: 'Owner test 2' });
    const hidden = (await res.json()) as { shows: { feedUrl: string; reason: string | null; byReport: boolean }[] };
    assert.deepEqual(hidden.shows.map((s) => [s.feedUrl, s.reason, s.byReport]).sort(), [[JRE, 'Owner test', false], [REPLY_ALL, 'Owner test 2', false]].sort());

    const s = await search();
    assert.equal(s.shows.some((x) => x.feedUrl === REPLY_ALL), false, 'search: show gone');
    assert.equal(s.episodes.some((x) => x.feedUrl === REPLY_ALL), false, 'search: episodes gone');
    assert.equal((await top()).some((i) => i.episode.feedUrl === JRE), false, 'Top tab: gone');
    assert.equal((await forYou()).items.some((i) => i.episode.feedUrl === JRE), false, 'For You: gone');
    assert.equal((await newChart()).some((i) => i.episode.feedUrl === JRE), false, 'New shows chart: gone');
    const cat = (await (await t.call('GET', '/v1/categories/1303')).json()) as Cat;
    assert.equal(cat.shows.some((x) => x.feedUrl === JRE || x.feedUrl === REPLY_ALL), false, 'category: gone');
    const audit = await t.q<{ action: string; target: string }>("SELECT action, target FROM admin_audit WHERE area = 'safety' ORDER BY id");
    assert.deepEqual(audit.map((a) => a.action), ['hide show', 'hide show']);

    assert.equal((await aCall(t, 'DELETE', `/v1/admin/hidden/show?feedUrl=${encodeURIComponent(REPLY_ALL)}`, owner)).status, 200);
    assert.ok((await search()).shows.some((x) => x.feedUrl === REPLY_ALL), 'shown again');
  } finally { await t.close(); }
});

test('A3: an episode hidden from Admin leaves the lists; its show stays; showing it again restores it', async () => {
  const { t, owner } = await setup();
  try {
    const chartNew = async () => ((await (await t.call('GET', '/v1/discover/chart?kind=new')).json()) as { items: Item[] }).items;
    assert.equal((await chartNew()).find((i) => i.episode.feedUrl === FX)?.episode.guid, 'g-pin');
    assert.equal((await aCall(t, 'POST', '/v1/admin/hidden/episode', owner, { feedUrl: FX, guid: 'g-pin', reason: 'Wrong file' })).status, 200);
    const [row] = await t.q<{ reason: string; hidden_by: string }>('SELECT reason, hidden_by::text AS hidden_by FROM hidden_episodes WHERE feed_url = $1 AND guid = $2', [FX, 'g-pin']);
    assert.deepEqual(row, { reason: 'Wrong file', hidden_by: owner.id });
    assert.equal((await chartNew()).some((i) => i.episode.guid === 'g-pin'), false);
    assert.equal((await aCall(t, 'DELETE', `/v1/admin/hidden/episode?feedUrl=${encodeURIComponent(FX)}&guid=g-pin`, owner)).status, 200);
    assert.ok((await chartNew()).some((i) => i.episode.guid === 'g-pin'));
  } finally { await t.close(); }
});

test('A4: Popular shows, Premium picks, What listeners said, the New shows chart and the plaza take pins and hides', async () => {
  const { t, owner } = await setup();
  try {
    // Popular shows: pin the fixture show first; hide JRE from Popular only.
    await aCall(t, 'POST', L('popular'), owner, { kind: 'pin', feedUrl: FX, position: 1 });
    await aCall(t, 'POST', L('popular'), owner, { kind: 'hide', feedUrl: JRE });
    await aCall(t, 'POST', L('premium'), owner, { kind: 'hide', feedUrl: REPLY_ALL });
    let d = (await (await t.call('GET', '/v1/discover')).json()) as Disc;
    assert.deepEqual(d.shows!.map((s) => s.feedUrl), [FX, REPLY_ALL]);
    assert.deepEqual(d.premium!.map((s) => s.feedUrl), [JRE], 'Premium is the rest of the chart, less its own hides');

    // What listeners said: hide one quote, pin an old one (past the 14-day window).
    const [l] = await t.q<{ id: string }>("INSERT INTO listeners (email, password_hash, display_name) VALUES ('said@example.com', 'x', 'Said') RETURNING id");
    const epId = fnv1a64(`${FX}\u0001g-pin`);
    const [fresh] = await t.q<{ id: string }>("INSERT INTO comments (episode_id, author_id, body) VALUES ($1, $2, 'fresh') RETURNING id", [epId, l!.id]);
    const [old] = await t.q<{ id: string }>("INSERT INTO comments (episode_id, author_id, body, created_at) VALUES ($1, $2, 'old but gold', now() - interval '40 days') RETURNING id", [epId, l!.id]);
    d = (await (await t.call('GET', '/v1/discover')).json()) as Disc;
    assert.deepEqual(d.said!.map((x) => x.commentId), [fresh!.id]);
    await aCall(t, 'POST', L('said'), owner, { kind: 'pin', commentId: old!.id });
    await aCall(t, 'POST', L('said'), owner, { kind: 'hide', commentId: fresh!.id });
    d = (await (await t.call('GET', '/v1/discover')).json()) as Disc;
    assert.deepEqual(d.said!.map((x) => x.commentId), [old!.id]);

    // The New shows chart (show-level): hide the fixture show.
    const items = async () => ((await (await t.call('GET', '/v1/discover/chart?kind=new')).json()) as { items: Item[] }).items;
    assert.ok((await items()).some((i) => i.episode.feedUrl === FX));
    await aCall(t, 'POST', L('new'), owner, { kind: 'hide', feedUrl: FX });
    assert.equal((await items()).some((i) => i.episode.feedUrl === FX), false);

    // Plaza: a pinned show opens the first page; a hidden one is gone.
    const plaza = async () => ((await (await t.call('GET', '/v1/discover/plaza')).json()) as { items: { feedUrl: string }[] }).items.map((s) => s.feedUrl);
    assert.ok((await plaza()).includes(FX));
    await aCall(t, 'POST', L('plaza'), owner, { kind: 'hide', feedUrl: FX });
    assert.equal((await plaza()).includes(FX), false);
  } finally { await t.close(); }
});

test('A6: never-recommend leaves For You at once; weights are bounded, versioned and reset; the admin page has the numbers', async () => {
  const { t, owner } = await setup();
  try {
    const forYou = async () => ((await (await t.call('GET', '/v1/for-you?interests=1303')).json()) as { items: Item[] }).items;
    assert.ok((await forYou()).some((i) => i.episode.feedUrl === JRE));
    assert.equal((await aCall(t, 'PUT', '/v1/admin/foryou/rules', owner, { feedUrl: JRE, rule: 'never', note: 'test' })).status, 200);
    assert.equal((await forYou()).some((i) => i.episode.feedUrl === JRE), false, 'never recommended');
    assert.equal((await aCall(t, 'PUT', '/v1/admin/foryou/rules', owner, { feedUrl: JRE, rule: 'boost' })).status, 200);
    assert.ok((await forYou()).some((i) => i.episode.feedUrl === JRE), 'boosted: back');
    assert.equal((await aCall(t, 'PUT', '/v1/admin/foryou/rules', owner, { feedUrl: JRE, rule: 'sometimes' })).status, 422);
    assert.equal((await aCall(t, 'DELETE', `/v1/admin/foryou/rules?feedUrl=${encodeURIComponent(JRE)}`, owner)).status, 200);

    type W = { weights: Record<string, number>; version: number; saved: boolean; defaults: Record<string, number>; bounds: Record<string, [number, number]> };
    const get = async () => (await (await aCall(t, 'GET', '/v1/admin/foryou', owner)).json()) as W;
    const w0 = await get();
    assert.deepEqual(w0.weights, w0.defaults);
    assert.equal(w0.saved, false);
    const next = { ...w0.defaults, quality: 2 };
    assert.equal((await aCall(t, 'PUT', '/v1/admin/foryou/weights', owner, { version: 0, weights: { ...next, quality: 99 } })).status, 422, 'out of bounds');
    assert.equal((await aCall(t, 'PUT', '/v1/admin/foryou/weights', owner, { version: 0, weights: next })).status, 200);
    assert.equal((await aCall(t, 'PUT', '/v1/admin/foryou/weights', owner, { version: 0, weights: next })).status, 409, 'a stale version is refused');
    const w1 = await get();
    assert.equal(w1.weights['quality'], 2);
    assert.equal(w1.version, 1);
    assert.ok((await forYou()).length > 0, 'the list still builds with the new weights');
    assert.equal((await aCall(t, 'PUT', '/v1/admin/foryou/weights', owner, { version: 1, weights: null })).status, 200);
    assert.deepEqual((await get()).weights, w0.defaults, 'reset');
  } finally { await t.close(); }
});

test('A9: feedback, search requests and recommendation numbers are in Admin (owner only); the /mod pages still answer', async () => {
  const { t, owner, other } = await setup();
  try {
    await createFeedback(t.db, { listenerId: null, kind: 'Bug', body: 'The play button jumps', images: [] });
    await addSearchRequest(t.db, null, 'tiny desk');
    const fb = (await (await aCall(t, 'GET', '/v1/admin/feedback', owner)).json()) as { items: { body: string; kind: string; images: number }[] };
    assert.deepEqual(fb.items.map((i) => [i.kind, i.body, i.images]), [['Bug', 'The play button jumps', 0]]);
    const sr = (await (await aCall(t, 'GET', '/v1/admin/search-requests', owner)).json()) as { items: { q: string; n: number }[] };
    assert.ok(sr.items.some((i) => i.q === 'tiny desk'));
    const recs = (await (await aCall(t, 'GET', '/v1/admin/recs', owner)).json()) as { days: number; channels: unknown[]; similarityStale: boolean };
    assert.equal(recs.days, 7);
    assert.ok(Array.isArray(recs.channels));
    assert.equal((await aCall(t, 'GET', '/v1/admin/feedback', other)).status, 403);
    assert.equal((await aCall(t, 'GET', '/v1/admin/feedback/00000000-0000-4000-8000-000000000000/9', owner)).status, 404);
    for (const p of ['/mod/recs', '/mod/feedback', '/mod/search-requests']) assert.equal((await t.call('GET', p)).status, 403, `${p} still answers (no cookie → refused page)`);
  } finally { await t.close(); }
});

test('migration 028 copies the M15 pins, hides and category features into list_overrides', async () => {
  const { t } = await setup();
  try {
    await t.q('DROP TABLE list_overrides, list_settings, foryou_rules, foryou_weights');
    await t.q('DELETE FROM schema_migrations WHERE version = 28');
    await t.q("INSERT INTO trending_pins (position, feed_url, guid) VALUES (1, $1, 'g-pin'), (2, $2, NULL)", [FX, JRE]);
    await t.q("INSERT INTO trending_hides (feed_url, guid) VALUES ($1, 'x1')", [REPLY_ALL]);
    await t.q('INSERT INTO category_features (genre_id, position, feed_url) VALUES (1303, 1, $1)', [FX]);
    assert.deepEqual(await migrate(t.runner), [28]);
    const rows = await t.q<{ list_id: string; kind: string; feed_url: string; guid: string | null; position: number | null }>(
      'SELECT list_id, kind, feed_url, guid, position FROM list_overrides ORDER BY list_id, kind, position NULLS LAST');
    assert.deepEqual(rows, [
      { list_id: 'category:1303', kind: 'pin', feed_url: FX, guid: null, position: 1 },
      { list_id: 'trending', kind: 'hide', feed_url: REPLY_ALL, guid: 'x1', position: null },
      { list_id: 'trending', kind: 'pin', feed_url: FX, guid: 'g-pin', position: 1 },
      { list_id: 'trending', kind: 'pin', feed_url: JRE, guid: null, position: 2 },
    ]);
  } finally { await t.close(); }
});
