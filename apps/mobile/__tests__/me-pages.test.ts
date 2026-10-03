/**
 * M10's Me pages, the logic under them: favourites, saved moments, stickers, listening
 * history and the Updates list. The breaks that turn these red: in `src/me/updates.ts`
 * drop the `hidden.has(feedUrl)` skip (hidden show test); in `src/me/stickers.ts` change
 * `have >= r.need` to `have > r.need` (stickers test).
 */
import type { Episode, ParsedFeed, Show } from '@socialmorning/feed-parser';
import { hash } from '@/feeds/hash';
import { isFavourite, listFavourites, toggleFavourite } from '@/me/favourites';
import { listeningHistory, matchesAll } from '@/me/history';
import { deleteMoment, editMoment, listMoments, NOTE_MAX, saveMoment } from '@/me/moments';
import { latestEarned, stickers } from '@/me/stickers';
import { latestUpdates, plainSummary } from '@/me/updates';
import { createMemoryStores } from '@/storage/memory';
import { episodeId } from '@/storage/schema';

const show = (feedUrl: string, title: string): Show => ({ feedUrl, title, explicit: false, categories: [], contentHash: 'h' });
const ep = (guid: string, publishedAt: number, notes?: string): Episode => ({ guid, guidSource: 'guid', title: guid, enclosureUrl: `https://cdn/${guid}.mp3`, publishedAt, explicit: false, transcripts: [], soundbites: [], contentHash: `h-${guid}`, ...(notes ? { shownotesHtml: notes } : {}) });
const feed = (s: Show, episodes: Episode[]): ParsedFeed => ({ show: s, episodes, warnings: [] });

it('favourites: star, un-star, newest first', () => {
  const { settings } = createMemoryStores(hash);
  expect(toggleFavourite(settings, 'e1', 1)).toBe(true);
  expect(toggleFavourite(settings, 'e2', 2)).toBe(true);
  expect(listFavourites(settings).map((f) => f.episodeId)).toEqual(['e2', 'e1']);
  expect(toggleFavourite(settings, 'e1', 3)).toBe(false);
  expect(isFavourite(settings, 'e1')).toBe(false);
  settings.set('me.favourites', 'broken');
  expect(listFavourites(settings)).toEqual([]);
});

it('moments: saved newest first, note trimmed and capped, time never negative; edit and delete', () => {
  const { settings } = createMemoryStores(hash);
  const a = saveMoment(settings, 'e1', 61_500.7, '  first  ', 10);
  saveMoment(settings, 'e2', -5, 'x'.repeat(NOTE_MAX + 20), 11);
  const list = listMoments(settings);
  expect(list.map((m) => m.episodeId)).toEqual(['e2', 'e1']);
  expect(list[1]).toMatchObject({ atMs: 61_500, note: 'first' });
  expect(list[0]?.atMs).toBe(0);
  expect(list[0]?.note).toHaveLength(NOTE_MAX);
  editMoment(settings, a.id, ' better ');
  expect(listMoments(settings).find((m) => m.id === a.id)?.note).toBe('better');
  deleteMoment(settings, a.id);
  expect(listMoments(settings).map((m) => m.episodeId)).toEqual(['e2']);
});

it('stickers: earned exactly at the threshold; the latest earned is named', () => {
  const none = stickers({ listenedMs: 0, finished: 0, moments: 0, comments: 0 });
  expect(none.every((s) => !s.earned)).toBe(true);
  expect(latestEarned(none)).toBeUndefined();
  const some = stickers({ listenedMs: 42 * 3_600_000, finished: 1, moments: 0, comments: 0 });
  expect(some.filter((s) => s.earned).map((s) => s.id)).toEqual(['hour-1', 'hour-10', 'hour-42', 'finish-1']);
  expect(some.find((s) => s.id === 'hour-100')?.progress).toBe('42 of 100 h');
  expect(latestEarned(some)?.id).toBe('finish-1');
});

it('history: every episode with a position, most recent first; unknown episodes skipped', () => {
  const stores = createMemoryStores(hash);
  const F = 'https://f/a.xml';
  stores.feeds.put(F, feed(show(F, 'A'), [ep('g1', 1), ep('g2', 2)]), {}, 1);
  const id1 = episodeId(F, 'g1', hash);
  const id2 = episodeId(F, 'g2', hash);
  stores.positions.save({ episodeId: id1, offsetMs: 5_000, finished: false }, 100);
  stores.positions.save({ episodeId: id2, offsetMs: 9_000, finished: true }, 200);
  stores.positions.save({ episodeId: 'gone', offsetMs: 1, finished: false }, 300);
  expect(listeningHistory(stores).map((r) => [r.episode.id, r.finished])).toEqual([[id2, true], [id1, false]]);
});

it('updates: newest across shows, hidden shows left out, notes as one plain line', () => {
  const stores = createMemoryStores(hash);
  const A = 'https://f/a.xml';
  const B = 'https://f/b.xml';
  const H = 'https://f/hidden.xml';
  stores.feeds.put(A, feed(show(A, 'A'), [ep('a1', 10, '<p>Hello&nbsp;<b>world</b></p>')]), {}, 1);
  stores.feeds.put(B, feed(show(B, 'B'), [ep('b1', 30)]), {}, 1);
  stores.feeds.put(H, feed(show(H, 'H'), [ep('h1', 99)]), {}, 1);
  for (const f of [A, B, H]) stores.subscriptions.add(f, 0);
  const rows = latestUpdates(stores, new Set([H]));
  expect(rows.map((r) => r.showTitle)).toEqual(['B', 'A']);
  expect(rows[1]?.summary).toBe('Hello world');
  expect(plainSummary('<script>x</script>' + 'a'.repeat(200), 10)).toBe(`${'a'.repeat(9)}…`);
  expect(plainSummary(undefined)).toBe('');
});

it('search: every word, any case, across the texts; empty matches all', () => {
  expect(matchesAll('', ['x'])).toBe(true);
  expect(matchesAll('ivan ILYICH', ['The Death of Ivan Ilyich', 'Book show'])).toBe(true);
  expect(matchesAll('ivan tolstoy', ['The Death of Ivan Ilyich', undefined])).toBe(false);
});
