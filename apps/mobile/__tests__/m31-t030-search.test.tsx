// Tests Search as drawn: the low zone, the idle page, the five result tabs (Moments is new), the empty states.
/**
 * M31 T030 (design-pulse2 `discover.html`: `search--screen`, `search--results`, `search--results-episodes`,
 * `search--results-moments`, `search--empty`, `search--people-empty`, `home--search-overlay`, `toast--tell-editors`).
 * Sizes and places are read off the render: the field 48 tall with radius 18 and a ring that turns hot once
 * something is typed; the tabs All · Shows · Episodes · Moments (NEW) · People; the Published chips only above
 * All and Episodes; Search's name only while the box is empty, Scan until something is typed and then ✕; the
 * mosaic of shows (best match 2 x 2, the others 1 x 2, 178 tall, the Subscribe button 34); episode cards 270 x
 * 170; Moments tiles 230 tall; and the Moments tab's rule — the Moments feed's list, kept where the episode,
 * the show or a comment holds the term.
 *
 * The breaks that turn it red (each tried once, 2026-10-28): draw the Published chips above Shows; leave the
 * Moments tab out; keep the Scan mark when something is typed; put a tile's padding on the tile itself (a lone
 * last tile came out 28 wider — the bug the T030 capture found); let `momentsMatching` ignore comments; draw
 * the best match like the others.
 */
import { createElement } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SearchZone } from '@/ui/search/SearchZone';
import { SearchHome, Suggestions } from '@/ui/search/SearchHome';
import { ShowDeck, ShowMosaic, type ShowActions } from '@/ui/search/ShowResults';
import { EpisodeDeck, EpisodeList, type EpisodeActions } from '@/ui/search/EpisodeResults';
import { MomentDeck, MomentGrid, type MomentResultsState } from '@/ui/search/MomentResults';
import { PeopleGrid } from '@/ui/search/PeopleResults';
import { SearchResults } from '@/ui/search/SearchResults';
import { TellEditors } from '@/ui/search/TellEditors';
import { momentsMatching } from '@/ui/search/moments-search';
import { TABS, SINCE } from '@/ui/search/search-tabs';
import type { Moment } from '@/discover/moments-api';
import type { RichEpisode } from '@/discover/explore-api';
import type { ShowCard } from '@/social/api';

const mockToast = jest.fn();
const mockTell = jest.fn();
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined, set: () => undefined }, feedCache: {} }), useToast: () => (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/social/api-m22-discover', () => ({ useM22DiscoverApi: () => mockApi }));
const mockApi = { tellEditors: (...a: unknown[]) => mockTell(...a) };
jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: () => ({ buckets: undefined, durationMs: undefined, comments: undefined, mine: undefined }) }));

const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); mockToast.mockReset(); mockTell.mockReset(); });
function render(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  mounted.push(r);
  return r;
}
/** The control carrying this name that takes a tap, outermost first (a wrapper component may carry the name too). */
const all = (r: ReactTestRenderer, label: string): ReactTestInstance[] => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
const one = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const found = all(r, label).filter((n, _i, arr) => !arr.includes(n.parent as ReactTestInstance));
  if (found.length !== 1) throw new Error(`${found.length} buttons named "${label}"`);
  return found[0]!;
};
const has = (r: ReactTestRenderer, label: string): boolean => all(r, label).length > 0;
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));
const edgeLabels = (r: ReactTestRenderer): string[] => r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'header').map((n) => String(n.props['accessibilityLabel']));
const sized = (r: ReactTestRenderer, w: number | undefined, h: number): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && flat(n)['height'] === h && (w === undefined || flat(n)['width'] === w));

// ---------- the Moments tab's rule
const moment = (over: Partial<Moment> & { episodeId: string }): Moment => ({ showTitle: 'Show', episodeTitle: 'Episode', startMs: 872_000, endMs: 910_000, reactions: 41, rank: 1, followed: false, comments: [], ...over });

describe('which Moments match (the Moments tab filters the feed\'s list on the phone)', () => {
  const list = [
    moment({ episodeId: 'a', episodeTitle: 'The journey home', comments: [{ id: '1', author: 'Rui', text: 'the part I replay', likes: 1 }] }),
    moment({ episodeId: 'b', showTitle: 'Journey Notes', episodeTitle: 'Other' }),
    moment({ episodeId: 'c', episodeTitle: 'Bread', comments: [{ id: '2', author: 'Ana', text: 'a journey of one loaf', likes: 3 }, { id: '3', author: 'Jo', text: 'first', likes: 0 }] }),
    moment({ episodeId: 'd', episodeTitle: 'Rent' }),
  ];
  it('keeps those whose episode, show or comment holds the term, any case; none for an empty term', () => {
    expect(momentsMatching(list, 'JOURNEY').map((h) => h.moment.episodeId)).toEqual(['a', 'b', 'c']);
    expect(momentsMatching(list, '  ')).toEqual([]);
    expect(momentsMatching(list, 'zzz')).toEqual([]);
  });
  it('the line on the tile is the first comment that matches, else the first comment, else nothing', () => {
    const hits = momentsMatching(list, 'journey');
    expect(hits.map((h) => h.line)).toEqual(['the part I replay', '', 'a journey of one loaf']);
    // `a` matched by its title: no comment says "journey", so its first comment is the line.
    expect(momentsMatching(list, 'bread')[0]!.line).toBe('a journey of one loaf');
  });
});

// ---------- the zone
const zoneProps = (over: Record<string, unknown> = {}) => ({
  bottom: 6, results: false, tab: 'all' as const, onTab: jest.fn(), since: 'any' as const, onSince: jest.fn(), term: '', placeholder: 'Search shows and episodes, or paste a feed URL', autoFocus: false,
  onChangeText: jest.fn(), onSubmit: jest.fn(), onClear: jest.fn(), onCancel: jest.fn(), onScan: jest.fn(),
  field: { ref: { current: null }, onLayout: jest.fn(), style: {} }, fadeIn: new Animated.Value(1).interpolate({ inputRange: [0, 1], outputRange: [0, 1] }), ...over,
});
describe('the low zone (search--screen, search--results)', () => {
  it('sits at the given distance from the foot with the gutter at its sides; the field is 48 tall, radius 18, the line ring until something is typed', () => {
    const r = render(createElement(SearchZone, zoneProps({ bottom: 6 })));
    const zone = r.root.findAll((n) => typeof n.type === 'string' && flat(n)['bottom'] === 6 && flat(n)['zIndex'] === 20)[0]!;
    expect([flat(zone)['paddingHorizontal'], flat(zone)['gap']]).toEqual([20, 10]);
    const field = r.root.findAll((n) => typeof n.type === 'string' && flat(n)['height'] === 48 && flat(n)['borderRadius'] === 18)[0]!;
    expect(String(field.props['className'])).toMatch(/border-line/);
    // Typed: the ring turns hot.
    const typed = render(createElement(SearchZone, zoneProps({ term: 'Journey' })));
    const field2 = typed.root.findAll((n) => typeof n.type === 'string' && flat(n)['height'] === 48 && flat(n)['borderRadius'] === 18)[0]!;
    expect(String(field2.props['className'])).toMatch(/border-hot/);
  });
  it('with nothing typed: the name "Search" and the Scan mark; typed: no name, and ✕ takes the Scan mark\'s place', () => {
    const empty = render(createElement(SearchZone, zoneProps()));
    expect(words(empty)).toContain('Search');
    expect(has(empty, 'Scan a QR code')).toBe(true);
    expect(has(empty, 'Clear search')).toBe(false);
    const onClear = jest.fn();
    const typed = render(createElement(SearchZone, zoneProps({ term: 'Journey', onClear })));
    expect(words(typed)).not.toContain('Search');
    expect(has(typed, 'Scan a QR code')).toBe(false);
    act(() => { one(typed, 'Clear search').props['onPress'](); });
    expect(onClear).toHaveBeenCalled();
  });
  it('Cancel and Scan do what they did', () => {
    const p = zoneProps();
    const r = render(createElement(SearchZone, p));
    act(() => { one(r, 'Cancel').props['onPress'](); });
    expect(p.onCancel).toHaveBeenCalled();
    act(() => { one(r, 'Scan a QR code').props['onPress'](); });
    expect(p.onScan).toHaveBeenCalled();
  });
  it('no tabs before a search; on a result page five, Moments marked NEW, the chosen one selected, each changes the tab', () => {
    expect(render(createElement(SearchZone, zoneProps())).root.findAll((n) => n.props['accessibilityRole'] === 'tab')).toHaveLength(0);
    const p = zoneProps({ results: true, tab: 'moments', term: 'Journey' });
    const r = render(createElement(SearchZone, p));
    const tabs = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'tab');
    expect(tabs.map((t) => t.props['accessibilityLabel'])).toEqual(['All', 'Shows', 'Episodes', 'Moments', 'People']);
    expect(tabs.map((t) => t.props['accessibilityState'])).toEqual([{ selected: false }, { selected: false }, { selected: false }, { selected: true }, { selected: false }]);
    expect(words(r)).toContain('NEW');
    expect(TABS.find((t) => t.key === 'moments')?.isNew).toBe(true);
    act(() => { one(r, 'Shows').props['onPress'](); });
    expect(p.onTab).toHaveBeenCalledWith('shows');
    // The chosen tab's underline is hot, 2 thick.
    expect([flat(tabs[3]!)['borderBottomWidth'], flat(tabs[3]!)['borderBottomColor']]).toEqual([2, '#ff4d6d']);
    expect(flat(tabs[0]!)['borderBottomColor']).toBe('transparent');
  });
  it('F2a: the Published chips are not drawn when nothing matches (search--empty) — unless a date filter is on, so it can be undone', () => {
    const base = { results: true, tab: 'all' as const };
    expect(has(render(createElement(SearchZone, zoneProps({ ...base, nothing: false }))), 'Published: Any')).toBe(true);
    expect(has(render(createElement(SearchZone, zoneProps({ ...base, nothing: true }))), 'Published: Any')).toBe(false);
    expect(has(render(createElement(SearchZone, zoneProps({ ...base, nothing: true, since: '30d' }))), 'Published: Any')).toBe(true);
  });
  it('the Published chips are above All and Episodes only (they are for episodes), 30 tall, the chosen one light', () => {
    const shown = (tab: 'all' | 'shows' | 'episodes' | 'moments' | 'people') => render(createElement(SearchZone, zoneProps({ results: true, tab, term: 'J' }))).root.findAll((n) => n.props['accessibilityRole'] === 'radiogroup').length > 0;
    expect([shown('all'), shown('episodes'), shown('shows'), shown('moments'), shown('people')]).toEqual([true, true, false, false, false]);
    const p = zoneProps({ results: true, term: 'J', since: '30d' });
    const r = render(createElement(SearchZone, p));
    const chips = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'radio');
    expect(chips).toHaveLength(SINCE.length);
    expect(chips.map((c) => flat(c)['height'])).toEqual([30, 30, 30]);
    expect(chips.map((c) => c.props['accessibilityState'])).toEqual([{ checked: false }, { checked: true }, { checked: false }]);
    act(() => { one(r, 'Published: Last 6 months').props['onPress'](); });
    expect(p.onSince).toHaveBeenCalledWith('180d');
  });
});

// ---------- the idle page
describe('Search with nothing sent (search--screen, home--search-overlay)', () => {
  const props = () => ({ history: ['morning routines', 'bread'], tryThese: ['sleep stories', 'true crime', 'learn Spanish'], onSearch: jest.fn(), onClear: jest.fn(), onGenre: jest.fn(), onBrowse: jest.fn() });
  it('Recent chips (36) with a Clear chip, Try tiles 56 tall numbered from 1, Genres tiles 72 tall; the edge labels name them', () => {
    const p = props();
    const r = render(createElement(SearchHome, p));
    expect(edgeLabels(r)).toEqual(['Recent', 'Try searching', 'Categories']);
    expect(flat(one(r, 'Search for bread'))['height']).toBe(36);
    expect(sized(r, undefined, 56)).toHaveLength(3);
    expect(words(r)).toEqual(expect.arrayContaining(['1', '2', '3', 'sleep stories', 'Clear']));
    const tiles = r.root.findAll((n) => typeof n.type === 'string' && flat(n)['height'] === 72 && flat(n)['borderRadius'] === 22);
    expect(tiles.length).toBeGreaterThan(1);
    act(() => { one(r, 'Search for bread').props['onPress'](); });
    expect(p.onSearch).toHaveBeenCalledWith('bread');
    act(() => { one(r, 'Search for true crime').props['onPress'](); });
    expect(p.onSearch).toHaveBeenCalledWith('true crime');
    act(() => { one(r, 'Clear recent searches').props['onPress'](); });
    expect(p.onClear).toHaveBeenCalled();
    act(() => { one(r, 'Browse categories').props['onPress'](); });
    expect(p.onBrowse).toHaveBeenCalled();
  });
  it('a genre tile keeps its padding inside, so a tile alone in its row is as wide as the empty cell beside it (T030 capture)', () => {
    const r = render(createElement(SearchHome, props()));
    const tile = all(r, 'Business').find((n) => n.props['style'] !== undefined)!;
    expect(flat(tile)['padding']).toBeUndefined();
    expect(flat(tile)['flex']).toBe(1);
  });
  it('no history, no Recent; no words, no Try', () => {
    const r = render(createElement(SearchHome, { ...props(), history: [], tryThese: [] }));
    expect(edgeLabels(r)).toEqual(['Categories']);
  });
  it('typing: the term, matching shows, names to search for (52 tall rows); a pasted address opens as a feed', () => {
    const onSearch = jest.fn();
    const onShow = jest.fn();
    const shows = [{ feedUrl: 'https://f/a.xml', title: 'Journey Home', author: 'A', genres: [] }] as ShowCard[];
    const r = render(createElement(Suggestions, { term: 'jour', isFeed: false, shows, names: ['Journey to sleep'], onSearch, onShow }));
    expect(flat(one(r, 'Search for jour'))['minHeight']).toBe(52);
    act(() => { one(r, 'Open Journey Home').props['onPress'](); });
    expect(onShow).toHaveBeenCalledWith('https://f/a.xml');
    act(() => { one(r, 'Search for Journey to sleep').props['onPress'](); });
    expect(onSearch).toHaveBeenCalledWith('Journey to sleep');
    const feed = render(createElement(Suggestions, { term: 'https://example.com/feed.xml', isFeed: true, shows: [], names: [], onSearch, onShow }));
    act(() => { one(feed, 'Open feed https://example.com/feed.xml').props['onPress'](); });
    expect(onShow).toHaveBeenCalledWith('https://example.com/feed.xml');
  });
});

// ---------- shows
const show = (id: string, author = `Author ${id}`): ShowCard => ({ feedUrl: `https://f/${id}.xml`, title: `Show ${id}`, author, genres: [] });
const showActions = (on: string[] = [], lib: string[] = []): ShowActions & { onOpen: jest.Mock; onToggle: jest.Mock } => ({ isSubscribed: (f) => on.includes(f), inLibrary: (f) => lib.includes(f), onOpen: jest.fn(), onToggle: jest.fn() });
describe('Shows (search--results)', () => {
  it('the mosaic: the best match is a full-width tile 178 tall with "BEST MATCH"; the others 1 x 2, 178 tall; the button is 34', () => {
    const a = showActions(['https://f/b.xml']);
    const r = render(createElement(ShowMosaic, { shows: [show('a'), show('b'), show('c')], term: 'show', actions: a }));
    expect(words(r)).toContain('BEST MATCH');
    expect(sized(r, undefined, 178)).toHaveLength(3);
    // The best match has no flex share (it takes the row); the others share one.
    const tiles = sized(r, undefined, 178);
    expect(tiles.map((t) => flat(t)['flex'])).toEqual([undefined, 1, 1]);
    // Subscribe (light, 34) and Subscribed (quiet).
    expect(flat(one(r, 'Subscribe to Show a'))['height']).toBe(34);
    expect(String(one(r, 'Subscribe to Show a').props['className'])).toMatch(/bg-text/);
    expect(String(one(r, 'Unsubscribe from Show b').props['className'])).toMatch(/bg-raise/);
    act(() => { one(r, 'Subscribe to Show a').props['onPress'](); });
    expect(a.onToggle).toHaveBeenCalledWith('https://f/a.xml');
    act(() => { one(r, 'Show c, Author c').props['onPress'](); });
    expect(a.onOpen).toHaveBeenCalledWith('https://f/c.xml');
  });
  it('a tile keeps its padding inside, so a last tile alone in its row is as wide as the empty cell beside it (T030 capture)', () => {
    const r = render(createElement(ShowMosaic, { shows: [show('a'), show('b')], term: 'show', actions: showActions() }));
    const tiles = sized(r, undefined, 178);
    for (const t of tiles) expect(flat(t)['padding']).toBeUndefined();
    // The row with one tile has an empty cell of the same share.
    let row: ReactTestInstance | null = tiles[1]!.parent;
    while (row !== null && !(typeof row.type === 'string' && String(row.props['className']).includes('flex-row'))) row = row.parent;
    expect(row!.findAll((n) => typeof n.type === 'string' && flat(n)['flex'] === 1 && flat(n)['minWidth'] === 0).length).toBeGreaterThanOrEqual(2);
  });
  it('"in your library" follows the author', () => {
    const r = render(createElement(ShowMosaic, { shows: [show('a')], term: 'a', actions: showActions([], ['https://f/a.xml']) }));
    expect(words(r).join('|')).toContain('Author a · in your library');
  });
  it('the All tab\'s deck: cards 150 x 150, "More shows ›" only when the Shows tab has more', () => {
    const onMore = jest.fn();
    const r = render(createElement(ShowDeck, { shows: [show('a'), show('b')], term: 's', actions: showActions(), more: true, onMore }));
    expect(sized(r, 150, 150)).toHaveLength(2);
    act(() => { one(r, 'More shows').props['onPress'](); });
    expect(onMore).toHaveBeenCalled();
    expect(has(render(createElement(ShowDeck, { shows: [show('a')], term: 's', actions: showActions(), more: false, onMore })), 'More shows')).toBe(false);
    expect(render(createElement(ShowDeck, { shows: [], term: 's', actions: showActions(), more: false, onMore })).toJSON()).toBeNull();
  });
});

// ---------- episodes
const ep = (id: string, stats?: { listeners: number; comments: number }): RichEpisode => ({ id, feedUrl: `https://f/${id}.xml`, guid: id, title: `The journey ${id}`, showTitle: `Show ${id}`, enclosureUrl: `https://a/${id}.mp3`, ...(stats ? { stats } : {}) });
const epActions = (lib: string[] = []): EpisodeActions & { onOpen: jest.Mock; onPlay: jest.Mock; onMore: jest.Mock } => ({ inLibrary: (id) => lib.includes(id), onOpen: jest.fn(), onPlay: jest.fn(), onMore: jest.fn() });
describe('Episodes (search--results-episodes)', () => {
  it('cards 270 x 170 in a deck; "In your library" in the caption; the counts; ···, Play and open do their old things', () => {
    const a = epActions(['e1']);
    const r = render(createElement(EpisodeDeck, { episodes: [ep('e1', { listeners: 12, comments: 3 }), ep('e2')], term: 'journey', actions: a, more: true, onMore: jest.fn() }));
    expect(sized(r, 270, 170)).toHaveLength(2);
    expect(words(r).join('|')).toContain('Show e1 · In your library');
    expect(words(r)).toContain('12 listened · 3 comments');
    act(() => { one(r, 'The journey e1, Show e1. In your library').props['onPress'](); });
    expect(a.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
    act(() => { one(r, 'More for The journey e2').props['onPress'](); });
    expect(a.onMore).toHaveBeenCalledWith(expect.objectContaining({ id: 'e2' }));
    act(() => { one(r, 'Play The journey e2').props['onPress'](); });
    expect(a.onPlay).toHaveBeenCalledWith(expect.objectContaining({ id: 'e2' }));
    expect(flat(one(r, 'Play The journey e2'))['width']).toBe(38);
    expect(has(r, 'More episodes')).toBe(true);
  });
  it('the Episodes tab stacks the cards one under another', () => {
    const r = render(createElement(EpisodeList, { episodes: [ep('e1'), ep('e2'), ep('e3')], term: 'j', actions: epActions() }));
    expect(all(r, 'Play The journey e1')).not.toHaveLength(0);
    expect(r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === 'deck-card')).toHaveLength(3);
  });
});

// ---------- moments
const state = (over: Partial<MomentResultsState> = {}): MomentResultsState => ({ status: 'ready', hits: momentsMatching([moment({ episodeId: 'a', episodeTitle: 'A journey', comments: [{ id: '1', author: 'Rui', text: 'this journey changed how I wake up', likes: 1 }] }), moment({ episodeId: 'b', episodeTitle: 'Journey two', startMs: 366_000, reactions: 2400 })], 'journey'), ...over });
describe('Moments (search--results-moments, NEW)', () => {
  it('tiles 230 tall: the timestamp, the matching comment, "n reacted"; a tap plays from the moment', () => {
    const onPlay = jest.fn();
    // F2a: a chip's minutes are zero-padded, as drawn (06:06 not 6:06).
    const r = render(createElement(MomentGrid, { results: state(), onPlay }));
    expect(sized(r, undefined, 230).length).toBeGreaterThanOrEqual(2);
    expect(words(r)).toEqual(expect.arrayContaining(['14:32', '“this journey changed how I wake up”', '41 reacted', '06:06', '2.4k reacted']));
    act(() => { one(r, 'Play A journey from 14:32. 41 reacted').props['onPress'](); });
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ episodeId: 'a' }));
  });
  it('nothing matches: "No moments match."; still loading: no such line', () => {
    expect(words(render(createElement(MomentGrid, { results: { status: 'ready', hits: [] }, onPlay: jest.fn() })))).toContain('No moments match.');
    expect(words(render(createElement(MomentGrid, { results: { status: 'loading', hits: [] }, onPlay: jest.fn() })))).not.toContain('No moments match.');
  });
  it('the All tab shows a few as a deck with "More moments ›" when the tab has more; none matching, no deck', () => {
    const many: MomentResultsState = { status: 'ready', hits: Array.from({ length: 6 }, (_, i) => ({ moment: moment({ episodeId: `m${i}`, startMs: i * 1000 }), line: 'x' })) };
    const onMore = jest.fn();
    const r = render(createElement(MomentDeck, { results: many, limit: 4, onPlay: jest.fn(), onMore }));
    // Four of the six, each a tile 160 wide and 230 tall (the first four start times are on the page, the fifth is not).
    expect(sized(r, 160, 230).length).toBeGreaterThanOrEqual(4);
    expect(words(r)).toEqual(expect.arrayContaining(['00:00', '00:01', '00:02', '00:03']));
    expect(words(r)).not.toContain('00:04');
    act(() => { one(r, 'More moments').props['onPress'](); });
    expect(onMore).toHaveBeenCalled();
    expect(render(createElement(MomentDeck, { results: { status: 'ready', hits: [] }, limit: 4, onPlay: jest.fn(), onMore })).toJSON()).toBeNull();
  });
});

// ---------- people
describe('People (search--people-empty)', () => {
  it('avatar tiles 84 tall with the name and "Listener"; a tile opens the profile', () => {
    const onOpen = jest.fn();
    const r = render(createElement(PeopleGrid, { people: [{ id: 'u1', displayName: 'Rui Costa' }, { id: 'u2', displayName: null }], term: 'rui', loading: false, none: false, onOpen }));
    expect(sized(r, undefined, 84)).toHaveLength(2);
    expect(words(r).filter((w) => w === 'Listener')).toHaveLength(2);
    act(() => { one(r, 'Rui Costa').props['onPress'](); });
    expect(onOpen).toHaveBeenCalledWith({ id: 'u1', displayName: 'Rui Costa' });
  });
  it('nobody: a 72 round mark and "No one by that name."', () => {
    const r = render(createElement(PeopleGrid, { people: [], term: 'zz', loading: false, none: true, onOpen: jest.fn() }));
    expect(words(r)).toContain('No one by that name.');
    expect(sized(r, 72, 72)).toHaveLength(1);
  });
});

// ---------- the result page
describe('the result page', () => {
  const props = (tab: 'all' | 'shows' | 'episodes' | 'moments' | 'people', over: Record<string, unknown> = {}) => ({
    tab, onTab: jest.fn(), term: 'journey', catalogue: { kind: 'ok' as const }, shows: [show('a'), show('b'), show('c'), show('d')], episodes: [ep('e1'), ep('e2')], nothing: false,
    showActions: showActions(), episodeActions: epActions(), moments: state(), onPlayMoment: jest.fn(), people: { loading: false, people: [{ id: 'u', displayName: 'Journey Fan' }], loaded: true }, onOpenPerson: jest.fn(), ...over,
  });
  it('All: a deck each of Shows (3 of 4, "More shows ›"), Episodes and People — no Moments (F2a: the drawn All has none; they are the Moments tab)', () => {
    const p = props('all', { moments: state() });
    const r = render(createElement(SearchResults, p));
    expect(edgeLabels(r)).toEqual(['Shows', 'Episodes', 'People']);
    expect(sized(r, 150, 150)).toHaveLength(3);
    act(() => { one(r, 'More shows').props['onPress'](); });
    expect(p.onTab).toHaveBeenCalledWith('shows');
  });
  it('Shows: the mosaic; Episodes: the cards; Moments: the tiles; People: the tiles', () => {
    expect(words(render(createElement(SearchResults, props('shows'))))).toContain('BEST MATCH');
    expect(all(render(createElement(SearchResults, props('episodes'))), 'Play The journey e1')).not.toHaveLength(0);
    expect(words(render(createElement(SearchResults, props('moments'))))).toContain('14:32');
    expect(words(render(createElement(SearchResults, props('people'))))).toContain('Listener');
  });
  it('nothing found: the empty block and "Can\'t find it? Tell us"; a catalogue that needs a connection is a warn line', () => {
    const r = render(createElement(SearchResults, props('all', { nothing: true, shows: [], episodes: [], catalogue: { kind: 'error', message: 'The catalogue needs a connection — showing your library only.' } })));
    expect(words(r)).toContain('The catalogue needs a connection — showing your library only.');
    expect(all(r, "Can't find it? Tell the editors you searched for journey")).not.toHaveLength(0);
  });
  it('F2a: the empty block starts 160 from the screen top, the People block 220 (drawn center(…,160) / center(…,220))', () => {
    const empty = render(createElement(SearchResults, props('all', { nothing: true, shows: [], episodes: [], top: 60 })));
    expect(flat(empty.root.findByProps({ testID: 'search-empty-block' }))['marginTop']).toBe(105);
    const people = render(createElement(SearchResults, props('people', { top: 60, people: { loading: false, people: [], loaded: true } })));
    const mark = people.root.findAll((n) => typeof n.type === 'string' && flat(n)['marginTop'] === 160);
    expect(mark.length).toBeGreaterThan(0);
    // centred on the screen, not on the 28 / 16 margins (drawn x 76 for a 238 wide line; the build was +6): the block spans the full width.
    expect(flat(mark[0]!)).toMatchObject({ marginLeft: -28, marginRight: -16 });
  });
  it('People tab: the connection message shows as a warn line', () => {
    const r = render(createElement(SearchResults, props('people', { people: { loading: false, people: [], loaded: false, error: 'Finding people needs a connection.' } })));
    expect(words(r)).toContain('Finding people needs a connection.');
  });
});

// ---------- tell the editors
describe('"Can\'t find it? Tell us" (search--empty, toast--tell-editors)', () => {
  it('sends the words; then says thanks', async () => {
    mockTell.mockResolvedValue(undefined);
    const r = render(createElement(TellEditors, { q: 'zzzqqqxx' }));
    await act(async () => { one(r, "Can't find it? Tell the editors you searched for zzzqqqxx").props['onPress'](); });
    expect(mockTell).toHaveBeenCalledWith('zzzqqqxx');
    expect(words(r).join(' ')).toContain('Thanks — our editors will look for “zzzqqqxx”.');
  });
  it('a failed send keeps the button and toasts', async () => {
    mockTell.mockRejectedValue(new Error('offline'));
    const r = render(createElement(TellEditors, { q: 'zzzqqqxx' }));
    await act(async () => { one(r, "Can't find it? Tell the editors you searched for zzzqqqxx").props['onPress'](); });
    expect(mockToast).toHaveBeenCalledWith("Couldn't send — try again when you're online.");
    expect(all(r, "Can't find it? Tell the editors you searched for zzzqqqxx")).not.toHaveLength(0);
  });
});
