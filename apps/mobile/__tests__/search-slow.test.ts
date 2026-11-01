// Tests that a slow catalogue answer gives results, and "needs a connection" is only for a real network failure.
/**
 * 035 T043 (device check B5; FR-006). The server answered /v1/search in 6.1 s and 7.5 s and Search still said "The catalogue
 * needs a connection — showing your library only." The client gave every call 10 s, and a timeout was reported as the same
 * `ApiError('network')` as having no connection at all. Now: search waits longer (its own limit), and a timeout is marked
 * (`extra.timeout`) so the page says the catalogue is slow, not that the phone is offline.
 * Breaks that turn it red: set the search limit back to the 10 s default; drop the `timeout` mark in `send`.
 */
import { ApiError, createApi } from '@/social/api';
import { catalogueMessage } from '@/ui/search/catalogue-error';

jest.useFakeTimers();
afterAll(() => jest.useRealTimers());

const RESULT = { shows: [{ feedUrl: 'https://f.example/x.xml', title: 'Journey Morning' }], episodes: [] };
/** A fetch that answers after `ms`, and rejects like the real one when aborted. */
const slowFetch = (ms: number) => ((_url: string, init?: { signal?: AbortSignal }) => new Promise((resolve, reject) => {
  const t = setTimeout(() => resolve({ ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify(RESULT) }), ms);
  init?.signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
})) as never;
const api = (ms: number) => createApi({ baseUrl: 'https://api.example', fetch: slowFetch(ms), getToken: async () => undefined });

it('an answer after 7 s gives results', async () => {
  const p = api(7_000).search('Journey Morning');
  await jest.advanceTimersByTimeAsync(7_100);
  await expect(p).resolves.toMatchObject({ shows: [{ title: 'Journey Morning' }] });
});

it('an answer after 12 s (past the usual 10 s) still gives results', async () => {
  const p = api(12_000).search('Journey Morning');
  p.catch(() => undefined);
  await jest.advanceTimersByTimeAsync(12_100);
  await expect(p).resolves.toMatchObject({ shows: [{ title: 'Journey Morning' }] });
});

it('a search with no answer at all ends as a marked timeout, and says the catalogue is slow, not offline', async () => {
  const p = api(10 * 60_000).search('x');
  p.catch(() => undefined);
  await jest.advanceTimersByTimeAsync(60_000);
  const e = await p.then(() => undefined, (x: unknown) => x);
  expect(e).toBeInstanceOf(ApiError);
  expect(catalogueMessage(e)).not.toMatch(/needs a connection/);
  expect(catalogueMessage(e)).toMatch(/slow|try again/i);
});

it('control: a real network failure (no timeout mark) still says it needs a connection', () => {
  expect(catalogueMessage(new ApiError('network', "Couldn't reach the server.", 0, { cause: 'TypeError: Network request failed' }))).toMatch(/needs a connection/);
});
