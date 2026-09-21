import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseFeed } from '../src/parse-feed';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8');

const FEED_URL = 'https://example.com/show/feed.xml';

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 32);
const sha1 = (s: string): string => createHash('sha1').update(s).digest('hex').slice(0, 32);

/**
 * The injected hash is the ONE change made to the handoff parser so that it
 * runs on the phone (research R6). These two tests are what stops that change
 * from being a lie: a parser that accepted `opts.hash` and then quietly used
 * something else would pass every other test in this package, because none of
 * them names a digest — they only check that hashes are stable and that they
 * move with content.
 */
test('the injected hash is the one actually used', () => {
  const withSha256 = parseFeed(fixture('messy.xml'), FEED_URL, { hash: sha256 });
  const withSha1 = parseFeed(fixture('messy.xml'), FEED_URL, { hash: sha1 });

  assert.notEqual(
    withSha256.show.contentHash,
    withSha1.show.contentHash,
    'a different hash function must produce a different channel contentHash',
  );
  assert.equal(withSha256.episodes.length, withSha1.episodes.length, 'same feed, same episodes');
  for (const [i, episode] of withSha256.episodes.entries()) {
    assert.notEqual(
      episode.contentHash,
      withSha1.episodes[i]?.contentHash,
      `episode ${i} (${episode.title}) must hash differently under a different function`,
    );
  }
});

test('the same hash function twice is deterministic', () => {
  const a = parseFeed(fixture('messy.xml'), FEED_URL, { hash: sha1 });
  const b = parseFeed(fixture('messy.xml'), FEED_URL, { hash: sha1 });
  assert.equal(a.show.contentHash, b.show.contentHash);
  assert.deepEqual(
    a.episodes.map((e) => e.contentHash),
    b.episodes.map((e) => e.contentHash),
  );
});

test('a feed that is not RSS still hashes through the injected function', () => {
  // The not-rss early return builds its own contentHash. It is the one call
  // site that could keep a hard-coded digest without any other test noticing.
  const a = parseFeed('<html><body>404</body></html>', FEED_URL, { hash: sha256 });
  const b = parseFeed('<html><body>404</body></html>', FEED_URL, { hash: sha1 });
  assert.equal(a.warnings[0]?.code, 'not-rss');
  assert.notEqual(a.show.contentHash, b.show.contentHash);
});
