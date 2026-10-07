// Tests the share card PNG and the shared episode web page.
/**
 * M12 FR-034 — the share card is a real 1080×1350 PNG (rendered by satori + resvg-wasm, no
 * network needed for Latin text), cached a day, with no audio anywhere; NEW-8 — the episode
 * page `/e/:id` is HTML with "Open in SocialNet" and no player.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { familyFor, imageKind, mmss, renderCard } from '../src/share/card.ts';

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', title: 'How a button got made', showTitle: 'Things', enclosureUrl: 'https://cdn/1.mp3', imageUrl: 'https://img.example/art.png' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);

/** A valid 2×2 PNG (red), small enough to write out. */
const PNG_2x2 = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg==', 'base64'));

const pngSize = (b: Uint8Array) => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return [v.getUint32(16), v.getUint32(20)];
};

test('FR-034: GET /v1/share/episode/:id.png is a 1080×1350 PNG, public for a day; the artwork is fetched from the publisher; "at mm:ss" with t', async () => {
  const asked: string[] = [];
  const imageFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    if (url === ep.imageUrl) return new Response(PNG_2x2, { status: 200, headers: { 'content-type': 'image/png' } });
    return new Response('no', { status: 404 });
  }) as typeof fetch;
  const t = await freshDb({ imageFetch });
  await putEpisode(t, `${EP}`, { ...ep, durationMs: 3_000_000 });

  const r = await t.call('GET', `/v1/share/episode/${EP}.png?t=872000`);
  assert.equal(r.status, 200, await r.clone().text().then((s) => s.slice(0, 200)));
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=86400');
  const png = new Uint8Array(await r.arrayBuffer());
  assert.equal(imageKind(png), 'image/png');
  assert.deepEqual(pngSize(png), [1080, 1350]);
  assert.deepEqual(asked, [ep.imageUrl], 'the artwork, and nothing else — no audio, no font fetch for Latin text');

  // The artwork gone: the card still renders.
  await t.q("UPDATE episodes SET image_url = 'https://img.example/gone.png'");
  const plain = await t.call('GET', `/v1/share/episode/${EP}.png`);
  assert.equal(plain.status, 200);
  assert.deepEqual(pngSize(new Uint8Array(await plain.arrayBuffer())), [1080, 1350]);

  assert.equal((await t.call('GET', '/v1/share/episode/0000000000000000.png')).status, 404);
  assert.equal((await t.call('GET', `/v1/share/episode/${EP}.jpg`)).status, 404);
  await t.close();
});

test('NEW-8: /e/:id is an HTML page — title, show, artwork, Open in SocialNet, the share card as its preview — and no player', async () => {
  const t = await freshDb();
  await putEpisode(t, `${EP}`, { ...ep, title: 'A <b>bold</b> title', durationMs: 3_000_000 });
  await t.q(`INSERT INTO cache (key, body, fetched_at) VALUES ($1, $2::text::jsonb, now())`, [`feed:${ep.feedUrl}`, JSON.stringify({ show: { link: 'https://things.example/' }, episodes: [{ guid: 'g1', link: 'https://things.example/ep1' }] })]);
  const r = await t.call('GET', `/e/${EP}?t=65000`);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.ok(html.includes('A &lt;b&gt;bold&lt;/b&gt; title'), 'the title is escaped');
  assert.ok(html.includes('Things'));
  assert.ok(html.includes(`socialmorning://episode/${EP}?t=65000`));
  assert.ok(html.includes('Open in SocialNet'));
  assert.ok(html.includes('https://things.example/ep1'), "the publisher's own page for the episode");
  assert.ok(html.includes(`/v1/share/episode/${EP}.png?t=65000`), 'og:image is the share card');
  assert.ok(html.includes('at 1:05'));
  assert.ok(!/<audio|<video|\.mp3/.test(html), 'no player and no audio link');
  assert.equal((await t.call('GET', '/e/nope')).status, 404);
  await t.close();
});

test('mmss and imageKind', () => {
  assert.equal(mmss(65_000), '1:05');
  assert.equal(mmss(3_725_000), '1:02:05');
  assert.equal(imageKind(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(imageKind(Uint8Array.from([0x47, 0x49, 0x46, 0x38])), undefined);
});

test('FR-034: a Chinese title asks Google Fonts for Noto Sans SC, subset to its characters, as an old browser (TrueType); a failed font fetch still renders', async () => {
  const asked: { url: string; ua: string | null }[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    asked.push({ url: String(input), ua: new Headers(init?.headers).get('user-agent') });
    return new Response('down', { status: 503 });
  }) as typeof fetch;
  const png = await renderCard({ title: '一个按钮', show: 'Things' }, f);
  assert.equal(imageKind(png), 'image/png');
  assert.ok(asked.length >= 1);
  const u = new URL(asked[0]!.url);
  assert.equal(u.host, 'fonts.googleapis.com');
  assert.match(u.searchParams.get('family')!, /^Noto Sans SC:wght@(400|700)$/);
  const text = u.searchParams.get('text')!;
  assert.ok(text.length > 0 && [...text].every((ch) => '一个按钮'.includes(ch)), `subset to the title's characters (${text})`);
  assert.match(asked[0]!.ua!, /Safari\/533/);
  assert.equal(familyFor('ja-JP|zh-CN|zh-TW|zh-HK', '一个'), 'Noto Sans SC', 'what satori actually passes for Han');
  assert.equal(familyFor('ja-JP|zh-CN|zh-TW|zh-HK', 'ひらがな'), 'Noto Sans JP');
  assert.equal(familyFor('zh-TW|ja-JP|zh-CN|zh-HK', '個'), 'Noto Sans TC');
  assert.equal(familyFor('ko-KR', '한'), 'Noto Sans KR');
  assert.equal(familyFor('unknown', 'ŋ'), 'Noto Sans');
  assert.equal(familyFor('emoji', '🙂'), undefined);
});
