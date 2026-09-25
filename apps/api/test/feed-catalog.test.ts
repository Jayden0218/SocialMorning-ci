import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';
import { episodeIdOf, fetchFeed, registerCard, toCard } from '../src/catalog/feed.ts';
import { genreIdFor } from '../src/catalog/genres.ts';
import { fakeFeedFetch, FIXTURE_FEED } from './fake-apple.ts';
import { fnv1a64 } from '@socialmorning/social-core';

test('fetchFeed parses and caches; a broken item is a warning, not a failure; a show pick resolves to the newest episode', async () => {
  const t = await freshDb();
  let calls = 0; let ua: string | undefined;
  const f = (async (...a: Parameters<typeof fetch>) => { calls++; ua = (a[1]?.headers as Record<string, string> | undefined)?.['user-agent']; return fakeFeedFetch(FIXTURE_FEED)(...a); }) as typeof fetch;
  const { feed, stale } = await fetchFeed(t.db, f, 'https://feeds.example.com/fx.xml');
  assert.equal(stale, false);
  assert.equal(feed.show.title, 'Fixture Show');
  assert.deepEqual(feed.episodes.map((e) => e.guid), ['g-new', 'g-old']);
  assert.ok(feed.warnings.length >= 1);
  await fetchFeed(t.db, f, 'https://feeds.example.com/fx.xml');
  assert.equal(calls, 1); // cached
  assert.match(ua ?? '', /^SocialMorning\//); // feeds.podcastindex.org 403s a fetch without one (seen live)
  const card = toCard('https://feeds.example.com/fx.xml', feed.show, feed.episodes[0]!);
  assert.deepEqual(card, { feedUrl: 'https://feeds.example.com/fx.xml', guid: 'g-new', title: 'Newest', showTitle: 'Fixture Show', enclosureUrl: 'https://cdn/new.mp3', imageUrl: 'https://img/show.png', durationMs: 1_800_000, publishedAt: '2026-09-21T10:00:00.000Z', genreId: 1318 });
  const row = await registerCard(t.db, card);
  assert.equal(row.id, fnv1a64('https://feeds.example.com/fx.xml\u0001g-new'));
  // M8 (T006): both facts used to be parsed and then thrown away here. Freshness needs the
  // publisher's date, and the category channel needs the genre.
  assert.equal(new Date(row.published_at!).toISOString(), '2026-09-21T10:00:00.000Z');
  assert.equal(row.genre_id, 1318);
  assert.equal(episodeIdOf('https://feeds.example.com/fx.xml', 'g-new'), row.id);
  assert.deepEqual(genreIdFor(feed.show.categories), { id: 1318, name: 'Technology' });
  assert.equal(genreIdFor(['Nonsense']), undefined);
  assert.deepEqual(genreIdFor(['Health &amp; Fitness']), { id: 1512, name: 'Health &amp; Fitness' });
  await t.close();
});

test('a feed that answers 500 with no cached copy rejects; with a copy it serves the copy stale', async () => {
  const t = await freshDb();
  await assert.rejects(fetchFeed(t.db, fakeFeedFetch('', 500), 'https://feeds.example.com/down.xml'), /500/);
  await fetchFeed(t.db, fakeFeedFetch(FIXTURE_FEED), 'https://feeds.example.com/ok.xml');
  await t.q(`UPDATE cache SET fetched_at = now() - interval '2 hours'`);
  const r = await fetchFeed(t.db, fakeFeedFetch('', 500), 'https://feeds.example.com/ok.xml');
  assert.equal(r.stale, true);
  assert.equal(r.feed.show.title, 'Fixture Show');
  await t.close();
});
