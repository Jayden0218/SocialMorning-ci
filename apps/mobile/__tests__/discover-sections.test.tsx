// Tests that Discover rows open and play episodes, and chart tabs switch lists.
/**
 * M10's Discover sections: a row's body opens the episode and its round button plays it;
 * the chart's tabs switch lists. The break that turns the first test red: make
 * `PlayButton`'s onPress in `src/ui/discover/parts.tsx` call nothing.
 */
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { ChartSection, PicksSection, SaidSection } from '@/ui/discover/sections';
import type { EpisodeCard } from '@/social/api';
// M10b US4: the component reads its palette through useStores(); pin it to light so the
// colour assertions compare against `colour`, whatever the runner's system scheme is.
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => 'light' } }) }));

const card = (id: string): EpisodeCard => ({ id, feedUrl: `https://f/${id}.xml`, guid: id, title: `Title ${id}`, showTitle: `Show ${id}`, enclosureUrl: `https://a/${id}.mp3` });
const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance =>
  r.root.find((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
const text = (r: ReactTestRenderer): string => JSON.stringify(r.toJSON());

it('a pick: + adds it to the queue (owner 2026-10-05: no Play pill), the title opens', () => {
  const onOpen = jest.fn();
  const onPlay = jest.fn();
  const onQueue = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(PicksSection, { items: [{ kind: 'pick', key: 'p1', episode: card('p1'), why: 'Because.', stats: { listeners: 4, comments: 2 } }], onOpen, onPlay, onQueue })); });
  act(() => { byLabel(r, 'Add Title p1 to the queue').props['onPress'](); });
  expect(onQueue).toHaveBeenCalledWith(card('p1'));
  expect(onPlay).not.toHaveBeenCalled();
  expect(onOpen).not.toHaveBeenCalled();
  // M24 US20 (`Home-B`): the label sits inside the card, singular.
  expect(text(r)).toContain("Editor's pick");
  act(() => { byLabel(r, 'Open Title p1').props['onPress'](); });
  expect(onOpen).toHaveBeenCalledWith(card('p1'));
  expect(text(r)).toContain('Because.');
  expect(text(r)).toContain('4 listened');
  expect(text(r)).toContain('2 comments');
});

it('the chart: rows are numbered, and a tab switches the list', () => {
  let r!: ReactTestRenderer;
  const tabs = [
    { key: 'top' as const, label: 'Top', rows: [card('a'), card('b')] },
    { key: 'talked' as const, label: 'Talked about', rows: [card('z')] },
  ];
  act(() => { r = create(createElement(ChartSection, { tabs, onOpen: jest.fn(), onPlay: jest.fn() })); });
  expect(text(r)).toContain('Title a');
  expect(text(r)).not.toContain('Title z');
  act(() => { byLabel(r, 'Talked about chart').props['onPress'](); });
  expect(text(r)).toContain('Title z');
  expect(text(r)).not.toContain('Title a');
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
  act(() => { r = create(createElement(SaidSection, { items: [{ commentId: 'm', authorId: 'l1', body: 'Loved the ending', createdAt: '2026-09-27T00:00:00Z', episode: card('e') }], now: Date.parse('2026-09-27T05:00:00Z'), onOpen: jest.fn(), onPlay: jest.fn() })); });
  expect(text(r)).toContain('A listener · 5 h ago');
  expect(text(r)).toContain('Loved the ending');
  expect(text(r)).not.toContain('l1');
});

// M12 guard G-D2 (FR-070, FR-071): Discover links to past picks and the full chart. The break:
// drop the "Past picks →" link from PicksSection's card (M24: inside the card), or the "Full chart" link from ChartSection.
it('Editor\'s picks links to past picks; the chart links to the full chart', () => {
  const onPast = jest.fn();
  const onFull = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(PicksSection, { items: [{ kind: 'pick', key: 'p1', episode: card('p1') }], onOpen: jest.fn(), onPlay: jest.fn(), onQueue: jest.fn(), onPast })); });
  act(() => { byLabel(r, 'Past picks').props['onPress'](); });
  expect(onPast).toHaveBeenCalledTimes(1);
  act(() => { r = create(createElement(ChartSection, { tabs: [{ key: 'top' as const, label: 'Top', rows: [card('a')] }], onOpen: jest.fn(), onPlay: jest.fn(), onFull })); });
  act(() => { byLabel(r, 'Full chart').props['onPress'](); });
  expect(onFull).toHaveBeenCalledTimes(1);
});
