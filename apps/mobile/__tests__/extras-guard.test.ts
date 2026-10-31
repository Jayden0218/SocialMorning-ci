// A5: chapters/transcript fetches have a deadline and a size cap.
import { fetchExtras } from '@/feeds/fetch-extras';
import { createMemoryExtrasStore } from '@/storage/memory';

const ep = { id: 'e', chaptersUrl: 'https://c/ch.json', transcripts: [{ url: 'https://c/t.srt', type: 'application/srt' }] };

afterEach(() => jest.useRealTimers());

it('a fetch that never answers gives up within the deadline and records an error', async () => {
  jest.useFakeTimers();
  const store = createMemoryExtrasStore();
  const fetch = () => new Promise<never>(() => undefined);
  const p = fetchExtras({ fetch, store, now: () => 1 }, ep);
  await jest.advanceTimersByTimeAsync(30_000);
  const out = await p;
  expect(out.chapters).toBeUndefined();
  expect(out.transcript).toBeUndefined();
  expect(out.error).toMatch(/chapters/);
  expect(out.error).toMatch(/transcript/);
});

it('a body over the cap is refused, by declared length and by actual size', async () => {
  const store = createMemoryExtrasStore();
  const big = 'x'.repeat(6 * 1024 * 1024);
  const declared = async () => ({ ok: true, status: 200, text: async () => '{}', headers: { get: (n: string) => (n.toLowerCase() === 'content-length' ? String(big.length) : null) } });
  const actual = async () => ({ ok: true, status: 200, text: async () => big, headers: { get: () => null } });
  for (const fetch of [declared, actual]) {
    const out = await fetchExtras({ fetch, store: createMemoryExtrasStore(), now: () => 1 }, ep);
    expect(out.chapters).toBeUndefined();
    expect(out.transcript).toBeUndefined();
    expect(out.error).toMatch(/over/);
  }
  void store;
});
