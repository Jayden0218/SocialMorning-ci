/**
 * M13 — create a show in the Studio and publish uploaded episodes (specs/013-m13-create-show).
 * The store is a fake in memory; the token rules it would enforce are checked at our boundary.
 *
 * The breaks that turn the guards red:
 *   G-F1 (our feed reads clean in the app's parser): in `src/db/repos/hosted.ts` `feedXml`, drop the
 *        `<enclosure …/>` line — every item then warns and no episode survives.
 *   G-Q1 (the ceiling): in `src/routes/studio.ts` POST …/uploads, drop the `used + b.size > ceiling` check.
 *   G-D1 (delete removes the audio): in DELETE …/hosted-episodes/:id, drop `storage.remove(ep.audioUrl)`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash } from '@socialmorning/social-core';
import { parseFeed } from '@socialmorning/feed-parser';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { sCall, studioLogin } from './studio-harness.ts';
import type { EpisodeStorage, StoredFile } from '../src/storage/episodes-blob.ts';

const BASE = 'https://api.example.test';
const STORE = 'https://store.public.blob.vercel-storage.com/';

/** An in-memory store: `uploadToken` records the pathname; a test "uploads" with `put`. */
function fakeStore(ready = true) {
  const files = new Map<string, StoredFile>();
  const removed: string[] = [];
  const s: EpisodeStorage & { put: (pathname: string, size: number, type: string) => string; files: typeof files; removed: string[] } = {
    ready,
    uploadToken: async (pathname) => `token-for:${pathname}`,
    head: async (url) => files.get(url),
    remove: async (url) => { removed.push(url); files.delete(url); },
    put: (pathname, size, contentType) => { const url = STORE + pathname; files.set(url, { url, pathname, size, contentType }); return url; },
    files, removed,
  };
  return s;
}

async function setup(opts: { ceiling?: number; ready?: boolean } = {}) {
  const store = fakeStore(opts.ready ?? true);
  // The catalogue is down in these tests: search must still find created shows (and no test reaches Apple).
  const down = (async () => { throw new Error('catalogue down'); }) as unknown as typeof fetch;
  const t = await freshDb({ episodeStorage: store, publicBase: BASE, catalogFetch: down, ...(opts.ceiling ? { hostedCeilingBytes: opts.ceiling } : {}) } as never);
  const me = await studioLogin(t, 'c@example.com', 'Creator');
  const made = await sCall(t, 'POST', '/v1/studio/hosted-shows', me, { title: '早安电台 Morning', description: 'Coffee & <talk>', category: 'Society & Culture', language: 'zh' });
  assert.equal(made.status, 201);
  const { show, shows } = (await made.json()) as { show: { id: string; feedUrl: string }; shows: { key: string; hosted: boolean; role: string; title: string }[] };
  return { t, store, me, show, key: shows[0]!.key, shows };
}

/** The Studio's upload: ask for a token, put the bytes, publish. */
async function upload(t: TestDb, store: ReturnType<typeof fakeStore>, who: Parameters<typeof sCall>[3], key: string, size = 5_000_000, type = 'audio/mpeg') {
  const tok = await sCall(t, 'POST', `/v1/studio/shows/${key}/uploads`, who, { kind: 'audio', contentType: type, size });
  if (tok.status !== 200) return { status: tok.status, body: await tok.json() };
  const { pathname, token } = (await tok.json()) as { pathname: string; token: string };
  assert.equal(token, `token-for:${pathname}`);
  const audioUrl = store.put(pathname, size, type);
  const pub = await sCall(t, 'POST', `/v1/studio/shows/${key}/hosted-episodes`, who, { title: 'Ep 1 — hello', description: 'Notes & links', audioUrl, durationMs: 1_800_000 });
  return { status: pub.status, body: await pub.json(), audioUrl };
}

test('US1: one form creates a show the creator owns, with a working feed and every Studio page', async () => {
  const { t, me, show, key, shows } = await setup();
  assert.deepEqual([shows[0]!.hosted, shows[0]!.role, shows[0]!.title], [true, 'owner', '早安电台 Morning']);
  assert.equal(show.feedUrl, `${BASE}/feeds/${show.id}.xml`);
  assert.equal((await sCall(t, 'GET', `/v1/studio/shows/${key}/overview`, me)).status, 200, 'the M11 Studio works on it');
  const feed = await t.call('GET', `/feeds/${show.id}.xml`);
  assert.equal(feed.status, 200);
  assert.match(feed.headers.get('content-type') ?? '', /application\/rss\+xml/);
  assert.equal((await sCall(t, 'POST', '/v1/studio/hosted-shows', me, { title: '' })).status, 422);
  assert.equal((await sCall(t, 'POST', '/v1/studio/hosted-shows', me, { title: 'X', category: 'Cooking' })).status, 422, 'Apple categories only');
  await t.close();
});

test('G-F1: an uploaded, published episode is in the feed, and the app\'s own parser reads it with no warnings', async () => {
  const { t, store, me, show, key } = await setup();
  const r = await upload(t, store, me, key);
  assert.equal(r.status, 201);
  const xml = await (await t.call('GET', `/feeds/${show.id}.xml`)).text();
  const parsed = parseFeed(xml, show.feedUrl, { hash });
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.show.title, '早安电台 Morning');
  assert.equal(parsed.episodes.length, 1);
  const e = parsed.episodes[0]!;
  assert.deepEqual([e.title, e.enclosureUrl, e.durationMs], ['Ep 1 — hello', r.audioUrl, 1_800_000]);
  // The app's episode row exists at once, with the id the phone will compute — so comments and numbers work.
  const [row] = await t.q<{ id: string; enclosure_url: string }>('SELECT id, enclosure_url FROM episodes WHERE feed_url = $1', [show.feedUrl]);
  assert.equal(row!.id, hash(show.feedUrl + '\u0001' + e.guid));
  const table = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/episodes`, me)).json()) as { total: number };
  assert.equal(table.total, 1);
  await t.close();
});

test('upload tokens: audio types only, ≤ 200 MB, one path under THIS show; a claimed feed has no uploads', async () => {
  const { t, store, me, key } = await setup();
  const tok = (b: unknown) => sCall(t, 'POST', `/v1/studio/shows/${key}/uploads`, me, b);
  assert.equal((await tok({ kind: 'audio', contentType: 'video/mp4', size: 10 })).status, 422);
  assert.equal((await tok({ kind: 'audio', contentType: 'audio/mpeg', size: 201 * 1024 * 1024 })).status, 422);
  assert.equal((await tok({ kind: 'cover', contentType: 'image/png', size: 6 * 1024 * 1024 })).status, 422);
  // A file put anywhere else (another show's folder) is refused at publish.
  const stray = store.put('episodes/another-show/x.mp3', 1000, 'audio/mpeg');
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/hosted-episodes`, me, { title: 'x', audioUrl: stray })).status, 422);
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/hosted-episodes`, me, { title: 'x', audioUrl: STORE + 'never-uploaded.mp3' })).status, 422);
  await t.close();
});

test('G-Q1: past the storage ceiling, the upload is refused before any bytes move', async () => {
  const { t, store, me, key } = await setup({ ceiling: 8_000_000 });
  assert.equal((await upload(t, store, me, key, 5_000_000)).status, 201);
  const over = await upload(t, store, me, key, 5_000_000);
  assert.equal(over.status, 409);
  assert.equal((over.body as { reason: string }).reason, 'storage_full');
  assert.equal(store.files.size, 1, 'no second file was stored');
  await t.close();
});

test('G-D1: deleting an episode removes it from the feed and its audio from the store', async () => {
  const { t, store, me, show, key } = await setup();
  const r = await upload(t, store, me, key);
  const id = (r.body as { episode: { id: string } }).episode.id;
  assert.equal((await sCall(t, 'DELETE', `/v1/studio/shows/${key}/hosted-episodes/${id}`, me)).status, 204);
  assert.deepEqual(store.removed, [r.audioUrl]);
  const parsed = parseFeed(await (await t.call('GET', `/feeds/${show.id}.xml`)).text(), show.feedUrl, { hash });
  assert.equal(parsed.episodes.length, 0);
  await t.close();
});

test('details: the owner edits the show and sets an uploaded cover; the feed follows; a helper may upload but not edit', async () => {
  const { t, store, me, show, key } = await setup();
  const tok = (await (await sCall(t, 'POST', `/v1/studio/shows/${key}/uploads`, me, { kind: 'cover', contentType: 'image/jpeg', size: 200_000 })).json()) as { pathname: string };
  const coverUrl = store.put(tok.pathname, 200_000, 'image/jpeg');
  const put = await sCall(t, 'PUT', `/v1/studio/shows/${key}/details`, me, { title: 'Morning Talk', coverUrl, explicit: true });
  assert.equal(put.status, 200);
  const xml = await (await t.call('GET', `/feeds/${show.id}.xml`)).text();
  const parsed = parseFeed(xml, show.feedUrl, { hash });
  assert.deepEqual([parsed.show.title, parsed.show.imageUrl], ['Morning Talk', coverUrl]);
  const helper = await studioLogin(t, 'h@example.com', 'Helper');
  await sCall(t, 'POST', `/v1/studio/shows/${key}/team`, me, { email: 'h@example.com' });
  assert.equal((await sCall(t, 'PUT', `/v1/studio/shows/${key}/details`, helper, { title: 'Hijack' })).status, 403);
  assert.equal((await upload(t, store, helper, key)).status, 201, 'a helper can publish episodes');
  await t.close();
});

test('the store not connected: creating works, uploading says why; search finds created shows; giving a created show back removes it (410)', async () => {
  const { t, me, show, key } = await setup({ ready: false });
  const r = await sCall(t, 'POST', `/v1/studio/shows/${key}/uploads`, me, { kind: 'audio', contentType: 'audio/mpeg', size: 10 });
  assert.equal(r.status, 503);
  const listener = await signUp(t, 'l@example.com', 'L');
  const found = (await (await t.call('GET', `/v1/search?q=${encodeURIComponent('早安')}`, undefined, listener.token)).json()) as { shows: { feedUrl: string }[] };
  assert.equal(found.shows[0]?.feedUrl, show.feedUrl);
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/release`, me, { confirm: '早安电台 Morning' })).status, 204);
  assert.equal((await t.call('GET', `/feeds/${show.id}.xml`)).status, 410);
  await t.close();
});
