// Tests search history, suggestions, and what a scanned QR code opens.
/**
 * M10's search page logic: history, "Try searching", and what a scanned QR code opens.
 * The breaks that turn these red: in `src/search/scan.ts` return `{ kind: 'route', path:
 * '/' + rest }` for ANY `socialmorning://` path (the "only our own links" test); in
 * `src/search/history.ts` drop the `.filter(...)` that removes the old copy (dedupe test).
 */
import { createMemoryStores } from '@/storage/memory';
import { HISTORY_MAX, addHistory, clearHistory, readHistory } from '@/search/history';
import { scanTarget } from '@/search/scan';
import { suggestions } from '@/search/suggest';
import type { Discover, DiscoverItem } from '@/social/api';

const API = 'https://socialmorning-api.vercel.app';

it('history: newest first, one copy each (any case), capped, clearable', () => {
  const { settings } = createMemoryStores((x) => x);
  expect(readHistory(settings)).toEqual([]);
  addHistory(settings, 'money');
  addHistory(settings, 'history');
  expect(addHistory(settings, 'Money')).toEqual(['Money', 'history']);
  for (let i = 0; i < 20; i++) addHistory(settings, `t${i}`);
  expect(readHistory(settings)).toHaveLength(HISTORY_MAX);
  expect(readHistory(settings)[0]).toBe('t19');
  clearHistory(settings);
  expect(readHistory(settings)).toEqual([]);
});

it('history: blanks and pasted feed URLs are not kept; a broken stored value reads as empty', () => {
  const { settings } = createMemoryStores((x) => x);
  expect(addHistory(settings, '   ')).toEqual([]);
  expect(addHistory(settings, 'https://feeds.example.com/x.xml')).toEqual([]);
  settings.set('search.history', '{not json');
  expect(readHistory(settings)).toEqual([]);
});

it('a QR code: our own links open, anything else becomes search text', () => {
  expect(scanTarget('socialmorning://clip/abc', API)).toEqual({ kind: 'route', path: '/clip/abc' });
  expect(scanTarget('socialmorning://episode/e1/', API)).toEqual({ kind: 'route', path: '/episode/e1' });
  expect(scanTarget(`${API}/c/k9`, API)).toEqual({ kind: 'route', path: '/clip/k9' });
  expect(scanTarget('https://feeds.example.com/show.xml', API)).toEqual({ kind: 'show', feedUrl: 'https://feeds.example.com/show.xml' });
  expect(scanTarget('socialmorning://account/delete', API)).toEqual({ kind: 'search', term: 'socialmorning://account/delete' });
  expect(scanTarget('socialmorning://clip/a/b', API)).toEqual({ kind: 'search', term: 'socialmorning://clip/a/b' });
  expect(scanTarget('  hello podcast  ', API)).toEqual({ kind: 'search', term: 'hello podcast' });
});

it('"Try searching": show names, hidden shows left out, one copy each', () => {
  const ep = (show: string, feedUrl: string): DiscoverItem => ({ kind: 'trending', key: show, episode: { id: show, feedUrl, guid: show, title: 't', showTitle: show, enclosureUrl: 'x' } });
  const body: Discover = {
    picks: [ep('Reply All', 'https://a')], talkedAbout: [], trending: [ep('Hidden Show', 'https://h'), ep('reply all', 'https://a2')], stale: false, serverTime: '',
    shows: [{ feedUrl: 'https://p', title: 'Popular One', author: 'x', genres: [] }],
  };
  expect(suggestions(body, new Set(['https://h']))).toEqual(['Popular One', 'reply all']);
  expect(suggestions(undefined, new Set())).toEqual([]);
});
