// Tests that owner Discover settings apply at once, and failures fall back safely.
/**
 * M15 guard G-D1, server half (FR-026–FR-029, SC-007): Discover control is applied at serve time.
 * (The phone half — `buildModel` follows `layout` — is apps/mobile/__tests__/discover-layout.test.ts.)
 *
 * The break that turns it red (watched once, named in the commit): in `src/routes/discover/discover.ts`,
 * serve `pub.trending` and drop `layout` (ignore the settings) — the pin, the hide and
 * `layout.hidden` all fail below.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { aCall, adminSetup, FX } from './admin-harness.ts';
import { putEpisode } from './put-episode.ts';

const TODAY = '2026-09-22';
type Body = { layout?: { order: string[]; hidden: string[] }; trending: { key: string; episode: { title: string; feedUrl: string } }[] };
const JRE_KEY = 'https://feeds.megaphone.fm/GLT1412515089\u0001jre-2400';

test('G-D1 (server): hidden ids in layout.hidden, a pin first in trending, a hide removed; the ETag moves', async () => {
  const { t, owner } = await adminSetup({ picksRaw: [], today: () => TODAY, collectionsRaw: [] });
  const ep = { feedUrl: FX, guid: 'g-pin', title: 'Pinned One', showTitle: 'Fixture Show', enclosureUrl: 'https://cdn/pin.mp3' };
  await putEpisode(t, `${fnv1a64(ep.feedUrl + '\u0001' + ep.guid)}`, { ...ep, durationMs: 1_000_000 });

  const first = await t.call('GET', '/v1/discover');
  const etag = first.headers.get('etag')!;
  const plain = (await first.json()) as Body;
  assert.equal(plain.layout, undefined, 'no saved settings → no layout (today\'s order)');
  assert.ok(plain.trending.some((i) => i.key === JRE_KEY), 'the fake chart gives a trending episode');

  const put = await aCall(t, 'PUT', '/v1/admin/discover', owner, {
    version: 0, order: ['picks', 'forYou', 'not-a-section'], hidden: ['said', 'shows'],
    pins: [{ feedUrl: FX, guid: 'g-pin' }], hides: [{ feedUrl: 'https://feeds.megaphone.fm/GLT1412515089', guid: 'jre-2400' }],
  });
  assert.equal(put.status, 200, await put.clone().text());

  const res = await t.call('GET', '/v1/discover', undefined, undefined, { 'if-none-match': etag });
  assert.equal(res.status, 200, 'the ETag covers the settings, so a change is a 200, not a 304');
  const body = (await res.json()) as Body;
  assert.deepEqual(body.layout, { order: ['picks', 'forYou'], hidden: ['said', 'shows'] }, 'unknown ids are dropped on save');
  assert.equal(body.trending[0]!.episode.title, 'Pinned One', 'the pin is first');
  assert.equal(body.trending.some((i) => i.key === JRE_KEY), false, 'the hidden episode is gone');
  await t.close();
});

test('G-D1 (server): settings that cannot be read → today\'s Discover, no layout, no error (FR-029)', async () => {
  const { t, owner } = await adminSetup({ picksRaw: [], today: () => TODAY, collectionsRaw: [] });
  await aCall(t, 'PUT', '/v1/admin/discover', owner, { version: 0, order: ['picks'], hidden: ['said'], pins: [], hides: [] });
  await t.q('ALTER TABLE discover_settings RENAME TO discover_settings_gone');
  // M21: close the database whatever happens — a failed assertion left it open, and the file then
  // never exited (gate 37438890166 hung 24 min with no test named).
  try {
    const res = await t.call('GET', '/v1/discover');
    assert.equal(res.status, 200, await res.clone().text());
    const body = (await res.json()) as Body;
    assert.equal(body.layout, undefined);
    assert.ok(body.trending.length > 0, `trending: ${JSON.stringify(body.trending)}`);
  } finally {
    // Put the table back before closing: with it renamed, PGlite's close() never settled since M21
    // (debug runs on the CI branch debug-hang: renamed → hang; renamed back → 3 of 3 closed).
    await t.q('ALTER TABLE discover_settings_gone RENAME TO discover_settings');
    await t.close();
  }
});

test('category features: up to 5 shows first, in the owner\'s order, even one not on the chart', async () => {
  const { t, owner } = await adminSetup({ picksRaw: [], today: () => TODAY, collectionsRaw: [] });
  await t.q(`INSERT INTO cache (key, body, fetched_at) VALUES ($1, ($2::text)::jsonb, now())`,
    [`feed:${FX}`, JSON.stringify({ show: { title: 'Fixture Show', author: 'Fx' }, episodes: [], warnings: [] })]);
  const put = await aCall(t, 'PUT', '/v1/admin/categories/1303/features', owner, { shows: [{ feedUrl: FX }] });
  assert.equal(put.status, 200);
  const cat = (await (await t.call('GET', '/v1/categories/1303')).json()) as { shows: { feedUrl: string; title: string }[] };
  assert.equal(cat.shows[0]!.feedUrl, FX);
  assert.equal(cat.shows[0]!.title, 'Fixture Show');
  assert.ok(cat.shows.length >= 2, 'the chart follows');
  assert.equal((await aCall(t, 'PUT', '/v1/admin/categories/1303/features', owner, { shows: Array.from({ length: 6 }, (_, i) => ({ feedUrl: `https://f/${i}` })) })).status, 422);
  assert.equal((await aCall(t, 'PUT', '/v1/admin/categories/99999/features', owner, { shows: [] })).status, 404);
  await t.close();
});

test('fix F-S: the DEFAULT section order puts the Editor\'s picks first, then For you; a saved layout keeps its own order', async () => {
  const { t, owner } = await adminSetup({ picksRaw: [], today: () => TODAY, collectionsRaw: [] });
  type S = { sections: string[]; order: string[]; version: number };
  const fresh = (await (await aCall(t, 'GET', '/v1/admin/discover', owner)).json()) as S;
  assert.deepEqual(fresh.sections.slice(0, 2), ['picks', 'forYou']);
  assert.deepEqual(fresh.order, [], 'nothing saved');
  assert.equal((await aCall(t, 'PUT', '/v1/admin/discover', owner, { version: 0, order: ['forYou', 'picks'], hidden: [], pins: [], hides: [] })).status, 200);
  const saved = (await (await aCall(t, 'GET', '/v1/admin/discover', owner)).json()) as S;
  assert.deepEqual(saved.order, ['forYou', 'picks'], 'the owner\'s saved order is kept as saved');
  const body = (await (await t.call('GET', '/v1/discover')).json()) as Body;
  assert.deepEqual(body.layout?.order, ['forYou', 'picks']);
  await t.close();
});
