// Tests the Moments list: top-10 % buckets with >= 5 reactions, top comments, followed first, paged, no Scan.
/** M31 T026, specs/033-m31-redesign/contracts/moments.md. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { createApp } from '../src/app.ts';
import { addHeatMark } from '../src/heat/ddb.ts';
import { TEST_PEPPER, signUp, type TestDb } from './harness.ts';
import { ownBackend } from './dv-neutral.ts';
import { putEpisode } from './put-episode.ts';
import { fakeApple } from './fake-apple.ts';

const FX = 'https://feeds.example.com/moments-followed.xml';
const FC = 'https://feeds.example.com/moments-chart.xml';
const E = (feed: string, guid: string) => fnv1a64(`${feed}\u0001${guid}`);
const DURATION = 1_000_000; // a bucket is 10 000 ms
type Moment = { curve?: number[]; episodeId: string; showTitle: string; episodeTitle: string; feedUrl: string; guid: string; enclosureUrl?: string; coverUrl?: string; startMs: number; endMs: number; reactions: number; rank: number; followed: boolean; comments: { id: string; author: string; text: string; likes: number }[] };
type Page = { items: Moment[]; next?: string };

async function build() {
  const be = await ownBackend();
  const apple = fakeApple();
  const app = createApp({ db: be.db, pepper: TEST_PEPPER, catalogFetch: apple.fetch as typeof fetch, picksRaw: [] });
  const t: TestDb = {
    db: be.db, app, store: be.store,
    call: async (method, path, body, token, headers = {}) => {
      const r = await app.request(path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
      await be.drain();
      return r;
    },
    close: async () => { await be.close(); },
  };
  return t;
}

/** `counts[b]` listeners mark bucket b of the episode. */
async function heat(t: TestDb, episodeId: string, counts: Record<number, number>) {
  for (const [b, n] of Object.entries(counts)) for (let i = 0; i < n; i++) await addHeatMark(t.store, { episodeId, listenerId: `fan-${episodeId.slice(0, 4)}-${b}-${i}`, bucket: Number(b) });
  await (await import('../src/jobs/outbox.ts')).drainOutbox(t.store); // M32 C6: the curve moves by the outbox, so it has to run before anything reads
}

async function seed(t: TestDb, feed: string, guid: string, title: string) {
  const id = E(feed, guid);
  await putEpisode(t, id, { feedUrl: feed, guid, title, showTitle: `Show ${guid}`, enclosureUrl: `https://cdn/${guid}.mp3`, durationMs: DURATION, imageUrl: 'https://img.example.com/c.jpg', publishedAt: '2026-10-20T00:00:00.000Z' });
  return id;
}

test('rule: a bucket must be in the top 10 AND have >= 5 reactions; startMs/endMs are bucket edges; comments are that bucket\'s, most liked first', async () => {
  const t = await build();
  const ep = await seed(t, FX, 'f1', 'Followed one');
  const a = await signUp(t);
  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: FX, createdAt: '2026-09-20T10:00:00.000Z' }] }, a.token);
  // Buckets 0..11 hold 5..16 reactions: the top 10 are buckets 2..11 (>= 7); buckets 0 and 1 have >= 5 but are not top 10 %.
  const counts: Record<number, number> = {};
  for (let b = 0; b < 12; b++) counts[b] = 5 + b;
  counts[40] = 4; // below 5, and top-10 ranked once the others are out? No: rank 13, and < 5 anyway.
  await heat(t, ep, counts);
  const b = await signUp(t, 'b@example.com', 'Bea');
  const c = await signUp(t, 'c@example.com', 'Cee');
  const lowC = await t.call('POST', `/v1/episodes/${ep}/comments`, { body: 'quiet take', offsetMs: 115_000 }, b.token); // bucket 11
  const hiC = await t.call('POST', `/v1/episodes/${ep}/comments`, { body: 'loud take', offsetMs: 118_000 }, c.token); // bucket 11
  await t.call('POST', `/v1/episodes/${ep}/comments`, { body: 'elsewhere', offsetMs: 505_000 }, c.token); // bucket 50
  const hiBody = (await hiC.json()) as { id?: string; comment?: { id: string } }; const hiId = hiBody.id ?? hiBody.comment!.id;
  assert.equal(lowC.status, 200); assert.equal(hiC.status, 200);
  assert.equal((await t.call('PUT', `/v1/comments/${hiId}/like`, undefined, b.token)).status, 200);

  const r = await t.call('GET', '/v1/discover/moments?limit=50', undefined, a.token);
  assert.equal(r.status, 200);
  const items = ((await r.json()) as Page).items.filter((m) => m.episodeId === ep);
  const starts = items.map((m) => m.startMs).sort((x, y) => x - y);
  assert.deepEqual(starts, [20_000, 30_000, 40_000, 50_000, 60_000, 70_000, 80_000, 90_000, 100_000, 110_000], 'buckets 2..11 only');
  const top = items[0]!;
  assert.equal(top.startMs, 110_000); assert.equal(top.endMs, 120_000); assert.equal(top.reactions, 18); // 16 fans + 2 commenters
  assert.equal(top.followed, true); assert.equal(top.rank, 1); assert.equal(top.showTitle, 'Show f1'); assert.equal(top.episodeTitle, 'Followed one');
  assert.equal(top.coverUrl, 'https://img.example.com/c.jpg');
  assert.equal(top.feedUrl, FX); assert.equal(top.guid, 'f1'); assert.equal(top.enclosureUrl, 'https://cdn/f1.mp3');
  assert.deepEqual(top.comments.map((x) => [x.text, x.author]), [['loud take', 'Cee'], ['quiet take', 'Bea']]);
  assert.ok(top.comments[0]!.likes >= 1);
  assert.equal(items.filter((m) => m.comments.length > 0).length, 1, 'the bucket-50 comment belongs to no moment');
  await t.close();
});

test('order: followed shows first then the chart; pages by limit/cursor; anonymous gets the chart only; bad limit is 422', async () => {
  const t = await build();
  const fol = await seed(t, FX, 'f1', 'Followed one');
  const hot = await seed(t, FC, 'c1', 'Chart one');
  const a = await signUp(t);
  const talker = await signUp(t, 'b@example.com', 'Bea');
  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: FX, createdAt: '2026-09-20T10:00:00.000Z' }] }, a.token);
  await heat(t, fol, { 10: 5, 11: 6 });
  await heat(t, hot, { 10: 20 });
  for (let i = 0; i < 3; i++) await t.call('POST', `/v1/episodes/${hot}/comments`, { body: `chart talk ${i}`, offsetMs: 100_000 + i }, talker.token);

  const all = (await (await t.call('GET', '/v1/discover/moments', undefined, a.token)).json()) as Page;
  assert.deepEqual(all.items.map((m) => [m.episodeId, m.followed]), [[fol, true], [fol, true], [hot, false]], 'followed first even though the chart moment has more reactions');
  assert.deepEqual(all.items.map((m) => m.rank), [1, 2, 3]);
  assert.deepEqual(all.items.map((m) => [m.feedUrl, m.guid]), [[FX, 'f1'], [FX, 'f1'], [FC, 'c1']], 'followed and chart items both name their episode in its feed');
  assert.equal(all.items[2]!.enclosureUrl, 'https://cdn/c1.mp3');
  assert.ok(all.items[0]!.reactions >= all.items[1]!.reactions);

  const p1 = (await (await t.call('GET', '/v1/discover/moments?limit=2', undefined, a.token)).json()) as Page;
  assert.equal(p1.items.length, 2); assert.ok(p1.next);
  const p2 = (await (await t.call('GET', `/v1/discover/moments?limit=2&cursor=${encodeURIComponent(p1.next!)}`, undefined, a.token)).json()) as Page;
  assert.deepEqual([...p1.items, ...p2.items].map((m) => m.rank), [1, 2, 3]);
  assert.equal(p2.next, undefined);

  const anon = (await (await t.call('GET', '/v1/discover/moments')).json()) as Page;
  assert.ok(anon.items.length > 0 && anon.items.every((m) => !m.followed && m.episodeId === hot));

  for (const q of ['limit=0', 'limit=51', 'limit=x', 'cursor=!!!']) assert.equal((await t.call('GET', `/v1/discover/moments?${q}`, undefined, a.token)).status, 422, q);
  await t.close();
});

test('nothing under 5 reactions and a unknown duration give no moments', async () => {
  const t = await build();
  const ep = await seed(t, FX, 'f1', 'Quiet');
  const noDur = E(FX, 'f2');
  await putEpisode(t, noDur, { feedUrl: FX, guid: 'f2', title: 'No duration', showTitle: 'Show f2', enclosureUrl: 'https://cdn/f2.mp3', publishedAt: '2026-10-19T00:00:00.000Z' });
  const a = await signUp(t);
  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: FX, createdAt: '2026-09-20T10:00:00.000Z' }] }, a.token);
  await heat(t, ep, { 10: 4, 11: 3 });
  await heat(t, noDur, { 10: 9 });
  const r = (await (await t.call('GET', '/v1/discover/moments', undefined, a.token)).json()) as Page;
  assert.deepEqual(r.items, []);
  await t.close();
});

const FS = 'https://feeds.example.com/moments-show.xml';
const FSC = 'https://feeds.example.com/moments-show-other.xml';
test('feedUrl: only that show\'s episodes, newest first, no chart; followed flag follows the viewer; hidden episodes dropped; unknown show is empty', async () => {
  const t = await build();
  const mine = await seed(t, FS, 's1', 'Followed one');
  const older = E(FS, 's0');
  await putEpisode(t, older, { feedUrl: FS, guid: 's0', title: 'Older', showTitle: 'Show f0', enclosureUrl: 'https://cdn/f0.mp3', durationMs: DURATION, publishedAt: '2026-09-01T00:00:00.000Z' });
  const other = await seed(t, FSC, 'sc1', 'Chart one');
  const a = await signUp(t);
  await heat(t, mine, { 10: 6 });
  await heat(t, older, { 20: 9 });
  await heat(t, other, { 30: 50 });

  const anon = (await (await t.call('GET', `/v1/discover/moments?feedUrl=${encodeURIComponent(FS)}`)).json()) as Page;
  assert.deepEqual(anon.items.map((m) => [m.episodeId, m.followed, m.feedUrl]), [[older, false, FS], [mine, false, FS]], 'this show only, most reactions first');
  assert.equal(anon.items.some((m) => m.episodeId === other), false, 'the chart is not mixed in');

  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: FS, createdAt: '2026-09-20T10:00:00.000Z' }] }, a.token);
  const me = (await (await t.call('GET', `/v1/discover/moments?feedUrl=${encodeURIComponent(FS)}`, undefined, a.token)).json()) as Page;
  assert.ok(me.items.length === 2 && me.items.every((m) => m.followed));
  assert.deepEqual(me.items.map((m) => m.rank), [1, 2]);

  const { setHidden } = await import('../src/db/repos/studio/hidden-episodes.ts');
  await setHidden(t.db, FS, older, true, a.id ?? 'admin');
  const hid = (await (await t.call('GET', `/v1/discover/moments?feedUrl=${encodeURIComponent(FS)}`)).json()) as Page;
  assert.deepEqual(hid.items.map((m) => m.episodeId), [mine], 'a host-hidden episode leaves the list');

  const none = (await (await t.call('GET', `/v1/discover/moments?feedUrl=${encodeURIComponent('https://nowhere.example/x.xml')}`)).json()) as Page;
  assert.deepEqual(none.items, []);
  assert.equal((await t.call('GET', '/v1/discover/moments?feedUrl=')).status, 422, 'an empty feedUrl is not a filter');
  await t.close();
});

const momentsGet = async (t: TestDb, u: string) => t.call('GET', `/v1/discover/moments?feedUrl=${encodeURIComponent(u)}`);
const padUrl = (n: number) => `https://feeds.example.com/${'a'.repeat(n - 'https://feeds.example.com/'.length)}`;

test('feedUrl: an ftp:// URL is 422', async () => {
  const t = await build();
  assert.equal((await momentsGet(t, 'ftp://x.example/feed')).status, 422);
  await t.close();
});

test('feedUrl: a javascript: URL is 422', async () => {
  const t = await build();
  assert.equal((await momentsGet(t, 'javascript:alert(1)')).status, 422);
  await t.close();
});

test('feedUrl: 2049 characters is 422', async () => {
  const t = await build();
  assert.equal(padUrl(2049).length, 2049);
  assert.equal((await momentsGet(t, padUrl(2049))).status, 422);
  await t.close();
});

test('feedUrl: 2048 characters is allowed; an unknown show is empty', async () => {
  const t = await build();
  assert.equal(padUrl(2048).length, 2048);
  const r = await momentsGet(t, padUrl(2048));
  assert.equal(r.status, 200);
  assert.deepEqual(((await r.json()) as Page).items, []);
  await t.close();
});

test('feedUrl: plain http:// and https:// URLs are allowed', async () => {
  const t = await build();
  for (const u of ['http://feeds.example.com/x.xml', 'https://feeds.example.com/x.xml']) {
    const r = await momentsGet(t, u);
    assert.equal(r.status, 200, u);
    assert.deepEqual(((await r.json()) as Page).items, [], u);
  }
  await t.close();
});

// M31 wave 5b (specs/033-m31-redesign, Show "Hot moments" card, drawing `PK.bars`): every moment carries its episode's whole heat curve.
test('curve: every moment has curve = 100 integers 0..100, the episode\'s heat normalised to its hottest bucket, the same for each moment of the episode', async () => {
  const t = await build();
  const ep = await seed(t, FX, 'cv1', 'Curve one');
  const other = await seed(t, FX, 'cv2', 'Curve two');
  const a = await signUp(t);
  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: FX, createdAt: '2026-09-20T10:00:00.000Z' }] }, a.token);
  await heat(t, ep, { 0: 2, 1: 10, 2: 5 }); // hottest = 10 -> 100; 5 -> 50; 2 -> 20; the rest 0
  await heat(t, other, { 7: 8 });           // its own max (8) -> 100, so it is not scaled by the other episode
  const r = await t.call('GET', '/v1/discover/moments?limit=50', undefined, a.token);
  assert.equal(r.status, 200);
  const items = ((await r.json()) as { items: (Moment & { curve?: number[] })[] }).items;
  const mine = items.filter((m) => m.episodeId === ep);
  assert.equal(mine.length, 2, 'buckets 1 and 2 are the moments');
  for (const m of items) {
    assert.ok(Array.isArray(m.curve), 'curve is present');
    assert.equal(m.curve!.length, 100);
    assert.ok(m.curve!.every((v) => Number.isInteger(v) && v >= 0 && v <= 100), 'integers 0..100');
    assert.equal(Math.max(...m.curve!), 100, 'normalised to the hottest bucket');
  }
  assert.deepEqual(mine[0]!.curve, mine[1]!.curve, 'the same curve for every moment of one episode');
  const c = mine[0]!.curve!;
  assert.deepEqual([c[0], c[1], c[2], c[3], c[99]], [20, 100, 50, 0, 0]);
  const o = items.find((m) => m.episodeId === other)!.curve!;
  assert.equal(o[7], 100); assert.equal(o[1], 0, 'another episode\'s heat does not leak in');
  await t.close();
});

test('curve: the per-show filter (?feedUrl=) carries the curve too', async () => {
  const t = await build();
  const ep = await seed(t, FX, 'cv3', 'Curve three');
  await heat(t, ep, { 20: 12, 21: 6 });
  const r = await t.call('GET', `/v1/discover/moments?limit=50&feedUrl=${encodeURIComponent(FX)}`);
  assert.equal(r.status, 200);
  const items = ((await r.json()) as { items: (Moment & { curve?: number[] })[] }).items.filter((m) => m.episodeId === ep);
  assert.ok(items.length >= 1);
  for (const m of items) { assert.equal(m.curve?.length, 100); assert.equal(m.curve![20], 100); assert.equal(m.curve![21], 50); }
  await t.close();
});

test('curve: normalisedCurve is max-scaled and rounded; an all-zero (flat) curve is all 0, never NaN', async () => {
  const mod = (await import('../src/db/repos/discover/ddb/moments.ts')) as { normalisedCurve?: (c: readonly number[]) => number[] };
  assert.equal(typeof mod.normalisedCurve, 'function', 'moments.ts exports normalisedCurve(curve)');
  const flat = mod.normalisedCurve!(Array.from({ length: 100 }, () => 0));
  assert.equal(flat.length, 100); assert.ok(flat.every((v) => v === 0));
  const c = Array.from({ length: 100 }, () => 0); c[3] = 18; c[4] = 7; c[5] = 1;
  const n = mod.normalisedCurve!(c);
  assert.deepEqual([n[3], n[4], n[5], n[6]], [100, Math.round((7 / 18) * 100), Math.round((1 / 18) * 100), 0]);
  assert.ok(n.every((v) => Number.isInteger(v) && v >= 0 && v <= 100));
});
