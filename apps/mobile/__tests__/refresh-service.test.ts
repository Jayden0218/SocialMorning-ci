// Tests the shared feed refresh: single flight, one throttle, at most 3 feeds at once.
import { hash } from '@/feeds/hash';
import { refreshFeeds, REFRESH_THROTTLE_MS, resetRefreshService } from '@/feeds/refresh-service';
import { createMemoryStores } from '@/storage/memory';

const feeds = Array.from({ length: 7 }, (_, i) => `https://f${i}.example.com/feed.xml`);
const xml = (t: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>${t}</title><item><title>e</title><guid>${t}-1</guid><enclosure url="https://cdn.example.com/${t}.mp3" type="audio/mpeg"/><pubDate>Tue, 10 Sep 2024 09:00:00 GMT</pubDate></item></channel></rss>`;

let active = 0;
let maxActive = 0;
let calls = 0;
function stub() {
  active = 0; maxActive = 0; calls = 0;
  jest.spyOn(globalThis, 'fetch').mockImplementation((async (input: unknown) => {
    calls++; active++; maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return { ok: true, status: 200, text: async () => xml(String(input)), headers: { get: () => null } } as unknown as Response;
  }) as typeof fetch);
}
function stores() {
  const s = createMemoryStores(hash);
  for (const f of feeds) s.subscriptions.add(f, 1);
  return s;
}
beforeEach(() => { resetRefreshService(); stub(); });
afterEach(() => jest.restoreAllMocks());

it('three triggers in a row fetch each feed once', async () => {
  const s = stores();
  const [a, b] = [refreshFeeds(s, { nowMs: 1_000 }), refreshFeeds(s, { nowMs: 1_001 })];
  expect(b).toBe(a);
  await a;
  await refreshFeeds(s, { nowMs: 2_000 }); // after the flight, inside the window
  expect(calls).toBe(feeds.length);
});

it('never runs more than 3 feeds at once, and does run 3', async () => {
  await refreshFeeds(stores(), { nowMs: 1_000 });
  expect(maxActive).toBe(3);
});

it('runs again when forced, and after the throttle window', async () => {
  const s = stores();
  await refreshFeeds(s, { nowMs: 1_000 });
  await refreshFeeds(s, { nowMs: 1_500, force: true });
  expect(calls).toBe(feeds.length * 2);
  await refreshFeeds(s, { nowMs: 1_500 + REFRESH_THROTTLE_MS + 1 });
  expect(calls).toBe(feeds.length * 3);
});

it('yields to the event loop between feeds', async () => {
  const spy = jest.spyOn(globalThis, 'setTimeout');
  await refreshFeeds(stores(), { nowMs: 1_000 });
  const zero = spy.mock.calls.filter((c) => c[1] === 0).length;
  expect(zero).toBeGreaterThanOrEqual(feeds.length);
});
