import { fetchExtras, pickTranscript, readExtras } from '../src/extras/fetch-extras';
import { createMemoryExtrasStore } from '../src/storage/memory';

const chaptersJson = JSON.stringify({ version: '1.2.0', chapters: [{ startTime: 0, title: 'Intro' }, { startTime: 120, title: 'Two' }] });
const srt = '1\n00:00:01,000 --> 00:00:02,000\nHi\n\nbroken\n\n2\n00:00:03,000 --> 00:00:04,000\nBye';

function fakeFetch(map: Record<string, { status?: number; body: string; type?: string }>) {
  const calls: string[] = [];
  const fetch = async (url: string) => {
    calls.push(url);
    const r = map[url];
    if (!r) return { ok: false, status: 404, text: async () => '' };
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, text: async () => r.body, headers: { get: () => r.type ?? null } };
  };
  return { fetch, calls };
}

it('picks srt over vtt over json over html; falls back to the first', () => {
  expect(pickTranscript([{ url: 'h', type: 'text/html' }, { url: 'v', type: 'text/vtt' }, { url: 's', type: 'application/srt; charset=utf-8' }])).toEqual({ url: 's', type: 'application/srt' });
  expect(pickTranscript([{ url: 'x' }])).toEqual({ url: 'x', type: 'text/plain' });
  expect(pickTranscript([])).toBeUndefined();
});

it('fetches once, caches, and serves the cache; a bad transcript block is kept partial', async () => {
  const store = createMemoryExtrasStore();
  const { fetch, calls } = fakeFetch({ 'https://c/ch.json': { body: chaptersJson }, 'https://c/t.srt': { body: srt } });
  const episode = { id: 'e', chaptersUrl: 'https://c/ch.json', transcripts: [{ url: 'https://c/t.srt', type: 'application/srt' }] };
  const first = await fetchExtras({ fetch, store, now: () => 1 }, episode);
  expect(first.chapters?.map((c) => c.title)).toEqual(['Intro', 'Two']);
  expect(first.transcript && 'lines' in first.transcript ? first.transcript.lines.map((l) => l.text) : []).toEqual(['Hi', 'Bye']);
  expect(first.error).toBeUndefined();
  const second = await fetchExtras({ fetch, store, now: () => 2 }, episode);
  expect(calls).toHaveLength(2);
  expect(second).toEqual(readExtras(store, 'e'));
});

it('a failing chapter file leaves an error row and the transcript still arrives; the error row is retried next time', async () => {
  const store = createMemoryExtrasStore();
  const { fetch, calls } = fakeFetch({ 'https://c/ch.json': { status: 500, body: '' }, 'https://c/t.srt': { body: srt } });
  const episode = { id: 'e', chaptersUrl: 'https://c/ch.json', transcripts: [{ url: 'https://c/t.srt', type: 'application/srt' }] };
  const r = await fetchExtras({ fetch, store, now: () => 1 }, episode);
  expect(r.error).toMatch(/chapters 500/);
  expect(r.transcript).toBeDefined();
  expect(store.get('e')?.error).toMatch(/chapters/);
  await fetchExtras({ fetch, store, now: () => 2 }, episode);
  expect(calls.length).toBe(4);
});

it('an episode with neither url yields nothing and nothing is fetched; a corrupt cache row reads as an error', async () => {
  const store = createMemoryExtrasStore();
  const { fetch, calls } = fakeFetch({});
  expect(await fetchExtras({ fetch, store, now: () => 1 }, { id: 'e', transcripts: [] })).toEqual({});
  expect(calls).toEqual([]);
  store.put({ episodeId: 'z', chaptersJson: '{bad', fetchedAt: 1 });
  expect(readExtras(store, 'z')).toEqual({ error: 'corrupt cache' });
});
