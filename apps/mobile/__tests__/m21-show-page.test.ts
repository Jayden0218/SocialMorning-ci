// Tests M21 show page rules: subscriber line, host picks, Add all, Remove from Updates.
/**
 * M21 US4/US5 (FR-036, FR-040): pure rules behind the show page and the shared episode sheet.
 *
 * The breaks that turn it red:
 *   - `src/ui/show/show-page.ts` `addAllToQueue`: report `full: false` when the 300 limit stops it (the toast would not say the queue is full).
 *   - `src/me/updates.ts` `latestUpdates`: drop `!removed.has(x.id)` (a removed episode comes back).
 */
import type { Episode, ParsedFeed, Show } from '@socialmorning/feed-parser';
import { hash } from '@/feeds/hash';
import { QUEUE_MAX } from '@socialmorning/player-core';
import { createMemoryStores } from '@/storage/memory';
import { addAllMessage, addAllToQueue, compactNumber, hostPicksOf, subscriberLine } from '@/ui/show/show-page';
import { hiddenUpdates, hideFromUpdates, latestUpdates, UPDATES_HIDDEN_KEY } from '@/me/updates';

it('subscriber line: "New here" under 10, plain under 1 000, then 1.2k / 12k / 1.5M', () => {
  expect(subscriberLine(undefined)).toBeUndefined();
  expect(subscriberLine(0)).toBe('New here');
  expect(subscriberLine(9)).toBe('New here');
  expect(subscriberLine(10)).toBe('10 subscribers');
  expect(subscriberLine(999)).toBe('999 subscribers');
  expect(subscriberLine(1234)).toBe('1.2k subscribers');
  expect(compactNumber(1000)).toBe('1k');
  expect(compactNumber(12_345)).toBe('12k');
  expect(compactNumber(1_520_000)).toBe('1.5M');
});

it('host picks come in the host\'s order, among the episodes the phone has', () => {
  const eps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  expect(hostPicksOf(eps, ['c', 'gone', 'a']).map((e) => e.id)).toEqual(['c', 'a']);
  expect(hostPicksOf(eps, undefined)).toEqual([]);
  expect(hostPicksOf(eps, [])).toEqual([]);
});

it('Add all: the list as shown goes to the end; queued ones stay put; the 300 limit stops it and says so', () => {
  expect(addAllToQueue(['x', 'b'], ['a', 'b', 'c'])).toEqual({ queue: ['x', 'b', 'a', 'c'], added: 2, full: false });
  const nearlyFull = Array.from({ length: QUEUE_MAX - 1 }, (_, i) => `q${i}`);
  const r = addAllToQueue(nearlyFull, ['a', 'b', 'c']);
  expect(r).toMatchObject({ added: 1, full: true });
  expect(r.queue).toHaveLength(QUEUE_MAX);
  expect(r.queue.at(-1)).toBe('a');
  expect(addAllMessage({ added: 2, full: false })).toBe('Added 2 episodes to the queue.');
  expect(addAllMessage({ added: 1, full: true })).toBe('Added 1 episode to the queue — it is full now (300).');
  expect(addAllMessage({ added: 0, full: true })).toBe('The queue is full (300). Remove something first.');
  expect(addAllMessage({ added: 0, full: false })).toBe('All of these are in the queue already.');
});

it('Remove from Updates: the episode leaves the Updates feed only; the show stays subscribed', () => {
  const stores = createMemoryStores(hash);
  const F = 'https://feeds.example.com/u.xml';
  const show: Show = { feedUrl: F, title: 'U', explicit: false, categories: [], contentHash: 'h' };
  const ep = (guid: string, publishedAt: number): Episode => ({ guid, guidSource: 'guid', title: guid, enclosureUrl: `https://cdn/${guid}.mp3`, publishedAt, explicit: false, transcripts: [], soundbites: [], contentHash: `h-${guid}` });
  const feed: ParsedFeed = { show, episodes: [ep('one', 20), ep('two', 10)], warnings: [] };
  stores.feeds.put(F, feed, {}, 1);
  stores.subscriptions.add(F, 0);
  const rows = latestUpdates(stores, new Set());
  expect(rows.map((r) => r.episode.guid)).toEqual(['one', 'two']);
  hideFromUpdates(stores.settings, rows[0]!.episode.id);
  hideFromUpdates(stores.settings, rows[0]!.episode.id); // twice: kept once
  expect(latestUpdates(stores, new Set()).map((r) => r.episode.guid)).toEqual(['two']);
  expect(stores.subscriptions.has(F)).toBe(true);
  expect(JSON.parse(stores.settings.get(UPDATES_HIDDEN_KEY) ?? '[]')).toEqual([rows[0]!.episode.id]);
  stores.settings.set(UPDATES_HIDDEN_KEY, 'not json');
  expect(hiddenUpdates(stores.settings).size).toBe(0);
});
