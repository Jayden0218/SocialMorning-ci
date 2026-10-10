// Tests the cover tint: a solid PNG gives its colour, a split one the average, cached by URL.
/**
 * M21 US4 T055 (research R6): the server works out a cover's colour with resvg — fetched with the
 * share card's fetcher, cached in `cache` as `tint:<imageUrl>` (30 days; a miss for a day), and
 * never holding a read for more than the wait (null meanwhile, the colour cached for next time).
 *
 * The break that turns it red: in `src/share/tint.ts` `averageHex`, return the first pixel instead
 * of the average (the half-black, half-white cover comes back black, not grey).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Resvg } from '@resvg/resvg-wasm';
import { freshDb } from './harness.ts';
import { cacheBodyOf } from './lb-seed.ts';
import { assets } from '../src/share/card.ts';
import { averageHex, tintOf, TINT_MISS_TTL_MS, TINT_TTL_MS } from '../src/share/tint.ts';

/** A PNG drawn by resvg itself: `w`×`h`, filled by the given SVG body. */
async function png(body: string, w = 40, h = 40): Promise<Uint8Array> {
  await assets();
  return new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`).render().asPng();
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const near = (hex: string | null, want: number[], by = 3) => {
  assert.ok(hex !== null && /^#[0-9a-f]{6}$/.test(hex), `not a colour: ${hex}`);
  channels(hex).forEach((v, i) => assert.ok(Math.abs(v - want[i]!) <= by, `${hex} is not near ${want.join(',')}`));
};

test('a solid cover gives its own colour; a half-black, half-white one gives grey (the average, not one pixel)', async () => {
  near(await averageHex({ mime: 'image/png', bytes: await png('<rect width="40" height="40" fill="#336699"/>') }), [0x33, 0x66, 0x99]);
  const split = await averageHex({ mime: 'image/png', bytes: await png('<rect width="20" height="40" fill="#000000"/><rect x="20" width="20" height="40" fill="#ffffff"/>') });
  near(split, [128, 128, 128], 10);
  assert.equal(await averageHex({ mime: 'image/png', bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6]) }), null, 'bytes that are not a picture: null, no throw');
});

test('tintOf: fetched once, then served from the cache for 30 days; a cover that fails is null and asked again after a day', async () => {
  const red = await png('<rect width="40" height="40" fill="#c0392b"/>');
  const asked: string[] = [];
  const f = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    if (url === 'https://img.example/red.png') return new Response(new Uint8Array(red), { status: 200, headers: { 'content-type': 'image/png' } });
    return new Response('gone', { status: 404 });
  }) as typeof fetch;
  const t = await freshDb();
  let clock = Date.parse('2026-10-06T00:00:00Z');
  const now = () => clock;
  near(await tintOf(t.db, f, 'https://img.example/red.png', { now, waitMs: 5000 }), [0xc0, 0x39, 0x2b]);
  assert.ok(await cacheBodyOf(t, 'tint:https://img.example/red.png'), 'kept in the cache table under tint:<imageUrl>');
  near(await tintOf(t.db, f, 'https://img.example/red.png', { now, waitMs: 5000 }), [0xc0, 0x39, 0x2b]);
  assert.equal(asked.length, 1, 'the second read comes from the cache');
  clock += TINT_TTL_MS + 1;
  await tintOf(t.db, f, 'https://img.example/red.png', { now, waitMs: 5000 });
  assert.equal(asked.length, 2, 'after 30 days it is worked out again');

  assert.equal(await tintOf(t.db, f, 'https://img.example/gone.png', { now, waitMs: 5000 }), null);
  assert.equal(await tintOf(t.db, f, 'https://img.example/gone.png', { now, waitMs: 5000 }), null);
  assert.equal(asked.filter((u) => u.endsWith('gone.png')).length, 1, 'a miss is cached too');
  clock += TINT_MISS_TTL_MS + 1;
  await tintOf(t.db, f, 'https://img.example/gone.png', { now, waitMs: 5000 });
  assert.equal(asked.filter((u) => u.endsWith('gone.png')).length, 2, 'and asked again after a day');

  assert.equal(await tintOf(t.db, f, null), null);
  assert.equal(await tintOf(t.db, f, 'ftp://img.example/x.png'), null);
  await t.close();
});

test('a slow cover never holds the read: null now, the colour cached for the next read', async () => {
  const blue = await png('<rect width="40" height="40" fill="#1e3a8a"/>');
  const f = (async () => {
    await new Promise((r) => setTimeout(r, 300));
    return new Response(new Uint8Array(blue), { status: 200, headers: { 'content-type': 'image/png' } });
  }) as unknown as typeof fetch;
  const t = await freshDb();
  const started = Date.now();
  assert.equal(await tintOf(t.db, f, 'https://img.example/slow.png', { waitMs: 50 }), null);
  assert.ok(Date.now() - started < 250, 'answered at the wait, not when the cover arrived');
  let hex: string | null = null;
  for (let i = 0; i < 20 && hex === null; i++) {
    await new Promise((r) => setTimeout(r, 100));
    hex = await tintOf(t.db, f, 'https://img.example/slow.png', { waitMs: 50 });
  }
  near(hex, [0x1e, 0x3a, 0x8a]);
  await t.close();
});
