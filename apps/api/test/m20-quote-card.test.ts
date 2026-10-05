// Tests the transcript quote card: a 1080×1350 PNG with the quote, and the 280-character limit.
/**
 * M20 US1 (spec FR-001; contracts/api.md "Share a quote"; quickstart A10). The card on a phone's
 * share sheet is quickstart B1 — NOT VERIFIED here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb } from './harness.ts';
import { cardTree, imageKind, QUOTE_MAX } from '../src/share/card.ts';

const ep = { feedUrl: 'https://feeds.example.com/q.xml', guid: 'g1', title: 'How a button got made', showTitle: 'Things', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
const pngSize = (b: Uint8Array) => { const v = new DataView(b.buffer, b.byteOffset, b.byteLength); return [v.getUint32(16), v.getUint32(20)]; };

test('FR-001: GET /v1/share/quote/:id.png?q= is the 1080×1350 card with the quote; public for a day', async () => {
  const t = await freshDb({ imageFetch: (async () => new Response('no', { status: 404 })) as typeof fetch });
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 3_000_000 });
  const q = encodeURIComponent('Every button is a promise. Keep it.');
  const r = await t.call('GET', `/v1/share/quote/${EP}.png?t=65000&q=${q}`);
  assert.equal(r.status, 200, await r.clone().text().then((s) => s.slice(0, 200)));
  assert.equal(r.headers.get('cache-control'), 'public, max-age=86400');
  const png = new Uint8Array(await r.arrayBuffer());
  assert.equal(imageKind(png), 'image/png');
  assert.deepEqual(pngSize(png), [1080, 1350]);
  await t.close();
});

test('A10: a quote of 281 characters is refused, 280 is drawn; an empty one is refused; an unknown episode is 404', async () => {
  const t = await freshDb({ imageFetch: (async () => new Response('no', { status: 404 })) as typeof fetch });
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 3_000_000 });
  const over = await t.call('GET', `/v1/share/quote/${EP}.png?q=${'a'.repeat(QUOTE_MAX + 1)}`);
  assert.equal(over.status, 422);
  assert.equal((await t.call('GET', `/v1/share/quote/${EP}.png?q=`)).status, 422);
  assert.equal((await t.call('GET', `/v1/share/quote/${EP}.png?q=${'a'.repeat(QUOTE_MAX)}`)).status, 200);
  assert.equal((await t.call('GET', '/v1/share/quote/0000000000000000.png?q=hi')).status, 404);
  await t.close();
});

test('the quote is in the drawing, whole when it fits', () => {
  const tree = JSON.stringify(cardTree({ title: 'T', show: 'S', atMs: 1000, quote: 'Keep  it\nsimple' }));
  assert.ok(tree.includes('Keep it simple'), 'spaces and line breaks folded, text whole');
  assert.ok(tree.includes('at 0:01'));
});
