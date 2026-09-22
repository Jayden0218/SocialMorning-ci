import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CatalogRateLimited, CatalogUnavailable, latestEpisodes, searchEpisodes, searchShows, topShows } from '../src/catalog/apple.ts';
import { fakeApple } from './fake-apple.ts';

test('episode search maps Apple\'s shape to an EpisodeCard and drops entries without a guid/feed/enclosure', async () => {
  const { fetch, calls } = fakeApple();
  const eps = await searchEpisodes(fetch, ' Casey Wants to Believe ');
  assert.equal(eps.length, 1);
  assert.deepEqual(eps[0], {
    feedUrl: 'https://feeds.megaphone.fm/replyall', guid: 'c0633378-b188-11ef-bcb2-677967fca1e9', title: 'Casey Wants to Believe', showTitle: 'Reply All',
    enclosureUrl: 'https://chrt.fm/track/15E3G4/traffic.megaphone.fm/GLT5843461507.mp3?updated=1733238939', imageUrl: 'https://img/replyall600.jpg', durationMs: 2057000,
    publishedAt: '2024-12-05T08:00:00Z', appleShowId: 941907967,
  });
  assert.match(calls[0]!, /entity=podcastEpisode&term=Casey%20Wants%20to%20Believe&limit=20/);
  assert.deepEqual(await searchEpisodes(fetch, '   '), []);
});

test('show search drops shows without a feed; the chart resolves ids to shows with feeds; latest episodes filters non-episodes', async () => {
  const { fetch, calls } = fakeApple();
  const shows = await searchShows(fetch, 'reply all');
  assert.deepEqual(shows.map((s) => s.title), ['Reply All']);
  assert.equal(shows[0]!.appleId, 941907967);
  const top = await topShows(fetch, 1303, 10);
  assert.deepEqual(top.map((s) => s.title), ['The Joe Rogan Experience', 'Reply All']);
  assert.match(calls.find((c) => c.includes('toppodcasts'))!, /limit=10\/genre=1303\/json/);
  const all = await topShows(fetch, undefined, 5);
  assert.match(calls.find((c) => c.includes('limit=5/json'))!, /toppodcasts\/limit=5\/json$/);
  assert.equal(all.length, 2);
  const latest = await latestEpisodes(fetch, 360084272, 1);
  assert.deepEqual(latest.map((e) => e.title), ['#2400 - Someone']);
});

test('429/403 → CatalogRateLimited; 503 → CatalogUnavailable', async () => {
  await assert.rejects(searchShows(fakeApple({ all: '429' }).fetch, 'x'), CatalogRateLimited);
  await assert.rejects(searchEpisodes(fakeApple({ episodes: 'fail' }).fetch, 'x'), CatalogUnavailable);
});
