// Tests M25 lane AL on the phone: the owner's category pins stay in place under every chip, hides stay gone, and the split Discover sections.
/**
 * Guard G-AL-A1, phone half (the server half is apps/api/test/m25-lists.test.ts): a show the owner
 * pinned on a category is first under For you, Hot AND Newest; a hidden one (left out by the
 * server) never comes back from a later page. The break that turns it red: in `categoryList`
 * (src/discover/category-list.ts) return `sorted` instead of `keepPinnedInPlace(kept, sorted, isPinned)`.
 *
 * A5: the split section ids, and an old saved layout mapped forward (`sectionOrder`).
 */
import { appendPage, categoryList, type CategorySort } from '@/discover/category-list';
import { buildModel, pickedShowsOf, sectionOrder } from '@/discover/sections';
import type { Discover, EpisodeCard, ShowCard } from '@/social/api';

const show = (feedUrl: string, publishedAt?: string, extra: Partial<ShowCard> = {}): ShowCard => ({
  feedUrl, title: feedUrl, author: 'a', genres: [], ...(publishedAt ? { latestEpisode: { title: 't', publishedAt } } : {}), ...extra,
});

// What the server sends for page 0 after the owner pinned P (slot 1) and hid H: P first, marked; H gone.
const PAGE0 = [
  show('P', '2020-01-01T00:00:00Z', { pinned: true }),
  show('a', '2026-10-01T00:00:00Z'),
  show('b', '2026-10-07T00:00:00Z'),
  show('c', '2026-10-03T00:00:00Z'),
];
const PAGE1 = [show('d', '2026-10-08T00:00:00Z'), show('e')];

describe('G-AL-A1 (phone): a pinned show stays first under every chip; a hidden one stays gone', () => {
  const subscribed = new Set(['a']);
  for (const sort of ['forYou', 'all', 'newest'] as CategorySort[]) {
    it(`${sort}: the pin is first`, () => {
      const list = categoryList(appendPage(PAGE0, PAGE1), { sort, notSubscribedOnly: false, subscribed, pinned: ['P'] });
      expect(list[0]!.feedUrl).toBe('P');
      expect(list.map((s) => s.feedUrl)).not.toContain('H');
      expect(list).toHaveLength(6);
    });
  }
  it('the rest is still sorted by the chip: Newest puts the newest episode next', () => {
    const list = categoryList(appendPage(PAGE0, PAGE1), { sort: 'newest', notSubscribedOnly: false, subscribed, pinned: ['P'] });
    expect(list.map((s) => s.feedUrl)).toEqual(['P', 'd', 'b', 'c', 'a', 'e']);
  });
  it('For you puts followed shows last, the pin still first', () => {
    const list = categoryList(PAGE0, { sort: 'forYou', notSubscribedOnly: false, subscribed, pinned: [] });
    expect(list.map((s) => s.feedUrl)).toEqual(['P', 'b', 'c', 'a']);
  });
  it('a pin at slot 2 keeps slot 2 under Newest', () => {
    const page = [show('x', '2026-01-01T00:00:00Z'), show('Q', '2019-01-01T00:00:00Z'), show('y', '2026-09-01T00:00:00Z')];
    expect(categoryList(page, { sort: 'newest', notSubscribedOnly: false, subscribed: new Set(), pinned: ['Q'] }).map((s) => s.feedUrl)).toEqual(['y', 'Q', 'x']);
  });
});

describe('A5: the split Discover sections', () => {
  it('an old layout that hid a bundle hides the parts that were drawn inside it; the category strip stays', () => {
    const order = sectionOrder({ order: ['forYou', 'picks', 'chart', 'shows', 'newShows'], hidden: ['forYou', 'shows', 'newShows', 'chart'] });
    expect(order).not.toContain('pickedShows');
    expect(order).not.toContain('premium');
    expect(order).not.toContain('hunt');
    expect(order).toContain('categories');
    expect(order.slice(0, 2)).toEqual(['picks', 'theirLikes']);
  });
  it('a new layout that names the parts keeps them as saved', () => {
    expect(sectionOrder({ order: ['premium', 'shows', 'forYou', 'pickedShows'], hidden: ['forYou'] }).slice(0, 3)).toEqual(['premium', 'shows', 'pickedShows']);
  });
  it('Shows picked for you is its own switch: shown with For You hidden (a layout that names it), and each show once', () => {
    const card = (id: string, feedUrl: string): EpisodeCard => ({ id, feedUrl, guid: id, title: id, showTitle: `S ${feedUrl}`, enclosureUrl: `https://a/${id}.mp3` });
    const forYou = { items: [card('1', 'f1'), card('2', 'f1'), card('3', 'f2')].map((episode) => ({ episode, channel: 'chart', reason: 'r', score: 1 })) } as never;
    const body = { picks: [], talkedAbout: [], trending: [], stale: false, serverTime: '2026-10-08T00:00:00Z', layout: { order: ['pickedShows'], hidden: ['forYou'] } } as unknown as Discover;
    const m = buildModel(body, forYou, { feeds: new Set(), blocked: new Set() });
    expect(m.forYou).toEqual([]);
    expect(m.pickedShows.map((s) => s.feedUrl)).toEqual(['f1', 'f2']);
    expect(pickedShowsOf([])).toEqual([]);
  });
});
