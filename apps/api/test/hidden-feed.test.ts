// Tests that a hidden show leaves Discover, search and next-up at once.
/** quickstart A7 (hide_show, G7): a hidden show leaves Discover, search and next-up at once, and stays in a library (the phone's job). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.ts';
import { fakeApple, fakeFeedFetch, FIXTURE_FEED } from './fake-apple.ts';
import { dbOf, hybridDb, migratedPg, TEST_PEPPER } from './harness.ts';
import { createListener } from '../src/db/repos/account/listeners.ts';
import { act } from '../src/db/repos/safety/moderation.ts';

const FX = 'https://feeds.example.com/fx.xml';
const REPLY_ALL = 'https://feeds.megaphone.fm/replyall';

test('G7: hidden feeds are absent from /v1/discover (picks, trending), /v1/search (shows, episodes) and next-up, without waiting for the cache', async () => {
  const { pg, runner } = await migratedPg();
  const hy = await hybridDb(dbOf(pg)); // M26: on DynamoDB the converted lanes run on DynamoDB Local
  const db = hy.db;
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
  type Disc = { picks: { episode: { feedUrl: string } }[]; trending: { episode: { feedUrl: string } }[] };
  const disc = async () => (await (await app.request('/v1/discover')).json()) as Disc;
  const before = await disc();
  assert.equal(before.picks.length, 1);
  assert.ok(before.trending.some((t) => t.episode.feedUrl === REPLY_ALL) || before.trending.length > 0);
  const search = async () => (await (await app.request('/v1/search?q=Casey%20Wants%20to%20Believe')).json()) as { shows: { feedUrl: string }[]; episodes: { feedUrl: string }[] };
  const s0 = await search();
  assert.ok(s0.shows.some((s) => s.feedUrl === REPLY_ALL));
  assert.ok(s0.episodes.some((e) => e.feedUrl === REPLY_ALL));

  // hide both feeds directly (the page test covers the button)
  const o = await createListener(db, 'o@example.com', 'x', 'Owner');
  if (o === 'exists') throw new Error('owner exists');
  await act(db, o.id, { kind: 'show', id: FX }, 'hide_show');
  await act(db, o.id, { kind: 'show', id: REPLY_ALL }, 'hide_show');
  await hy.drain();

  const after = await disc();
  assert.equal(after.picks.length, 0, 'the pick on a hidden feed is gone (from the cached body)');
  assert.ok(after.trending.every((t) => t.episode.feedUrl !== REPLY_ALL));
  const s1 = await search();
  assert.ok(s1.shows.every((s) => s.feedUrl !== REPLY_ALL));
  assert.ok(s1.episodes.every((e) => e.feedUrl !== REPLY_ALL));
  await hy.close();
  await pg.close();
});
