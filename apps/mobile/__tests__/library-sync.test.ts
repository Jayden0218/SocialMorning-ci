/**
 * M10b US2 on the phone: every change to favourites, favourite comments, moments and
 * search history is logged (removals as tombstones), uploaded, and the lists are rebuilt
 * from the server's merged answer. The break that turns the first test red: in
 * `src/sync/library.ts` `recordChange`, write a removal with no `deletedAt`.
 */
import { hash } from '../src/feeds/hash';
import { listFavComments, toggleFavComment } from '../src/me/fav-comments';
import { listFavourites, toggleFavourite } from '../src/me/favourites';
import { deleteMoment, listMoments, saveMoment } from '../src/me/moments';
import { addHistory, clearHistory, readHistory } from '../src/search/history';
import { createMemoryStores } from '../src/storage/memory';
import { applyMerged, createLibrarySync, readLog, type LogItem } from '../src/sync/library';

it('a removal is logged as a tombstone, not dropped — the only shape that can sync', () => {
  const { settings } = createMemoryStores(hash);
  toggleFavourite(settings, 'e1', 1_000);
  toggleFavourite(settings, 'e1', 2_000);
  const row = readLog(settings).find((i) => i.kind === 'fav_episode' && i.key === 'e1');
  expect(row?.deletedAt).toBe(new Date(2_000).toISOString());
  const m = saveMoment(settings, 'e2', 5_000, 'note', 3_000);
  deleteMoment(settings, m.id, 4_000);
  expect(readLog(settings).find((i) => i.key === m.id)?.deletedAt).toBeDefined();
  addHistory(settings, 'Money');
  clearHistory(settings);
  expect(readLog(settings).find((i) => i.kind === 'search' && i.key === 'money')?.deletedAt).toBeDefined();
});

it('favourite comments: star, un-star, the text kept for the list', () => {
  const { settings } = createMemoryStores(hash);
  expect(toggleFavComment(settings, { commentId: 'c1', episodeId: 'e1', body: 'great bit', author: 'Bo', offsetMs: 61_000 }, 1)).toBe(true);
  expect(listFavComments(settings).map((c) => [c.commentId, c.body])).toEqual([['c1', 'great bit']]);
  expect(readLog(settings).find((i) => i.kind === 'fav_comment')?.payload).toMatchObject({ episodeId: 'e1', body: 'great bit', author: 'Bo' });
  expect(toggleFavComment(settings, { commentId: 'c1', episodeId: 'e1', body: '', author: '', offsetMs: null }, 2)).toBe(false);
  expect(listFavComments(settings)).toEqual([]);
});

it('the server\'s merged answer rebuilds all four lists; tombstones stay out', () => {
  const { settings } = createMemoryStores(hash);
  const items: LogItem[] = [
    { kind: 'fav_episode', key: 'e9', payload: {}, updatedAt: '2026-09-27T10:00:00.000Z' },
    { kind: 'fav_episode', key: 'gone', payload: {}, updatedAt: '2026-09-27T09:00:00.000Z', deletedAt: '2026-09-27T09:30:00.000Z' },
    { kind: 'moment', key: 'm1', payload: { episodeId: 'e9', atMs: 90_000, note: 'from the other phone', savedAt: 5 }, updatedAt: '2026-09-27T10:01:00.000Z' },
    { kind: 'search', key: 'history', payload: { term: 'History' }, updatedAt: '2026-09-27T10:02:00.000Z' },
    { kind: 'fav_comment', key: 'c7', payload: { episodeId: 'e9', body: 'yes', author: 'Al', offsetMs: null }, updatedAt: '2026-09-27T10:03:00.000Z' },
  ];
  applyMerged(settings, items);
  expect(listFavourites(settings).map((f) => f.episodeId)).toEqual(['e9']);
  expect(listMoments(settings)).toEqual([{ id: 'm1', episodeId: 'e9', atMs: 90_000, note: 'from the other phone', savedAt: 5 }]);
  expect(readHistory(settings)).toEqual(['History']);
  expect(listFavComments(settings).map((c) => c.commentId)).toEqual(['c7']);
});

it('a change uploads the whole log and applies the answer; signed out, nothing is sent', async () => {
  const { settings } = createMemoryStores(hash);
  let signedIn = false;
  const put = jest.fn(async (items: LogItem[]) => ({ items }));
  const sync = createLibrarySync({ put, settings, isSignedIn: () => signedIn });
  toggleFavourite(settings, 'e1', 1);
  await sync.reconcile();
  expect(put).not.toHaveBeenCalled();
  signedIn = true;
  await sync.reconcile();
  expect(put).toHaveBeenCalledTimes(1);
  expect(put.mock.calls[0]?.[0].map((i) => i.key)).toEqual(['e1']);
  expect(listFavourites(settings).map((f) => f.episodeId)).toEqual(['e1']);
});
