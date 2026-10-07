// Tests that refreshing a show's RSS feed updates the cache and never loses it.
/**
 * Refreshing a show. `fetch` is mocked; the parser and the memory cache are
 * real, so this exercises the whole conditional-GET -> parse -> cache path.
 *
 * The rule under test throughout is Principle IV: a feed never throws away
 * what already parsed, and a failed refresh never throws away the cache.
 */
import { FeedError, refreshShow } from '@/feeds/fetch';
import { hash } from '@/feeds/hash';
import { createMemoryFeedCache } from '@/storage/memory';

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

  // M23: fetch gets the deadline's own signal, which the caller's signal still aborts.
  it('passes an abort signal through', async () => {
    const cache = createMemoryFeedCache(hash);
    const controller = new AbortController();
    let sentAbortedAfterCallerAbort: boolean | undefined;
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      controller.abort();
      sentAbortedAfterCallerAbort = init?.signal?.aborted;
      return response(200, feedXml('A Show', TWO_ITEMS));
    });
    await refreshShow(FEED, cache, 1_000, controller.signal);
    expect(sentAbortedAfterCallerAbort).toBe(true);
  });

  // M23 US5 (spec scenario 1): a feed that never answers is given up after 8 s, keeping the cache.
  it('gives up after 8 seconds and serves the cache', async () => {
    jest.useFakeTimers();
    try {
      const cache = createMemoryFeedCache(hash);
      jest.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(response(200, feedXml('A Show', TWO_ITEMS)))
        .mockImplementationOnce(() => new Promise<Response>(() => undefined));
      await refreshShow(FEED, cache, 1_000);
      const pending = refreshShow(FEED, cache, 2_000);
      await jest.advanceTimersByTimeAsync(7_999);
      let settled = false;
      void pending.then(() => { settled = true; });
      await Promise.resolve();
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      const result = await pending;
      expect(result.stale).toBe(true);
      expect(result.show.title).toBe('A Show');
    } finally {
      jest.useRealTimers();
    }
  });

  // M23 US5 (spec scenario 2): over 5 MB is refused on the phone too.
  it('refuses a feed over 5 MB, by its header or by its size', async () => {
    const cache = createMemoryFeedCache(hash);
    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(200, feedXml('A Show', TWO_ITEMS), { 'content-length': String(6 * 1024 * 1024) }))
      .mockResolvedValueOnce(response(200, feedXml('A Show', TWO_ITEMS) + ' '.repeat(5 * 1024 * 1024)));
    await expect(refreshShow(FEED, cache, 1_000)).rejects.toBeInstanceOf(FeedError);
    await expect(refreshShow(FEED, cache, 1_000)).rejects.toBeInstanceOf(FeedError);
    expect(cache.getShow(FEED)).toBeUndefined();
  });

  // M23 US5 (spec scenario 3): bytes are decoded in the feed's charset. Latin-1 is decoded by
  // hand when the runtime's TextDecoder is UTF-8 only (Expo native), so this holds on a phone.
  it('reads a Latin-1 feed from its bytes', async () => {
    const cache = createMemoryFeedCache(hash);
    const xml = feedXml('Café', TWO_ITEMS).replace('<?xml version="1.0"?>', '<?xml version="1.0" encoding="ISO-8859-1"?>');
    const bytes = Uint8Array.from(xml, (ch) => ch.charCodeAt(0));
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ...response(200, ''),
      arrayBuffer: async () => bytes.buffer,
    } as unknown as Response);
    const result = await refreshShow(FEED, cache, 1_000);
    expect(result.show.title).toBe('Café');
  });
});
