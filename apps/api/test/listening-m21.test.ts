// Tests M21 listening data, sticker placements on the profile, and the monthly recap card.
/**
 * M21 US9 (specs/022-m21-the-xiaoyuzhou-gaps, T100; contracts/api.md). Quickstart B13 (the page,
 * the canvas and the shared picture on a phone) is NOT VERIFIED here.
 *
 * Independent test — the bar for yesterday equals the minutes listened yesterday, as stored.
 *   The break that turns it red: in packages/social-core/src/stats.ts `daySeries`, start the loop
 *   at `i = n` (the series ends yesterday) — the bar for yesterday reads 0.
 * At most 10 placements, bounds checked, saved on the server and returned to any viewer.
 *   The break that turns it red: in src/routes/account/stickers.ts skip `checkPlacements` — the
 *   11-sticker PUT answers 204 (or the database refuses with 500), not 400.
 * hide_decorations empties `stickers`; hide_stickers sets `stickersHidden` for others.
 *   The break that turns it red: in src/db/repos/account/stickers.ts `stickerView`, always read
 *   the placements — the hidden profile still returns two stickers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { todayFor } from '../src/routes/library/listened.ts';
import { imageKind } from '../src/share/card.ts';
import { hoursMinutes, monthTitle, recapTree } from '../src/share/recap.ts';

const ep = { feedUrl: 'https://feeds.example.com/l.xml', guid: 'g1', title: 'Ep 1', showTitle: 'Show L', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
const M = 60_000;
const DAY = 86_400_000;
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

type Listening = { range: string; days: { day: string; minutes: number }[]; totalMinutes: number; topShows: { feedUrl: string; title: string; minutes: number }[]; earned: Record<string, string> };
const get = async (t: TestDb, token: string, q: string) => {
  const r = await t.call('GET', `/v1/me/listening${q}`, undefined, token);
  assert.equal(r.status, 200, await r.clone().text());
  return (await r.json()) as Listening;
};
const listen = (t: TestDb, token: string, day: string, ms: number) =>
  t.call('PUT', '/v1/me/listened', { deviceId: 'p1', days: [{ episodeId: EP, day, ranges: [[0, ms]] }] }, token);

test('US9 independent test: the bar for yesterday is the minutes listened yesterday; 30 points; top shows; earned days', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 20_000_000 });
  const a = await signUp(t);
  const now = Date.now();
  const today = dayOf(now);
  const yesterday = dayOf(now - DAY);
  // Nothing yet: 30 zero bars (the phone shows its empty state from totalMinutes 0); all time has no months.
  const empty = await get(t, a.token, `?range=30d&today=${today}`);
  assert.equal(empty.days.length, 30);
  assert.ok(empty.days.every((d) => d.minutes === 0));
  assert.equal(empty.totalMinutes, 0);
  assert.deepEqual((await get(t, a.token, `?range=all&today=${today}`)).days, []);

  assert.equal((await listen(t, a.token, yesterday, 45 * M)).status, 200);
  const d = await get(t, a.token, `?range=30d&today=${today}`);
  assert.equal(d.range, '30d');
  assert.equal(d.days.length, 30);
  assert.deepEqual(d.days[29], { day: today, minutes: 0 });
  assert.deepEqual(d.days[28], { day: yesterday, minutes: 45 });
  assert.equal(d.totalMinutes, 45);
  assert.deepEqual(d.topShows, [{ feedUrl: ep.feedUrl, title: 'Show L', minutes: 45 }]);
  assert.deepEqual(d.earned, {});

  // Two hours 40 days ago: outside the 30 days, inside all time; it earns "First hour" on that day.
  const old = dayOf(now - 40 * DAY);
  await listen(t, a.token, old, 120 * M);
  const again = await get(t, a.token, `?range=30d&today=${today}`);
  assert.equal(again.totalMinutes, 45);
  assert.deepEqual(again.earned, { 'hour-1': old });
  const all = await get(t, a.token, `?range=all&today=${today}`);
  assert.equal(all.days[0]!.day, old.slice(0, 7));
  assert.equal(all.days[all.days.length - 1]!.day, today.slice(0, 7));
  assert.equal(all.totalMinutes, 165);
  assert.equal(all.days.reduce((s, p) => s + p.minutes, 0), 165);
  // The default range is 30 days; anything else is refused; signed out is 401.
  assert.equal((await get(t, a.token, '')).days.length, 30);
  assert.equal((await t.call('GET', '/v1/me/listening?range=7d', undefined, a.token)).status, 422);
  assert.equal((await t.call('GET', '/v1/me/listening')).status, 401);
  await t.close();
});

test('US9: the phone\'s date is used only when it is within a day of the server\'s', () => {
  const now = Date.parse('2026-10-06T12:00:00Z');
  assert.equal(todayFor(undefined, now), '2026-10-06');
  assert.equal(todayFor('2026-10-07', now), '2026-10-07');
  assert.equal(todayFor('2026-10-05', now), '2026-10-05');
  assert.equal(todayFor('2026-10-09', now), '2026-10-06');
  assert.equal(todayFor('yesterday', now), '2026-10-06');
  assert.equal(todayFor('2026-13-45', now), '2026-10-06');
});

const item = (stickerId: string, extra: Record<string, unknown> = {}) => ({ stickerId, x: 0.25, y: 0.75, scale: 1.25, rot: -1.5, z: 0, ...extra });
const putPlacements = (t: TestDb, token: string | undefined, body: unknown) => t.call('PUT', '/v1/me/stickers/placements', body, token);
const profileOf = async (t: TestDb, id: string, token?: string) =>
  ((await (await t.call('GET', `/v1/listeners/${id}`, undefined, token)).json()) as { profile: { stickers?: unknown[]; stickersHidden?: boolean } }).profile;

test('US9: placements — saved on the server, the same for every viewer; at most 10; bounds; 400 otherwise', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bea');
  const two = [item('hour-1'), item('finish-1', { x: 0.5, y: 0.5, scale: 2.5, rot: 0.5, z: 1 })];
  assert.equal((await putPlacements(t, a.token, { items: two })).status, 204);
  const mine = ((await (await t.call('GET', '/v1/me/stickers/placements', undefined, a.token)).json()) as { items: unknown[] }).items;
  assert.deepEqual(mine, two);
  assert.deepEqual((await profileOf(t, a.id, b.token)).stickers, two);
  assert.deepEqual((await profileOf(t, a.id)).stickers, two);
  assert.deepEqual((await profileOf(t, b.id, a.token)).stickers, []);

  // Refused, and the saved set is untouched.
  const eleven = Array.from({ length: 11 }, (_, i) => item(`hour-${i}`));
  for (const [why, body] of [
    ['11 stickers', { items: eleven }],
    ['unknown sticker', { items: [item('made-up')] }],
    ['the same sticker twice', { items: [item('hour-1'), item('hour-1')] }],
    ['x outside the header', { items: [item('hour-1', { x: 1.5 })] }],
    ['scale too small', { items: [item('hour-1', { scale: 0.4 })] }],
    ['turned past a full circle', { items: [item('hour-1', { rot: 6.2832 })] }],
    ['z over 9', { items: [item('hour-1', { z: 10 })] }],
    ['no items', {}],
    ['a string for x', { items: [item('hour-1', { x: '0.5' })] }],
  ] as const) {
    const r = await putPlacements(t, a.token, body);
    assert.equal(r.status, 400, why);
    assert.equal(((await r.json()) as { error: string }).error, 'validation', why);
  }
  assert.deepEqual((await profileOf(t, a.id, b.token)).stickers, two);
  assert.equal((await putPlacements(t, undefined, { items: [] })).status, 401);

  // A PUT replaces the whole set; an empty one clears it.
  assert.equal((await putPlacements(t, a.token, { items: [item('comment-1')] })).status, 204);
  assert.deepEqual((await profileOf(t, a.id, b.token)).stickers, [item('comment-1')]);
  assert.equal((await putPlacements(t, a.token, { items: [] })).status, 204);
  assert.deepEqual((await profileOf(t, a.id, b.token)).stickers, []);
  await t.close();
});

test('US9 + US10 privacy: hide_decorations empties the stickers for everyone; hide_stickers marks the library hidden to others', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bea');
  await putPlacements(t, a.token, { items: [item('hour-1'), item('finish-1', { z: 1 })] });
  assert.equal((await profileOf(t, a.id, b.token)).stickersHidden, undefined);
  await t.q('UPDATE listeners SET hide_decorations = true WHERE id = $1', [a.id]);
  assert.deepEqual((await profileOf(t, a.id, b.token)).stickers, []);
  assert.deepEqual((await profileOf(t, a.id, a.token)).stickers, []);
  // The owner's canvas still has them, to turn decorations back on without losing the layout.
  assert.equal(((await (await t.call('GET', '/v1/me/stickers/placements', undefined, a.token)).json()) as { items: unknown[] }).items.length, 2);
  await t.q('UPDATE listeners SET hide_decorations = false, hide_stickers = true WHERE id = $1', [a.id]);
  assert.equal((await profileOf(t, a.id, b.token)).stickers!.length, 2);
  assert.equal((await profileOf(t, a.id, b.token)).stickersHidden, true);
  assert.equal((await profileOf(t, a.id)).stickersHidden, true);
  assert.equal((await profileOf(t, a.id, a.token)).stickersHidden, undefined);
  await t.close();
});

const pngSize = (b: Uint8Array) => { const v = new DataView(b.buffer, b.byteOffset, b.byteLength); return [v.getUint32(16), v.getUint32(20)]; };

test('US9 scenario 3: GET /v1/share/recap/:month.png is the 1080×1350 recap card; public for a day', async () => {
  const t = await freshDb({ imageFetch: (async () => new Response('no', { status: 404 })) as typeof fetch });
  const r = await t.call('GET', `/v1/share/recap/2026-09.png?m=725&s=${encodeURIComponent('Show A')}&s=B&s=C`);
  assert.equal(r.status, 200, await r.clone().text().then((s) => s.slice(0, 200)));
  assert.equal(r.headers.get('cache-control'), 'public, max-age=86400');
  const png = new Uint8Array(await r.arrayBuffer());
  assert.equal(imageKind(png), 'image/png');
  assert.deepEqual(pngSize(png), [1080, 1350]);
  assert.equal((await t.call('GET', '/v1/share/recap/2026-09.png?m=0')).status, 200);
  assert.equal((await t.call('GET', '/v1/share/recap/2026-13.png?m=5')).status, 404);
  assert.equal((await t.call('GET', '/v1/share/recap/september.png?m=5')).status, 404);
  assert.equal((await t.call('GET', '/v1/share/recap/2026-09.png')).status, 422);
  assert.equal((await t.call('GET', '/v1/share/recap/2026-09.png?m=-1')).status, 422);
  assert.equal((await t.call('GET', '/v1/share/recap/2026-09.png?m=44641')).status, 422);
  assert.equal((await t.call('GET', '/v1/share/recap/2026-09.png?m=5&s=a&s=b&s=c&s=d')).status, 422);
  assert.equal((await t.call('GET', `/v1/share/recap/2026-09.png?m=5&s=${'a'.repeat(121)}`)).status, 422);
  await t.close();
});

test('US9 scenario 3: the recap card carries the month, the hours, the top 3 shows and the app link', () => {
  const tree = JSON.stringify(recapTree({ month: '2026-09', minutes: 725, shows: ['Show A', 'Show B', 'Show C', 'Show D'], link: 'socialmorning-api.vercel.app' }));
  for (const want of ['September 2026', '12 h 5 min', 'Show A', 'Show B', 'Show C', 'socialmorning-api.vercel.app']) assert.ok(tree.includes(want), want);
  assert.ok(!tree.includes('Show D'), 'three shows at most');
  assert.ok(JSON.stringify(recapTree({ month: '2026-09', minutes: 5, shows: [], link: 'x' })).includes('Every minute counted.'));
  assert.equal(monthTitle('2026-01'), 'January 2026');
  assert.equal(monthTitle('2026-13'), '2026-13');
  assert.equal(monthTitle('nope'), 'nope');
  assert.equal(hoursMinutes(45), '45 min');
  assert.equal(hoursMinutes(60), '1 h 0 min');
});
