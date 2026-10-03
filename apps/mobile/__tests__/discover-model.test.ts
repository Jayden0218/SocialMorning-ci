/**
 * M10's Discover model: no data → no section; hidden shows and blocked listeners never
 * reach the screen. The breaks that turn these red: drop `keepItem` from `picks` in
 * `src/discover/sections.ts` (hidden show test), and drop the `blocked` check from `said`
 * (blocked listener test).
 */
import { ago, buildModel, pages, statsLine } from '@/discover/sections';
import type { Discover, DiscoverItem, EpisodeCard } from '@/social/api';

const card = (id: string, feedUrl = `https://f/${id}.xml`): EpisodeCard => ({ id, feedUrl, guid: id, title: `T ${id}`, showTitle: `S ${id}`, enclosureUrl: `https://a/${id}.mp3` });
const item = (kind: DiscoverItem['kind'], id: string, feedUrl?: string): DiscoverItem => ({ kind, key: id, episode: card(id, feedUrl) });
const none = { feeds: new Set<string>(), blocked: new Set<string>() };

const OLD: Discover = { picks: [item('pick', 'p1')], talkedAbout: [item('talkedAbout', 't1')], trending: [item('trending', 'c1'), item('trending', 'c2')], stale: false, serverTime: '2026-09-27T00:00:00Z' };

it('an older server (no M10 fields) still gives picks and a chart, and no empty new sections', () => {
  const m = buildModel(OLD, undefined, none);
  expect(m.picks.map((p) => p.key)).toEqual(['p1']);
  expect(m.chart.map((t) => t.key)).toEqual(['top', 'talked']);
  expect(m.shows).toEqual([]);
  expect(m.collections).toEqual([]);
  expect(m.said).toEqual([]);
  expect(m.newShows).toEqual([]);
  expect(m.video).toEqual([]);
  expect(m.followedHere).toBeUndefined();
  expect(m.forYou).toEqual([]);
});

it('nothing at all (first launch offline) is an empty model, not a crash', () => {
  const m = buildModel(undefined, undefined, none);
  expect(m.chart).toEqual([]);
  expect(m.picks).toEqual([]);
});

it('a hidden show leaves every list', () => {
  const hid = 'https://f/hidden.xml';
  const body: Discover = {
    ...OLD,
    picks: [item('pick', 'p1'), item('pick', 'p2', hid)],
    trending: [item('trending', 'c1', hid)],
    shows: [{ feedUrl: hid, title: 'H', author: 'a', genres: [] }, { feedUrl: 'https://f/ok.xml', title: 'OK', author: 'a', genres: [] }],
    collections: [{ id: 'x', title: 'X', items: [item('pick', 'k1', hid)] }],
    followedHere: { total: 2, shows: [{ feedUrl: hid, title: 'H', followers: 3 }] },
    said: [{ commentId: 'm1', authorId: 'l1', body: 'hi', createdAt: '2026-09-27T00:00:00Z', episode: card('s1', hid) }],
    newShows: [{ show: { feedUrl: hid, title: 'H', author: 'a', genres: [], episodeCount: 2 }, episode: card('n1', hid) }],
  };
  const m = buildModel(body, undefined, { feeds: new Set([hid]), blocked: new Set() });
  const json = JSON.stringify(m);
  expect(json).not.toContain(hid);
  expect(m.picks.map((p) => p.key)).toEqual(['p1']);
  expect(m.collections).toEqual([]); // its only item was hidden, so the collection goes too
  expect(m.followedHere).toBeUndefined();
  expect(m.chart.map((t) => t.key)).toEqual(['talked']);
});

it('a blocked listener\'s comment is not shown', () => {
  const body: Discover = { ...OLD, said: [
    { commentId: 'm1', authorId: 'blocked', body: 'no', createdAt: '2026-09-27T00:00:00Z', episode: card('s1') },
    { commentId: 'm2', authorId: 'fine', body: 'yes', createdAt: '2026-09-27T00:00:00Z', episode: card('s2') },
  ] };
  expect(buildModel(body, undefined, { feeds: new Set(), blocked: new Set(['blocked']) }).said.map((s) => s.commentId)).toEqual(['m2']);
});

it('For You keeps each row\'s original rank, for the outbox', () => {
  const fy = { items: [{ episode: card('a'), channel: 'pick' as const, reason: 'r', score: 1 }, { episode: card('b'), channel: 'chart' as const, reason: 'r2', score: 1 }], computedAt: '', stale: false, similarityAge: null, serverTime: '' };
  expect(buildModel(OLD, fy, none).forYou.map((r) => [r.card.id, r.index])).toEqual([['a', 0], ['b', 1]]);
});

it('pages of three, stats and ago', () => {
  expect(pages([1, 2, 3, 4, 5, 6, 7])).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  expect(statsLine({ listeners: 12, comments: 1 })).toBe('12 listened · 1 comment');
  expect(statsLine({ listeners: 0, comments: 0 })).toBe('');
  expect(statsLine(undefined)).toBe('');
  const now = Date.parse('2026-09-27T12:00:00Z');
  expect(ago('2026-09-27T11:30:00Z', now)).toBe('just now');
  expect(ago('2026-09-27T01:00:00Z', now)).toBe('11 h ago');
  expect(ago('2026-09-24T12:00:00Z', now)).toBe('3 d ago');
});
