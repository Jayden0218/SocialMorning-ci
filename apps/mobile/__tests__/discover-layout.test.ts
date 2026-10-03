/**
 * Guard G-D1, phone half (specs/015-m15-admin/data-model.md, FR-026, FR-029): a section the
 * owner hides is not drawn; the owner's order is followed; no `layout` (an older server, or
 * settings the server could not read) is today's order.
 *
 * The break that turns it red: ignore `layout.hidden` in `sectionOrder`
 * (src/discover/sections.ts) — e.g. `const hidden = new Set<SectionId>();`.
 */
import { SECTION_IDS, buildModel, sectionOrder } from '@/discover/sections';
import type { Discover, DiscoverItem, EpisodeCard } from '@/social/api';

const card = (id: string): EpisodeCard => ({ id, feedUrl: `https://f/${id}.xml`, guid: id, title: `T ${id}`, showTitle: `S ${id}`, enclosureUrl: `https://a/${id}.mp3` });
const item = (kind: DiscoverItem['kind'], id: string): DiscoverItem => ({ kind, key: id, episode: card(id) });
const none = { feeds: new Set<string>(), blocked: new Set<string>() };
const BODY: Discover = {
  picks: [item('pick', 'p1')], talkedAbout: [item('talkedAbout', 't1')], trending: [item('trending', 'c1')], stale: false, serverTime: '2026-10-01T00:00:00Z',
  video: [item('trending', 'v1')],
  said: [{ commentId: 'm1', authorId: 'l1', body: 'hi', createdAt: '2026-10-01T00:00:00Z', episode: card('s1') }],
};

it('no layout → today\'s order, every section', () => {
  expect(sectionOrder(undefined)).toEqual([...SECTION_IDS]);
  expect(SECTION_IDS).toEqual(['forYou', 'picks', 'chart', 'shows', 'video', 'collections', 'followedHere', 'said', 'newShows']);
  expect(buildModel(BODY, undefined, none).order).toEqual([...SECTION_IDS]);
});

it('a hidden section is left out of the order AND emptied, so nothing draws it', () => {
  const m = buildModel({ ...BODY, layout: { order: [], hidden: ['picks', 'chart', 'said'] } }, undefined, none);
  expect(m.order).not.toContain('picks');
  expect(m.order).not.toContain('chart');
  expect(m.order).not.toContain('said');
  expect(m.picks).toEqual([]);
  expect(m.chart).toEqual([]);
  expect(m.said).toEqual([]);
  expect(m.video.map((v) => v.key)).toEqual(['v1']);
});

it('follows the owner\'s order; unlisted sections keep today\'s order after it', () => {
  const order = sectionOrder({ order: ['said', 'video', 'picks'], hidden: [] });
  expect(order.slice(0, 3)).toEqual(['said', 'video', 'picks']);
  expect(order.slice(3)).toEqual(['forYou', 'chart', 'shows', 'collections', 'followedHere', 'newShows']);
});

it('unknown ids and duplicates are ignored', () => {
  expect(sectionOrder({ order: ['nope', 'chart', 'chart'], hidden: ['alsoNope'] })).toEqual(['chart', ...SECTION_IDS.filter((s) => s !== 'chart')]);
});

it('an unreadable layout (not arrays) is today\'s order', () => {
  expect(sectionOrder({ order: 'picks', hidden: null } as never)).toEqual([...SECTION_IDS]);
});

it('every section can be hidden', () => {
  expect(sectionOrder({ order: [], hidden: [...SECTION_IDS] })).toEqual([]);
  const m = buildModel({ ...BODY, layout: { order: [], hidden: [...SECTION_IDS] } }, { items: [] } as never, none);
  expect(m.forYou).toEqual([]);
  expect(m.video).toEqual([]);
  expect(m.followedHere).toBeUndefined();
});
