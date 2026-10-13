// Tests the speed fixes ported from the never-merged perf branch (2026-10-04 lag and scroll audits).
/**
 * The perf branch (90c8a498, ca16f01e) was never merged; its fixes still missing from today's code
 * were ported by hand on 2026-10-13. These are their guards.
 *
 * The breaks that turn these red:
 *  - `src/ui/player/lookup.ts`: drop the `if (hit && hit.id === episodeId) return hit;` line
 *    (the mini player and player page read SQLite on every tick again).
 *  - `src/me/history.ts`: drop `if (out.length >= limit) break;` (every played episode is read).
 *  - `src/ui/lib/image/index.tsx`: drop the `alt={…}` line (gluestack warns on every render).
 *  - `src/ui/comments/EpisodeCard.tsx` or `app/clip/[id].tsx`: call `usePlayerState()` again.
 *  - either layout: remove `freezeOnBlur: true`.
 */
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { Episode, ParsedFeed, Show } from '@socialmorning/feed-parser';
import { hash } from '@/feeds/hash';
import { listeningHistory } from '@/me/history';
import { createMemoryStores } from '@/storage/memory';
import { episodeId } from '@/storage/schema';
import { episodeAndShow } from '@/ui/player/lookup';
import { Image } from '@/ui/lib/image';

const show = (feedUrl: string): Show => ({ feedUrl, title: 'A', explicit: false, categories: [], contentHash: 'h' });
const ep = (guid: string): Episode => ({ guid, guidSource: 'guid', title: guid, enclosureUrl: `https://cdn/${guid}.mp3`, publishedAt: 1, explicit: false, transcripts: [], soundbites: [], contentHash: `h-${guid}` });
const feed = (feedUrl: string, guids: string[]): ParsedFeed => ({ show: show(feedUrl), episodes: guids.map(ep), warnings: [] });
const F = 'https://f/a.xml';

it('the playing episode and its show are read once per episode, not on every tick', () => {
  const stores = createMemoryStores(hash);
  stores.feeds.put(F, feed(F, ['g1', 'g2']), {}, 1);
  const reads = jest.spyOn(stores.feeds, 'getEpisode');
  const id1 = episodeId(F, 'g1', hash);
  for (let tick = 0; tick < 20; tick += 1) expect(episodeAndShow(stores.feeds, id1).show?.title).toBe('A');
  expect(reads).toHaveBeenCalledTimes(1);
  episodeAndShow(stores.feeds, episodeId(F, 'g2', hash));
  expect(reads).toHaveBeenCalledTimes(2);
  // An episode not in the cache yet is not remembered as missing.
  episodeAndShow(stores.feeds, 'later');
  episodeAndShow(stores.feeds, 'later');
  expect(reads).toHaveBeenCalledTimes(4);
});

it('history reads episodes only until it has `limit` rows', () => {
  const stores = createMemoryStores(hash);
  const guids = Array.from({ length: 150 }, (_, i) => `g${i}`);
  stores.feeds.put(F, feed(F, guids), {}, 1);
  guids.forEach((g, i) => stores.positions.save({ episodeId: episodeId(F, g, hash), offsetMs: 1, finished: false }, 100 + i));
  const reads = jest.spyOn(stores.feeds, 'getEpisode');
  const rows = listeningHistory(stores);
  expect(rows).toHaveLength(100);
  expect(rows[0]?.episode.guid).toBe('g149');
  expect(reads).toHaveBeenCalledTimes(100);
});

it('an Image without alt does not warn on each render', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  act(() => { create(createElement(Image, { source: { uri: 'https://x/y.png' }, style: { width: 10, height: 10 } })); });
  expect(warn.mock.calls.filter((c) => String(c[0]).includes('alt'))).toEqual([]);
  warn.mockRestore();
});

// Kept as a source check: the two pages are expo-router screens with the social API, stores and
// the router behind them; the render counts of usePlayerSelector itself are G-M23-8's job.
it('the comments card and the clip page read the player through a selector; both stacks freeze hidden pages', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  for (const f of ['src/ui/comments/EpisodeCard.tsx', 'app/clip/[id].tsx']) {
    expect({ f, whole: /usePlayerState\(/.test(read(f)) }).toEqual({ f, whole: false });
    expect({ f, selector: /usePlayerSelector\(/.test(read(f)) }).toEqual({ f, selector: true });
  }
  for (const f of ['app/_layout.tsx', 'app/(tabs)/_layout.tsx']) {
    expect({ f, freeze: /freezeOnBlur: true/.test(read(f)) }).toEqual({ f, freeze: true });
  }
});
