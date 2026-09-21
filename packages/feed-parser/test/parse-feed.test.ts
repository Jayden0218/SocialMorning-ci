import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseFeed } from '../src/parse-feed';
import type { FeedWarning } from '../src/types';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8');

const FEED_URL = 'https://example.com/show/feed.xml';

// research R6: the parser no longer imports node:crypto so that it runs on the
// phone. Node's tests inject exactly the digest the handoff used, so every
// contentHash assertion below still pins the same 32-character value.
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 32);
const codes = (warnings: FeedWarning[]): string[] => warnings.map((w) => w.code);

test('a malformed duration never costs the episode', () => {
  const { episodes, warnings } = parseFeed(fixture('messy.xml'), FEED_URL, { hash: sha256 });
  const prose = episodes.find((e) => e.guid === 'ep-prose');
  assert.ok(prose, 'the episode is still present');
  assert.equal(prose.durationMs, undefined, 'with no duration');
  assert.equal(prose.publishedAt, undefined, 'and no date');
  assert.ok(codes(warnings).includes('unparsable-duration'));
  assert.ok(codes(warnings).includes('unparsable-date'));
});

test('an item with no enclosure is not an episode', () => {
  const { episodes, warnings } = parseFeed(fixture('messy.xml'), FEED_URL, { hash: sha256 });
  assert.equal(episodes.find((e) => e.guid === 'ep-no-media'), undefined);
  const warning = warnings.find((w) => w.code === 'item-without-enclosure');
  assert.equal(warning?.itemTitle, 'Announcement with no media');
});

test('a re-posted item does not duplicate the episode', () => {
  const { episodes, warnings } = parseFeed(fixture('messy.xml'), FEED_URL, { hash: sha256 });
  assert.equal(episodes.filter((e) => e.guid === 'ep-colon').length, 1);
  // First wins: the feed is newest-first, so the earlier entry is the live one.
  assert.equal(episodes.find((e) => e.guid === 'ep-colon')?.title, 'Colon form');
  assert.ok(codes(warnings).includes('duplicate-guid'));
});

test('relative enclosure urls resolve against the feed url', () => {
  const { episodes } = parseFeed(fixture('messy.xml'), FEED_URL, { hash: sha256 });
  assert.equal(
    episodes.find((e) => e.guid === 'ep-protorel')?.enclosureUrl,
    'https://cdn.example.com/5.mp3',
    'protocol-relative takes the feed scheme',
  );
  assert.equal(
    episodes.find((e) => e.guid === 'ep-pathrel')?.enclosureUrl,
    'https://example.com/show/media/6.mp3',
    'path-relative resolves against the feed path',
  );
});

test('an item with no guid falls back to its enclosure, and says so', () => {
  const { episodes } = parseFeed(fixture('messy.xml'), FEED_URL, { hash: sha256 });
  const derived = episodes.find((e) => e.title === 'No guid');
  assert.equal(derived?.guid, 'https://cdn.example.com/7.mp3');
  // Without `guidSource`, a feed that later starts emitting <guid> would
  // re-import its whole backlog as new episodes with nothing to detect it.
  assert.equal(derived?.guidSource, 'enclosure');
});

test('A NUMERIC GUID STAYS A STRING', () => {
  // With XML value coercion on, `0123` parses as the number 123 — a
  // different identity from the one the feed published, so the episode
  // re-imports as new on every single poll.
  const { episodes } = parseFeed(fixture('messy.xml'), FEED_URL, { hash: sha256 });
  const numeric = episodes.find((e) => e.title === 'Numeric guid');
  assert.equal(numeric?.guid, '0123');
  assert.equal(typeof numeric?.guid, 'string');
});

test('prefers content:encoded over the truncated description', () => {
  const { episodes } = parseFeed(fixture('messy.xml'), FEED_URL, { hash: sha256 });
  assert.equal(
    episodes.find((e) => e.guid === 'ep-colon')?.shownotesHtml,
    '<p>The <b>full</b> shownotes.</p>',
  );
});

test('a zero enclosure length is absent, not zero bytes', () => {
  const { episodes } = parseFeed(fixture('messy.xml'), FEED_URL, { hash: sha256 });
  assert.equal(episodes.find((e) => e.guid === 'ep-seconds')?.enclosureBytes, undefined);
  assert.equal(episodes.find((e) => e.guid === 'ep-colon')?.enclosureBytes, 12345);
});

test('reads a single repeatable tag as well as many', () => {
  // One `<podcast:transcript>` parses as an object, two as an array. A
  // parser that assumes the array shape reads [0] of an object and gets
  // nothing, on exactly the feeds that have one transcript.
  const { episodes } = parseFeed(fixture('messy.xml'), FEED_URL, { hash: sha256 });
  const numeric = episodes.find((e) => e.title === 'Numeric guid');
  assert.deepEqual(numeric?.transcripts, [
    { url: 'https://cdn.example.com/9.vtt', type: 'text/vtt', language: 'en' },
  ]);
  assert.deepEqual(numeric?.soundbites, [
    { startMs: 73_000, durationMs: 30_000, title: 'The good bit' },
  ]);
  assert.equal(numeric?.chaptersUrl, 'https://cdn.example.com/9.json');
  assert.equal(numeric?.season, 2);
  assert.equal(numeric?.episodeNumber, 14);
});

test('reads the channel, including nested categories', () => {
  const { show } = parseFeed(fixture('messy.xml'), FEED_URL, { hash: sha256 });
  assert.equal(show.title, 'Messy Feed');
  assert.equal(show.author, 'A Publisher');
  assert.equal(show.explicit, true);
  assert.equal(show.imageUrl, 'https://cdn.example.com/art.jpg');
  assert.deepEqual(show.categories, ['Technology', 'Software How-To']);
  assert.equal(show.feedUrl, FEED_URL);
});

test('garbage in is warnings out, never an exception', () => {
  for (const input of ['', 'not xml at all', '<html><body>404</body></html>', '<rss></rss>']) {
    const result = parseFeed(input, FEED_URL, { hash: sha256 });
    assert.equal(result.episodes.length, 0);
    assert.ok(result.warnings.length > 0, `should warn for ${JSON.stringify(input.slice(0, 20))}`);
  }
});

test('the real Podcasting 2.0 example feed parses', () => {
  // Fetched from Podcastindex-org/podcast-namespace. Not written by us, and
  // the only NON-synthetic feed in this suite — see README for what that
  // does and does not establish.
  const { show, episodes, warnings } = parseFeed(fixture('real-podcasting20.xml'), FEED_URL, { hash: sha256 });
  assert.equal(show.title, 'Podcasting 2.0 Namespace Example');
  assert.ok(show.guid, 'carries a podcast:guid');
  assert.ok(episodes.length > 0, 'has episodes');
  assert.equal(
    warnings.filter((w) => w.code === 'not-rss').length,
    0,
    'is recognised as RSS',
  );
  for (const episode of episodes) {
    assert.ok(episode.guid, 'every episode has an identity');
    assert.ok(episode.enclosureUrl.startsWith('http'), 'and a playable url');
    assert.equal(episode.contentHash.length, 32);
  }
});

test('the content hash is stable across parses and moves with content', () => {
  const a = parseFeed(fixture('messy.xml'), FEED_URL, { hash: sha256 });
  const b = parseFeed(fixture('messy.xml'), FEED_URL, { hash: sha256 });
  assert.equal(a.show.contentHash, b.show.contentHash, 'same input, same hash');
  assert.deepEqual(
    a.episodes.map((e) => e.contentHash),
    b.episodes.map((e) => e.contentHash),
  );
  const changed = parseFeed(
    fixture('messy.xml').replace('<title>Messy Feed</title>', '<title>Renamed</title>'),
    FEED_URL,
    { hash: sha256 },
  );
  assert.notEqual(a.show.contentHash, changed.show.contentHash, 'changed input, changed hash');
});
