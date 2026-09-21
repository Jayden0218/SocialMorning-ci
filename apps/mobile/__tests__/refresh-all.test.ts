/**
 * Refreshing the whole library.
 *
 * The rule under test is the one a real subscription list breaks: ONE
 * publisher letting their feed rot must not cost you the other ninety-nine.
 */
import { hash } from '../src/feeds/hash';
import { refreshAll } from '../src/feeds/refresh-all';
import { createMemoryStores } from '../src/storage/memory';

const feedXml = (title: string): string => `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>${title}</title>
  <item>
    <title>An episode</title>
    <guid>${title}-1</guid>
    <enclosure url="https://cdn.example.com/${title}.mp3" type="audio/mpeg"/>
    <pubDate>Tue, 10 Sep 2024 09:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

const okResponse = (body: string): Response =>
  ({
    ok: true,
    status: 200,
    text: async () => body,
    headers: { get: () => null },
  }) as unknown as Response;

const A = 'https://a.example.com/feed.xml';
const B = 'https://b.example.com/feed.xml';
const C = 'https://c.example.com/feed.xml';

function subscribedToThree(): ReturnType<typeof createMemoryStores> {
  const stores = createMemoryStores(hash);
  for (const feedUrl of [A, B, C]) stores.subscriptions.add(feedUrl, 1);
  return stores;
}

afterEach(() => {
  jest.restoreAllMocks();
});

it('refreshes every subscription', async () => {
  const stores = subscribedToThree();
  jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => okResponse(feedXml(String(input))));

  const result = await refreshAll(stores, 1_000);

  expect(result.refreshed.sort()).toEqual([A, B, C].sort());
  expect(result.stale).toEqual([]);
  expect(result.failed).toEqual([]);
  for (const feedUrl of [A, B, C]) {
    expect(stores.feeds.listEpisodes(feedUrl)).toHaveLength(1);
  }
});

it('one failing feed does not stop the others', async () => {
  const stores = subscribedToThree();
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (String(input) === B) throw new Error('certificate has expired');
    return okResponse(feedXml(String(input)));
  });

  const result = await refreshAll(stores, 1_000);

  expect(result.refreshed.sort()).toEqual([A, C].sort());
  expect(result.failed).toEqual([B]);
  expect(stores.feeds.listEpisodes(A)).toHaveLength(1);
  expect(stores.feeds.listEpisodes(C)).toHaveLength(1);
});

it('a feed that fails but is cached is reported stale, not failed', async () => {
  const stores = subscribedToThree();
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => okResponse(feedXml(String(input))));
  await refreshAll(stores, 1_000);

  fetchMock.mockImplementation(async (input) => {
    if (String(input) === B) throw new Error('offline');
    return okResponse(feedXml(String(input)));
  });
  const second = await refreshAll(stores, 2_000);

  expect(second.stale).toEqual([B]);
  expect(second.failed).toEqual([]);
  // Principle IV: the cached episodes are still there to play.
  expect(stores.feeds.listEpisodes(B)).toHaveLength(1);
});

it('a feed that never answers is abandoned rather than holding up the rest', async () => {
  jest.useFakeTimers();
  const stores = subscribedToThree();
  jest.spyOn(globalThis, 'fetch').mockImplementation(
    (input, init) =>
      new Promise((resolve, reject) => {
        if (String(input) !== B) {
          resolve(okResponse(feedXml(String(input))));
          return;
        }
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  );

  const pending = refreshAll(stores, 1_000, 10_000);
  await jest.advanceTimersByTimeAsync(30_000);
  const result = await pending;

  expect(result.refreshed.sort()).toEqual([A, C].sort());
  expect(result.failed).toEqual([B]);
  jest.useRealTimers();
});

it('does nothing at all with no subscriptions', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  const result = await refreshAll(createMemoryStores(hash), 1_000);
  expect(result).toEqual({ refreshed: [], stale: [], failed: [] });
  expect(fetchMock).not.toHaveBeenCalled();
});
