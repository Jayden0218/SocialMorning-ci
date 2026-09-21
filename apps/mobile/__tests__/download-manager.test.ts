/**
 * quickstart A9: the download manager over a fake Downloader and Network. What this
 * proves: the one-at-a-time / order / Wi-Fi / budget / resume / join / remove rules.
 * What it does not: that expo-file-system's DownloadTask resumes on the phone — D0.
 */
import { createDownloadManager, DEFAULT_BUDGET_BYTES } from '../src/downloads/manager';
import type { Downloader, DownloadRow, Network } from '../src/downloads/types';
import { createMemoryStores } from '../src/storage/memory';
import { episodeId } from '../src/storage/schema';
import { hash } from '../src/feeds/hash';
import type { Episode, ParsedFeed, Show } from '@socialmorning/feed-parser';

const FEED = 'https://feeds.example.com/x.xml';
const show: Show = { feedUrl: FEED, title: 'A Show', explicit: false, categories: [], contentHash: 'h' };
const ep = (guid: string, bytes?: number): Episode => ({
  guid, guidSource: 'guid', title: guid, enclosureUrl: `https://cdn.example.com/${guid}.mp3`,
  ...(bytes !== undefined ? { enclosureBytes: bytes } : {}), explicit: false, transcripts: [], soundbites: [], contentHash: `h-${guid}`,
});
const parsed = (episodes: Episode[]): ParsedFeed => ({ show, episodes, warnings: [] });
const id = (guid: string) => episodeId(FEED, guid, hash);

/** A fake CDN: each `start` transfers `size` bytes in `chunk` steps; `stall` pauses it. */
function fakeDownloader(size: number, opts: { ignoresRange?: boolean } = {}) {
  const files = new Map<string, number>();
  const log: string[] = [];
  let stallAt: number | undefined;
  let resolveStall: (() => void) | undefined;
  const d: Downloader = {
    async start(row, _url, onProgress) {
      log.push(`start:${row.episodeId}:${row.resumeData ?? '-'}`);
      let done = row.resumeData && !opts.ignoresRange ? Number(JSON.parse(row.resumeData).at) : 0;
      while (done < size) {
        if (stallAt !== undefined && done >= stallAt) {
          stallAt = undefined;
          await new Promise<void>((r) => { resolveStall = r; });
          return { paused: true, resumeData: JSON.stringify({ at: done }) };
        }
        done = Math.min(size, done + size / 4);
        onProgress(done, size);
      }
      files.set(row.filePath, size);
      return {};
    },
    async pause(episodeId) { log.push(`pause:${episodeId}`); return undefined; },
    async cancel(episodeId) { log.push(`cancel:${episodeId}`); },
    async remove(path) { files.delete(path); log.push(`remove:${path}`); },
    async size(path) { return files.get(path); },
  };
  return { d, log, files, stall: (at: number) => { stallAt = at; }, releaseStall: () => resolveStall?.() };
}

function build(opts: { size?: number; network?: 'wifi' | 'cellular' | 'none'; ignoresRange?: boolean } = {}) {
  const stores = createMemoryStores(hash);
  stores.feeds.put(FEED, parsed([ep('a', 100), ep('b', 100), ep('c', 100)]), {}, 1);
  const cdn = fakeDownloader(opts.size ?? 100, { ignoresRange: opts.ignoresRange ?? false });
  let network = opts.network ?? 'wifi';
  const net: Network = { kind: async () => network };
  let clock = 10;
  const manager = createDownloadManager({
    downloader: cdn.d, network: net, stores, now: () => clock++,
    pathFor: (e) => `/downloads/${e}.mp3`,
  });
  return { stores, cdn, manager, setNetwork: (k: typeof network) => { network = k; } };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

it('A9: downloads run one at a time in request order and complete with the file size recorded', async () => {
  const { stores, cdn, manager } = build();
  expect(await manager.request(id('a'))).toEqual({ kind: 'queued' });
  expect(await manager.request(id('b'))).toEqual({ kind: 'queued' });
  expect(await manager.request(id('a'))).toEqual({ kind: 'joined' });
  for (let i = 0; i < 10; i++) await flush();
  expect(cdn.log.filter((l) => l.startsWith('start:'))).toEqual([`start:${id('a')}:-`, `start:${id('b')}:-`]);
  const rows = stores.downloads.list();
  expect(rows.map((r) => [r.state, r.bytesDone, r.bytesTotal])).toEqual([['complete', 100, 100], ['complete', 100, 100]]);
  expect(manager.usedBytes()).toBe(200);
});

it('A9: a transfer interrupted mid-way is resumed from its resumeData, not restarted', async () => {
  const { stores, cdn, manager, setNetwork } = build();
  cdn.stall(50);
  await manager.request(id('a'));
  for (let i = 0; i < 5; i++) await flush();
  expect(stores.downloads.get(id('a'))?.state).toBe('downloading');
  setNetwork('none'); // the connection drops: the transfer pauses and cannot resume yet
  cdn.releaseStall();
  for (let i = 0; i < 5; i++) await flush();
  const paused = stores.downloads.get(id('a'))!;
  expect(paused.state).toBe('paused');
  expect(paused.resumeData).toBe(JSON.stringify({ at: 50 }));
  // "App restart" with the network back: recover() resumes from the saved state.
  setNetwork('wifi');
  await manager.recover();
  for (let i = 0; i < 10; i++) await flush();
  expect(stores.downloads.get(id('a'))?.state).toBe('complete');
  expect(cdn.log.filter((l) => l.startsWith('start:'))).toEqual([`start:${id('a')}:-`, `start:${id('a')}:${JSON.stringify({ at: 50 })}`]);
});

it('FR-002: a server that ignores the Range restarts from 0 and the row says so', async () => {
  const { stores, cdn, manager, setNetwork } = build({ ignoresRange: true });
  cdn.stall(50);
  await manager.request(id('a'));
  for (let i = 0; i < 5; i++) await flush();
  setNetwork('none');
  cdn.releaseStall();
  for (let i = 0; i < 5; i++) await flush();
  setNetwork('wifi');
  await manager.recover();
  for (let i = 0; i < 10; i++) await flush();
  const row = stores.downloads.get(id('a'))!;
  expect(row.state).toBe('complete');
  expect(row.error).toBe('no-resume');
});

it('Wi-Fi rule: nothing runs on cellular unless allowed per download or globally; nothing offline', async () => {
  const { stores, cdn, manager, setNetwork } = build({ network: 'cellular' });
  await manager.request(id('a'));
  await flush();
  expect(stores.downloads.get(id('a'))?.state).toBe('waiting');
  await manager.request(id('b'), { allowMobile: true });
  for (let i = 0; i < 10; i++) await flush();
  expect(stores.downloads.get(id('b'))?.state).toBe('complete');
  expect(stores.downloads.get(id('a'))?.state).toBe('waiting');
  manager.setAllowMobile(true);
  for (let i = 0; i < 10; i++) await flush();
  expect(stores.downloads.get(id('a'))?.state).toBe('complete');
  setNetwork('none');
  await manager.request(id('c'));
  await flush();
  expect(stores.downloads.get(id('c'))?.state).toBe('waiting');
  expect(cdn.log.filter((l) => l.startsWith('start:'))).toHaveLength(2);
});

it('budget: a request that would not fit is refused before it starts; the in-flight one counts', async () => {
  const { manager, stores } = build();
  manager.setBudgetBytes(250);
  await manager.request(id('a'));
  await manager.request(id('b'));
  for (let i = 0; i < 10; i++) await flush();
  const r = await manager.request(id('c'));
  expect(r).toEqual({ kind: 'budget', usedBytes: 200, budgetBytes: 250 });
  expect(stores.downloads.get(id('c'))).toBeUndefined();
  expect(manager.budgetBytes()).toBe(250);
  expect(DEFAULT_BUDGET_BYTES).toBe(2 * 1024 ** 3);
});

it('remove deletes the file and the row but keeps the position; removeFinished only touches finished episodes', async () => {
  const { manager, stores, cdn } = build();
  await manager.request(id('a'));
  await manager.request(id('b'));
  for (let i = 0; i < 10; i++) await flush();
  stores.positions.save({ episodeId: id('a'), offsetMs: 872_000, finished: false }, 1);
  stores.positions.save({ episodeId: id('b'), offsetMs: 1, finished: true }, 1);
  expect(await manager.removeFinished()).toBe(1);
  expect(stores.downloads.get(id('b'))).toBeUndefined();
  expect(stores.downloads.get(id('a'))?.state).toBe('complete');
  await manager.remove(id('a'));
  expect(stores.downloads.get(id('a'))).toBeUndefined();
  expect(cdn.files.size).toBe(0);
  expect(stores.positions.get(id('a'))?.offsetMs).toBe(872_000);
});

it('FR-007: a complete row whose file vanished is removed by verify()', async () => {
  const { manager, stores, cdn } = build();
  await manager.request(id('a'));
  for (let i = 0; i < 10; i++) await flush();
  cdn.files.clear();
  expect(await manager.verify(id('a'))).toBe(true);
  expect(stores.downloads.get(id('a'))).toBeUndefined();
  expect(await manager.verify(id('a'))).toBe(false);
});

it('cancel while downloading stops the transfer and drops the row; the next waiting row starts', async () => {
  const { manager, stores, cdn } = build();
  cdn.stall(25);
  await manager.request(id('a'));
  await manager.request(id('b'));
  for (let i = 0; i < 5; i++) await flush();
  await manager.cancel(id('a'));
  expect(cdn.log).toContain(`cancel:${id('a')}`);
  cdn.releaseStall();
  for (let i = 0; i < 10; i++) await flush();
  expect(stores.downloads.get(id('a'))).toBeUndefined();
  expect(stores.downloads.get(id('b'))?.state).toBe('complete');
});

it('a request for an unknown episode is refused', async () => {
  const { manager } = build();
  expect(await manager.request('nope')).toEqual({ kind: 'no-episode' });
});

export type _Row = DownloadRow;
