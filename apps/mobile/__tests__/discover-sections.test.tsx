// Tests that Discover rows open and play episodes, and chart tabs switch lists.
/**
 * M10's Discover sections: a row's body opens the episode and its round button plays it;
 * the chart's tabs switch lists. The break that turns the first test red: make
 * `PlayButton`'s onPress in `src/ui/discover/parts.tsx` call nothing.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { ChartSection, PicksSection, SaidSection } from '@/ui/discover/sections';
import type { EpisodeCard } from '@/social/api';
// M10b US4: the component reads its palette through useStores(); pin it to light so the
// colour assertions compare against `colour`, whatever the runner's system scheme is.
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => 'light' } }) }));
// The decks read no heat curve here (a card that wants one asks the server).
jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: () => ({ buckets: undefined, durationMs: undefined, comments: undefined, mine: undefined }) }));

const card = (id: string): EpisodeCard => ({ id, feedUrl: `https://f/${id}.xml`, guid: id, title: `Title ${id}`, showTitle: `Show ${id}`, enclosureUrl: `https://a/${id}.mp3` });
const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance =>
  r.root.find((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
const text = (r: ReactTestRenderer): string => JSON.stringify(r.toJSON());

it('a pick: + adds it to the queue (owner 2026-10-05), the design\'s Play pill plays it (fix F-P), the title opens', () => {
  const onOpen = jest.fn();
  const onPlay = jest.fn();
  const onQueue = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(PicksSection, { items: [{ kind: 'pick', key: 'p1', episode: card('p1'), why: 'Because.', stats: { listeners: 4, comments: 2 } }], onOpen, onPlay, onQueue })); });
  act(() => { byLabel(r, 'Add Title p1 to the queue').props['onPress'](); });
  expect(onQueue).toHaveBeenCalledWith(card('p1'));
  expect(onPlay).not.toHaveBeenCalled();
  expect(onOpen).not.toHaveBeenCalled();
  // M24 fix F-P (`Home-B`): "▶ Play" beside the "+" — both stay.
  act(() => { byLabel(r, 'Play Title p1').props['onPress'](); });
  expect(onPlay).toHaveBeenCalledWith(card('p1'));
  expect(onOpen).not.toHaveBeenCalled();
  // M24 US20 (`Home-B`): the label sits inside the card, singular.
  expect(text(r)).toContain("Editor's pick");
  act(() => { byLabel(r, 'Open Title p1').props['onPress'](); });
  expect(onOpen).toHaveBeenCalledWith(card('p1'));
  expect(text(r)).toContain('Because.');
  expect(text(r)).toContain('4 listened');
  expect(text(r)).not.toContain('2 comments'); // F2a (home--fold-a): the pick card says "n listened" only
});

it('the charts: a card each (T030), rows numbered from 1, pages of three with a "1 / 2" that turns the page', () => {
  let r!: ReactTestRenderer;
  const many = ['a', 'b', 'c', 'd', 'e'].map(card);
  const tabs = [
    { key: 'top' as const, label: 'Top', rows: many },
    { key: 'talked' as const, label: 'Talked about', rows: [card('z')] },
  ];
  const onOpen = jest.fn();
  act(() => { r = create(createElement(ChartSection, { tabs, onOpen, onPlay: jest.fn() })); });
  // Both charts are on the page at once — the deck holds a card per chart, no tab hides the other.
  expect(text(r)).toContain('Title a');
  expect(text(r)).toContain('Title z');
  expect(r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === 'deck-card')).toHaveLength(2);
  // The drawn card size: 270 x 220, a card per chart.
  const deck = r.root.find((n) => typeof n.type === 'string' && n.props['testID'] === 'deck');
  expect(deck.props['snapToInterval']).toBe(280);
  expect(StyleSheet.flatten(deck.props['style']).height).toBe(220);
  // Top has two pages (ranks 1-3, 4-5): the control says "1 / 2" and names the next page.
  expect(text(r)).toContain('1 / 2 →');
  act(() => { byLabel(r, 'Next page').props['onPress'](); });
  expect(text(r)).toContain('2 / 2 ←');
  act(() => { byLabel(r, 'Previous page').props['onPress'](); });
  expect(text(r)).toContain('1 / 2 →');
  // A row opens its episode.
  act(() => { byLabel(r, 'Title a, Show a').props['onPress'](); });
  expect(onOpen).toHaveBeenCalledWith(many[0]);
});

it('no rows, no section', () => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(ChartSection, { tabs: [], onOpen: jest.fn(), onPlay: jest.fn() })); });
  expect(r.toJSON()).toBeNull();
  act(() => { r = create(createElement(PicksSection, { items: [], onOpen: jest.fn(), onPlay: jest.fn(), onQueue: jest.fn() })); });
  expect(r.toJSON()).toBeNull();
});

it('a comment card names nobody (G6)', () => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(SaidSection, { items: [{ commentId: 'm', authorId: 'listener-7f3a', body: 'Loved the ending', createdAt: '2026-09-27T00:00:00Z', episode: card('e') }], now: Date.parse('2026-09-27T05:00:00Z'), onOpen: jest.fn(), onPlay: jest.fn() })); });
  expect(text(r)).toContain('A listener · 5 h ago');
  expect(text(r)).toContain('Loved the ending');
  // A sentinel no markup can contain by chance (the drawn icons' path data holds "l1…"): the author's id must not be drawn anywhere.
  expect(text(r)).not.toContain('listener-7f3a');
});

// M12 guard G-D2 (FR-070, FR-071): Discover links to today's picks (with every note) and the full chart. The break:
// drop the "Today's picks, with every note" link from PicksSection's deck, or the "Full chart" link from ChartSection.
// ("Past picks →" is in the pick tile at the top of the page since T025/T030: m31-discover-mosaic.test.tsx.)
it('Editor\'s picks links to the day\'s page; the chart links to the full chart', () => {
  const onDaily = jest.fn();
  const onFull = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(PicksSection, { items: [{ kind: 'pick', key: 'p1', episode: card('p1') }], onOpen: jest.fn(), onPlay: jest.fn(), onQueue: jest.fn(), onDaily })); });
  act(() => { byLabel(r, "Today's picks, with every note").props['onPress'](); });
  expect(onDaily).toHaveBeenCalledTimes(1);
  act(() => { r = create(createElement(ChartSection, { tabs: [{ key: 'top' as const, label: 'Top', rows: [card('a')] }], onOpen: jest.fn(), onPlay: jest.fn(), onFull })); });
  act(() => { byLabel(r, 'Full chart').props['onPress'](); });
  expect(onFull).toHaveBeenCalledTimes(1);
});
