// Tests that an episode its creator hid leaves Discover, daily picks, search and next-up at once.
/** M24 US11 (specs/025-m24-gaps-and-look): a `hidden_episodes` row takes ONE episode out of every listener list; its show stays. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { createApp } from '../src/app.ts';
import { fakeApple, fakeFeedFetch, FIXTURE_FEED } from './fake-apple.ts';
import { dbOf, migratedPg, TEST_PEPPER } from './harness.ts';
import { putEpisode } from './put-episode.ts';

const FX = 'https://feeds.example.com/fx.xml';
const REPLY_ALL = 'https://feeds.megaphone.fm/replyall';
const CASEY = 'c0633378-b188-11ef-bcb2-677967fca1e9';
const E = (guid: string) => fnv1a64(`${FX}\u0001${guid}`);

async function build() {
  const { pg } = await migratedPg();
  const db = dbOf(pg);
  const apple = fakeApple();
  const catalogFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('itunes.apple.com')) return apple.fetch(input, init);
    if (url.includes('feeds.example.com/fx.xml')) return fakeFeedFetch(FIXTURE_FEED)(input, init);
    return new Response('nope', { status: 404 });
  }) as typeof fetch;
  const picksRaw = [{ date: '2026-09-22', feedUrl: FX, guid: 'g-new', why: 'because' }];
  const orig = console.warn; console.warn = () => {};
  const app = createApp({ db, pepper: TEST_PEPPER, catalogFetch, picksRaw, today: () => '2026-09-22' });
  console.warn = orig;
  const q = async <T,>(s: string, p?: unknown[]) => (await pg.query<T>(s, p)).rows;
  return { pg, db, app, q };
}

test('M24 US11: a hidden episode leaves Discover picks, daily picks and episode search at once; the row removed brings it back', async () => {
  const t = await build();
  const orig = console.warn; console.warn = () => {};
  type Disc = { picks: { episode: { feedUrl: string; guid: string } }[] };
  const disc = async () => (await (await t.app.request('/v1/discover')).json()) as Disc;
  type Daily = { items: { feedUrl: string; guid?: string }[] };
  const daily = async () => (await (await t.app.request('/v1/discover/daily')).json()) as Daily;
  type Search = { shows: { feedUrl: string }[]; episodes: { feedUrl: string; guid: string }[] };
  const search = async () => (await (await t.app.request('/v1/search?q=Casey%20Wants%20to%20Believe', { headers: { 'x-forwarded-for': '9.9.9.1' } })).json()) as Search;

  // Control: nothing hidden → the pick, the daily pick and the search hit are all there.
  const d0 = await disc();
  assert.ok(d0.picks.some((p) => p.episode.feedUrl === FX && p.episode.guid === 'g-new'), 'the pick is on Discover before the hide');
  const y0 = await daily();
  assert.ok(y0.items.some((i) => i.feedUrl === FX && i.guid === 'g-new'), 'the pick is in daily picks before the hide');
  const s0 = await search();
  assert.ok(s0.episodes.some((e) => e.feedUrl === REPLY_ALL && e.guid === CASEY), 'the episode is found before the hide');

  // Hide both episodes directly (the Studio route is tested with the Studio).
  await t.q('INSERT INTO hidden_episodes (feed_url, guid) VALUES ($1,$2)', [FX, 'g-new']);
  await t.q('INSERT INTO hidden_episodes (feed_url, guid) VALUES ($1,$2)', [REPLY_ALL, CASEY]);

  const d1 = await disc();
  assert.ok(d1.picks.every((p) => !(p.episode.feedUrl === FX && p.episode.guid === 'g-new')), 'the hidden pick is gone from the cached Discover body');
  const y1 = await daily();
  assert.ok(y1.items.every((i) => !(i.feedUrl === FX && i.guid === 'g-new')), 'the hidden pick is gone from daily picks');
  const s1 = await search();
  assert.ok(s1.episodes.every((e) => !(e.feedUrl === REPLY_ALL && e.guid === CASEY)), 'the hidden episode is not found');
  assert.ok(s1.shows.some((s) => s.feedUrl === REPLY_ALL), 'its show is still found: only the episode is hidden');

  // Un-hide: back at once.
  await t.q('DELETE FROM hidden_episodes WHERE feed_url = $1 AND guid = $2', [FX, 'g-new']);
  const d2 = await disc();
  assert.ok(d2.picks.some((p) => p.episode.feedUrl === FX && p.episode.guid === 'g-new'), 'the pick is back after the row is removed');
  console.warn = orig;
  await t.pg.close();
});

test('M24 US11: a hidden episode leaves next-up (from the cached sources too)', async () => {
  const t = await build();
  const orig = console.warn; console.warn = () => {};
  await putEpisode(t, E('g-old'), { feedUrl: FX, guid: 'g-old', title: 'Older', showTitle: 'Fixture Show', enclosureUrl: 'https://cdn/g-old.mp3', durationMs: 1_800_000 });
  type NextUp = { items: { episode: { id: string; feedUrl: string; guid: string } }[] };
  const nextUp = async () => {
    const r = await t.app.request(`/v1/episodes/${E('g-old')}/next-up`);
    assert.equal(r.status, 200);
    return (await r.json()) as NextUp;
  };

  // Control: g-new is "new on this show" for g-old.
  const n0 = await nextUp();
  assert.ok(n0.items.some((i) => i.episode.feedUrl === FX && i.episode.guid === 'g-new'), 'g-new is suggested before the hide');

  await t.q('INSERT INTO hidden_episodes (feed_url, guid) VALUES ($1,$2)', [FX, 'g-new']);
  const n1 = await nextUp();
  assert.ok(n1.items.every((i) => !(i.episode.feedUrl === FX && i.episode.guid === 'g-new')), 'g-new is gone from next-up although the sources are cached');
  console.warn = orig;
  await t.pg.close();
});
