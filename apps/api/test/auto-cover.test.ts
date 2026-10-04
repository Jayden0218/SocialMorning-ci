// Tests the made-for-you cover: drawn PNG, saved on create, redrawn on rename, never over an upload.
/**
 * Owner, 2026-10-04 — a Studio show with no cover gets a drawn tile (social-core `cover.ts`).
 *
 * The breaks that turn the guards red:
 *   G-AC1 (a new show has a cover): in `createHostedShow`, put back `s.coverUrl ?? null`.
 *   G-AC2 (saving keeps working): in PUT …/details, drop the `isAutoCover(b.coverUrl)` line — the
 *         Studio sends the drawn address back on every save and gets "Upload the cover first".
 *   G-AC3 (an upload is never replaced): in `updateHostedShow`, make the redraw unconditional
 *         (`if (true) n.coverUrl = …`).
 *   G-AC4 (the PNG): in `share/cover.ts` change `COVER_PX` to 1000 in the Resvg `fitTo`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoCoverUrl, hash } from '@socialmorning/social-core';
import { parseFeed } from '@socialmorning/feed-parser';
import { freshDb } from './harness.ts';
import { sCall, studioLogin } from './studio-harness.ts';
import { fakeStore } from './fake-store.ts';

const BASE = 'https://api.example.test';
const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;

/** Width and height from a PNG's IHDR chunk. */
const pngSize = (b: Uint8Array) => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return [v.getUint32(16), v.getUint32(20)];
};

async function setup() {
  const store = fakeStore(true);
  const t = await freshDb({ episodeStorage: store, publicBase: BASE, catalogFetch: down, imageFetch: down } as never);
  const me = await studioLogin(t, 'c@example.com', 'Creator');
  const made = await sCall(t, 'POST', '/v1/studio/hosted-shows', me, { title: 'Late Walks' });
  assert.equal(made.status, 201);
  const { show, shows } = (await made.json()) as { show: { id: string; feedUrl: string; coverUrl: string | null }; shows: { key: string }[] };
  return { t, store, me, show, key: shows[0]!.key };
}

const details = async (s: Awaited<ReturnType<typeof setup>>) =>
  ((await (await sCall(s.t, 'GET', `/v1/studio/shows/${s.key}/details`, s.me)).json()) as { show: { title: string; coverUrl: string } }).show;

test('G-AC4: the tile is a 1400 × 1400 PNG, cached a year; a name the server did not make is a 404', async () => {
  const t = await freshDb({ imageFetch: down } as never);
  const url = new URL(autoCoverUrl(BASE, 'Late Walks'));
  const res = await t.call('GET', url.pathname);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.deepEqual(pngSize(new Uint8Array(await res.arrayBuffer())), [1400, 1400]);
  for (const bad of ['/covers/auto/v1/9-4c.png', '/covers/auto/v1/3-4c-57-41.png', '/covers/auto/v1/3-3c.png', '/covers/auto/v1/x.png']) {
    assert.equal((await t.call('GET', bad)).status, 404, bad);
  }
  await t.close();
});

test('Chinese letters whose font cannot be fetched: still a tile, cached 5 minutes only', async () => {
  const t = await freshDb({ imageFetch: down } as never);
  const res = await t.call('GET', new URL(autoCoverUrl(BASE, '晚间漫谈')).pathname);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=300');
  await t.close();
});

test('G-AC1: a show made with no cover gets the tile as its cover, in the Studio and in its feed', async () => {
  const s = await setup();
  assert.equal(s.show.coverUrl, autoCoverUrl(BASE, 'Late Walks'));
  const parsed = parseFeed(await (await s.t.call('GET', `/feeds/${s.show.id}.xml`)).text(), s.show.feedUrl, { hash });
  assert.equal(parsed.show.imageUrl, autoCoverUrl(BASE, 'Late Walks'));
  await s.t.close();
});

test('G-AC2: saving with the drawn cover sent back works, and a rename redraws the letters', async () => {
  const s = await setup();
  const put = await sCall(s.t, 'PUT', `/v1/studio/shows/${s.key}/details`, s.me, { title: 'Morning Ledger', coverUrl: s.show.coverUrl });
  assert.equal(put.status, 200, 'the drawn address is not an upload to check');
  assert.equal((await details(s)).coverUrl, autoCoverUrl(BASE, 'Morning Ledger'));
  await s.t.close();
});

test('G-AC3: an uploaded cover is kept through a rename; removing it brings the tile back', async () => {
  const s = await setup();
  const tok = (await (await sCall(s.t, 'POST', `/v1/studio/shows/${s.key}/uploads`, s.me, { kind: 'cover', contentType: 'image/png', size: 200_000 })).json()) as { pathname: string };
  const own = s.store.put(tok.pathname, 200_000, 'image/png');
  assert.equal((await sCall(s.t, 'PUT', `/v1/studio/shows/${s.key}/details`, s.me, { coverUrl: own })).status, 200);
  assert.equal((await sCall(s.t, 'PUT', `/v1/studio/shows/${s.key}/details`, s.me, { title: 'Small Rooms' })).status, 200);
  assert.equal((await details(s)).coverUrl, own, 'a rename never replaces an upload');
  assert.equal((await sCall(s.t, 'PUT', `/v1/studio/shows/${s.key}/details`, s.me, { coverUrl: null })).status, 200);
  assert.equal((await details(s)).coverUrl, autoCoverUrl(BASE, 'Small Rooms'));
  await s.t.close();
});
