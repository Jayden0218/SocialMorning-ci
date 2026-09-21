/**
 * Refreshing a show. `fetch` is mocked; the parser and the memory cache are
 * real, so this exercises the whole conditional-GET -> parse -> cache path.
 *
 * The rule under test throughout is Principle IV: a feed never throws away
 * what already parsed, and a failed refresh never throws away the cache.
 */
import { FeedError, refreshShow } from '../src/feeds/fetch';
import { hash } from '../src/feeds/hash';
import { createMemoryFeedCache } from '../src/storage/memory';

const FEED = 'https://example.com/show/feed.xml';

const feedXml = (title: string, items: string): string => `<?xml version="1.0"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>${title}</title>
    <itunes:author>A Publisher</itunes:author>
    ${items}
  </channel>
</rss>`;

const item = (guid: string, date: string): string => `
    <item>
      <title>${guid}</title>
      <guid>${guid}</guid>
      <enclosure url="https://cdn.example.com/${guid}.mp3" type="audio/mpeg"/>
      <pubDate>${date}</pubDate>
    </item>`;

const TWO_ITEMS = item('ep-1', 'Tue, 10 Sep 2024 09:00:00 GMT') +
  item('ep-2', 'Wed, 11 Sep 2024 09:00:00 GMT');

const response = (
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  }) as unknown as Response;

describe('refreshShow', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parses a 200 and fills the cache, keeping the etag for next time', async () => {
    const cache = createMemoryFeedCache(hash);
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        response(200, feedXml('A Show', TWO_ITEMS), { etag: 'W/"v1"', 'last-modified': 'Wed, 11 Sep 2024 09:00:00 GMT' }),
      );

    const result = await refreshShow(FEED, cache, 1_000);

    expect(result.stale).toBe(false);
    expect(result.show.title).toBe('A Show');
    expect(result.episodes.map((e) => e.guid)).toEqual(['ep-2', 'ep-1']);
    expect(cache.getShow(FEED)?.etag).toBe('W/"v1"');
    expect(cache.getShow(FEED)?.lastModified).toBe('Wed, 11 Sep 2024 09:00:00 GMT');
  });

  it('sends If-None-Match and If-Modified-Since once it has them', async () => {
    const cache = createMemoryFeedCache(hash);
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(200, feedXml('A Show', TWO_ITEMS), { etag: 'W/"v1"', 'last-modified': 'Wed, 11 Sep 2024 09:00:00 GMT' }))
      .mockResolvedValueOnce(response(304, ''));

    await refreshShow(FEED, cache, 1_000);
    await refreshShow(FEED, cache, 2_000);

    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: {
        'If-None-Match': 'W/"v1"',
        'If-Modified-Since': 'Wed, 11 Sep 2024 09:00:00 GMT',
      },
    });
  });

  it('a 304 keeps the cached copy and does not mark it stale', async () => {
    const cache = createMemoryFeedCache(hash);
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(200, feedXml('A Show', TWO_ITEMS), { etag: 'W/"v1"' }))
      .mockResolvedValueOnce(response(304, ''));

    await refreshShow(FEED, cache, 1_000);
    const again = await refreshShow(FEED, cache, 2_000);

    expect(again.stale).toBe(false);
    expect(again.episodes).toHaveLength(2);
    // Untouched: a 304 must write nothing, including the fetchedAt stamp.
    expect(cache.getShow(FEED)?.fetchedAt).toBe(1_000);
  });

  it('a 200 replaces the episode list rather than appending to it', async () => {
    const cache = createMemoryFeedCache(hash);
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(200, feedXml('A Show', TWO_ITEMS)))
      .mockResolvedValueOnce(
        response(200, feedXml('A Show', item('ep-3', 'Thu, 12 Sep 2024 09:00:00 GMT'))),
      );

    await refreshShow(FEED, cache, 1_000);
    const second = await refreshShow(FEED, cache, 2_000);
    expect(second.episodes.map((e) => e.guid)).toEqual(['ep-3']);
  });

  // Principle IV, and the case a listener actually hits: on a train.
  it('a network failure with a cached show returns the cache marked stale', async () => {
    const cache = createMemoryFeedCache(hash);
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(200, feedXml('A Show', TWO_ITEMS)))
      .mockRejectedValueOnce(new Error('Network request failed'));

    await refreshShow(FEED, cache, 1_000);
    const offline = await refreshShow(FEED, cache, 2_000);

    expect(offline.stale).toBe(true);
    expect(offline.episodes).toHaveLength(2);
    expect(offline.show.title).toBe('A Show');
  });

  it('an HTTP error with a cached show also returns the cache marked stale', async () => {
    const cache = createMemoryFeedCache(hash);
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(200, feedXml('A Show', TWO_ITEMS)))
      .mockResolvedValueOnce(response(503, ''));

    await refreshShow(FEED, cache, 1_000);
    expect((await refreshShow(FEED, cache, 2_000)).stale).toBe(true);
  });

  it('a failure with nothing cached throws a plain, non-technical FeedError', async () => {
    const cache = createMemoryFeedCache(hash);
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    await expect(refreshShow(FEED, cache, 1_000)).rejects.toBeInstanceOf(FeedError);
    await expect(refreshShow(FEED, cache, 1_000)).rejects.toThrow(/Check your connection/);
    await expect(refreshShow(FEED, cache, 1_000)).rejects.not.toThrow(/ENOTFOUND/);
  });

  it('a 404 with nothing cached throws rather than caching an empty show', async () => {
    const cache = createMemoryFeedCache(hash);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(404, ''));
    await expect(refreshShow(FEED, cache, 1_000)).rejects.toBeInstanceOf(FeedError);
    expect(cache.getShow(FEED)).toBeUndefined();
  });

  // Principle IV again, one level down: one broken item must not cost the
  // show, and what did not parse has to be visible rather than swallowed.
  it('one bad item still yields the others, plus a warning', async () => {
    const cache = createMemoryFeedCache(hash);
    const withBadItem =
      TWO_ITEMS +
      `
    <item>
      <title>Announcement with no media</title>
      <guid>ep-no-media</guid>
    </item>`;
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(200, feedXml('A Show', withBadItem)));

    const result = await refreshShow(FEED, cache, 1_000);

    expect(result.episodes.map((e) => e.guid)).toEqual(['ep-2', 'ep-1']);
    expect(result.warnings.map((w) => w.code)).toContain('item-without-enclosure');
    expect(cache.getShow(FEED)?.lastWarnings).toEqual(result.warnings);
  });

  // Identity must not drift. A publisher's 301 to a CDN mirror would
  // otherwise re-key the show and orphan its subscription and its positions.
  it('keys the cache by the requested url, never the redirect target', async () => {
    const cache = createMemoryFeedCache(hash);
    const redirected = {
      ...response(200, feedXml('A Show', TWO_ITEMS)),
      url: 'https://cdn.mirror.example/feed.xml',
    } as unknown as Response;
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(redirected);

    await refreshShow(FEED, cache, 1_000);

    expect(cache.getShow(FEED)).toBeDefined();
    expect(cache.getShow('https://cdn.mirror.example/feed.xml')).toBeUndefined();
  });

  it('passes an abort signal through', async () => {
    const cache = createMemoryFeedCache(hash);
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response(200, feedXml('A Show', TWO_ITEMS)));
    const controller = new AbortController();
    await refreshShow(FEED, cache, 1_000, controller.signal);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
  });
});
