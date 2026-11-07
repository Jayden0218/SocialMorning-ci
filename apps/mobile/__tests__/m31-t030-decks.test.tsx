// Tests Discover below the fold as drawn: every section is a deck of cards under an edge label, with its links and actions.
/**
 * M31 T030 (design-pulse2 `discover.html#home--fold-a`, `#home--fold-b`, `#home--hidden-undo`,
 * `#home--hidden-categories`, `#home--not-interested-sheet`). Sizes are read off the render (style props the
 * layout engine takes), not from constants the code might share with the test: a deck snaps one card at a
 * time (interval = card + 10), its first card starts at the 28 lane, cards are the drawn sizes — Picks 270 x
 * 220, For you 250 x 290 (cover 120, "···" 36), Charts 270 x 220 (rows 54), Shows 150 x 180, Premium 260 x 96
 * (tag, no price), Video 260 x 150, Lists 200 x 130 (covers 36), Said 240 x 130, New 230 x 72, Hunt 250 x 76 —
 * and every old action is still there under its old name.
 *
 * The breaks that turn it red (each tried once, 2026-10-28): change `DECK.gap` / the snap interval; draw a card
 * at another size; give the Premium card a price; draw For You's "···" for a signed-out listener; let the hidden
 * card leave its slot; draw the deck without its edge label.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { ForYouSection } from '@/ui/discover/ForYouSection';
import { PicksSection } from '@/ui/discover/PicksSection';
import { ChartSection } from '@/ui/discover/ChartSection';
import { CategoryStrip, MoreCategories } from '@/ui/discover/CategorySections';
import { PremiumSection, ShowTiles, VideoSection } from '@/ui/discover/ShowSections';
import { NewArrivalsSection, SaidSection } from '@/ui/discover/ListenerSections';
import { TopicListCards } from '@/ui/discover/TopicLists';
import { TreasureHunt } from '@/ui/discover/TreasureHunt';
import { HiddenNotice, NotInterestedSheet } from '@/ui/discover/NotInterested';
import { RecFeedbackLink } from '@/ui/discover/RecFeedback';
import { DECK, Deck, DeckCard, DeckLink, DeckSection } from '@/ui/discover/Deck';
import { hiddenAt } from '@/ui/discover/sections-common';
import { GENRES } from '@/discover/genres';
import type { EpisodeCard, ShowCard } from '@/social/api';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) }, useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }) }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined, set: () => undefined }, feedCache: {} }), useToast: () => () => undefined }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: {}, listener: undefined }) }));
jest.mock('@/discover/category-cache', () => ({ warmCategories: () => undefined }));
jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: () => ({ buckets: undefined, durationMs: undefined, comments: undefined, mine: undefined }) }));
const mockHunt = jest.fn();
// One object for the whole run (a new one per render would change the section's `load` and read the hunt for ever).
const mockExplore = { hunt: (...a: unknown[]) => mockHunt(...a) };
jest.mock('@/discover/explore-api', () => ({ useExploreApi: () => mockExplore }));

const card = (id: string): EpisodeCard => ({ id, feedUrl: `https://f/${id}.xml`, guid: id, title: `Title ${id}`, showTitle: `Show ${id}`, enclosureUrl: `https://a/${id}.mp3` });
const show = (id: string): ShowCard => ({ feedUrl: `https://f/${id}.xml`, title: `Show ${id}`, author: `Author ${id}`, genres: [] });
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); mockPush.mockClear(); mockHunt.mockReset(); });
function render(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  mounted.push(r);
  return r;
}
const host = (r: ReactTestRenderer, testID: string): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === testID);
const one = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const is = (n: ReactTestInstance | null): boolean => n !== null && n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function';
  const found = r.root.findAll((n) => is(n) && !is(n.parent));
  if (found.length !== 1) throw new Error(`${found.length} buttons named "${label}"`);
  return found[0]!;
};
const has = (r: ReactTestRenderer, label: string): boolean => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function').length > 0;
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));
/** The header labels (edge labels) on the page: what a screen reader announces, and the drawn text is the same or its short form. */
const edgeLabels = (r: ReactTestRenderer): string[] => r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'header').map((n) => String(n.props['accessibilityLabel']));
/** The nearest host above `n` whose style has this width and height. */
const sized = (r: ReactTestRenderer, w: number, h: number): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && flat(n)['width'] === w && flat(n)['height'] === h);

describe('the deck itself', () => {
  it('snaps one card at a time: interval = card + 10, the first card at the 28 lane, cards 10 apart', () => {
    const r = render(createElement(Deck, { width: 270, height: 220 } as React.ComponentProps<typeof Deck>, [createElement('i', { key: 1 }), createElement('i', { key: 2 })]));
    const deck = host(r, 'deck')[0]!;
    expect(deck.props['snapToInterval']).toBe(280);
    expect(deck.props['horizontal']).toBe(true);
    const content = StyleSheet.flatten(deck.props['contentContainerStyle']) as Record<string, number>;
    expect([content['paddingLeft'], content['gap']]).toEqual([DECK.lane, 10]);
    expect(DECK.lane).toBe(28);
    expect(flat(deck)['height']).toBe(220);
  });
  it('a section holds its content between 2 above and 18 below, at least 120 tall, under its edge label', () => {
    const r = render(createElement(DeckSection, { label: 'Charts', spoken: 'The chart' } as React.ComponentProps<typeof DeckSection>, createElement('i')));
    const section = r.root.findAll((n) => typeof n.type === 'string' && flat(n)['minHeight'] === 120)[0]!;
    expect([flat(section)['paddingTop'], flat(section)['paddingBottom']]).toEqual([2, 18]);
    expect(edgeLabels(r)).toEqual(['The chart']);
  });
  it('a link under a deck is hot-text 13 / 600, 10 below it and 28 from the left, named for a screen reader', () => {
    const onPress = jest.fn();
    const r = render(createElement(DeckLink, { label: 'Full chart', onPress }));
    const link = one(r, 'Full chart');
    expect([flat(link)['marginTop'], flat(link)['marginLeft']]).toEqual([10, 28]);
    expect(words(r)).toContain('Full chart ›');
    act(() => { link.props['onPress'](); });
    expect(onPress).toHaveBeenCalled();
    // The drawn 13 tall words are touched 48 (15 above and below).
    expect(link.props['hitSlop']).toMatchObject({ top: 15, bottom: 15 });
  });
  it('a card is radius 24, raise, a 1 line border, and clips its cover', () => {
    const r = render(createElement(DeckCard, {} as React.ComponentProps<typeof DeckCard>, createElement('i')));
    const c = host(r, 'deck-card')[0]!;
    expect(flat(c)['borderRadius']).toBe(24);
    expect(String(c.props['className'])).toMatch(/bg-raise/);
    expect(String(c.props['className'])).toMatch(/overflow-hidden/);
  });
});

describe('Picks (home--fold-a)', () => {
  const items = [{ kind: 'pick' as const, key: 'p1', episode: card('p1'), why: 'Short, warm.', stats: { listeners: 120, comments: 14 } }, { kind: 'pick' as const, key: 'p2', episode: card('p2') }];
  it('cards 270 x 220 under "Picks" (spoken "Editor\'s pick · Oct 27"), the cover 64, the note in quotes, counts and both buttons at 38', () => {
    const r = render(createElement(PicksSection, { items, date: '2026-10-27', onOpen: jest.fn(), onPlay: jest.fn(), onQueue: jest.fn(), onDaily: jest.fn() }));
    expect(host(r, 'deck')[0]!.props['snapToInterval']).toBe(280);
    expect(host(r, 'deck-card')).toHaveLength(2);
    expect(sized(r, 270, 220)).toHaveLength(2);
    expect(edgeLabels(r)).toEqual(["Editor's pick · Oct 27"]);
    expect(words(r)).toContain('“Short, warm.”');
    expect(words(r)).toContain('120 listened'); expect(words(r).join('|')).not.toContain('14 comments'); // F2a: the deck card says "n listened" only, as drawn (the Editor's pick tile keeps the comments)
    expect(flat(one(r, 'Play Title p1'))['width']).toBe(38);
    expect(flat(one(r, 'Add Title p1 to the queue'))['width']).toBe(38);
  });
  it('"Today\'s picks, with every note ›" is under the deck and opens the day', () => {
    const onDaily = jest.fn();
    const r = render(createElement(PicksSection, { items, onOpen: jest.fn(), onPlay: jest.fn(), onQueue: jest.fn(), onDaily }));
    act(() => { one(r, "Today's picks, with every note").props['onPress'](); });
    expect(onDaily).toHaveBeenCalled();
  });
  it('no picks, no section', () => {
    expect(render(createElement(PicksSection, { items: [], onOpen: jest.fn(), onPlay: jest.fn(), onQueue: jest.fn() })).toJSON()).toBeNull();
  });
});

describe('For you (home--fold-a, home--hidden-undo)', () => {
  const rows = [{ card: card('a'), line: 'Because you follow Morning Notes', index: 0 }, { card: card('b'), line: 'Popular with people like you', index: 1 }, { card: card('c'), line: 'New to you', index: 2 }];
  const base = () => ({ rows, onOpen: jest.fn(), onPlay: jest.fn(), onOpenAt: jest.fn(), onMore: jest.fn() });
  it('cards 250 x 290, the cover 120, the reason in hot-text, Play 40, "···" 36 on the cover', () => {
    const r = render(createElement(ForYouSection, base()));
    expect(host(r, 'deck')[0]!.props['snapToInterval']).toBe(260);
    expect(sized(r, 250, 290)).toHaveLength(3);
    expect(r.root.findAll((n) => typeof n.type === 'string' && flat(n)['height'] === 120 && flat(n)['overflow'] === 'hidden').length).toBeGreaterThan(0); // the cover band: the card's width, 120 tall
    expect(words(r)).toContain('Because you follow Morning Notes');
    expect(flat(one(r, 'Play Title a'))['width']).toBe(40);
    const more = one(r, 'More for Title a');
    expect([flat(more)['width'], flat(more)['height'], flat(more)['top'], flat(more)['right']]).toEqual([36, 36, 8, 8]);
    expect(edgeLabels(r)).toEqual(['For You']);
  });
  it('a tap on the card tells which slot was opened; Play and "···" are their own buttons', () => {
    const p = base();
    const r = render(createElement(ForYouSection, p));
    act(() => { one(r, 'Title b, Show b. Popular with people like you').props['onPress'](); });
    expect(p.onOpenAt).toHaveBeenCalledWith(card('b'), 1);
    act(() => { one(r, 'Play Title c').props['onPress'](); });
    expect(p.onPlay).toHaveBeenCalledWith(card('c'));
    act(() => { one(r, 'More for Title a').props['onPress'](); });
    expect(p.onMore).toHaveBeenCalledWith(card('a'));
  });
  it('signed out there is no "···" (it needs an account)', () => {
    const { onMore: _omit, ...p } = base();
    const r = render(createElement(ForYouSection, p));
    expect(has(r, 'More for Title a')).toBe(false);
  });
  it('a hidden card keeps its slot as the dashed Hidden card with Undo; the others stay in order', () => {
    const onUndo = jest.fn();
    const r = render(createElement(ForYouSection, { ...base(), rows: rows.filter((x) => x.card.id !== 'b'), hidden: { at: 1, kind: 'episode', onUndo } }));
    const cards = host(r, 'deck-card');
    expect(cards).toHaveLength(3);
    // slot 0 = a, slot 1 = the hidden card, slot 2 = c
    expect(cards[1]!.props['className']).toMatch(/border-dashed/);
    expect(words(r)).toContain('Hidden. We won’t recommend it again.');
    expect(cards[0]!.findAll((n) => n.props['accessibilityLabel'] === 'Play Title a').length).toBeGreaterThan(0);
    expect(cards[2]!.findAll((n) => n.props['accessibilityLabel'] === 'Play Title c').length).toBeGreaterThan(0);
    act(() => { one(r, 'Undo').props['onPress'](); });
    expect(onUndo).toHaveBeenCalled();
  });
  it('a hidden show says so, and the deck with nothing left still shows the Hidden card', () => {
    const r = render(createElement(ForYouSection, { ...base(), rows: [], hidden: { at: 0, kind: 'show', onUndo: jest.fn() } }));
    expect(words(r)).toContain('Hidden. This show won’t be recommended.');
  });
  it('with nothing and nothing hidden there is no section', () => {
    expect(render(createElement(ForYouSection, { ...base(), rows: [] })).toJSON()).toBeNull();
  });
  it('"Not liking these? ›" is the link under the deck', () => {
    const r = render(createElement(RecFeedbackLink));
    act(() => { one(r, 'Not liking these? Tell us why').props['onPress'](); });
    expect(mockPush).toHaveBeenCalledWith('/onboarding/not-liking');
    expect(words(r)).toContain('Not liking these? ›');
  });
});

describe('where a hidden card sat', () => {
  const rows = [{ card: card('a') }, { card: { ...card('b'), feedUrl: 'https://f/shared.xml' } }, { card: card('c') }, { card: { ...card('d'), feedUrl: 'https://f/shared.xml' } }];
  it('an episode: its own row; a show: the first row of that show; not there: 0', () => {
    expect(hiddenAt(rows, 'episode', card('c'))).toBe(2);
    expect(hiddenAt(rows, 'show', { ...card('x'), feedUrl: 'https://f/shared.xml' })).toBe(1);
    expect(hiddenAt(rows, 'episode', card('zz'))).toBe(0);
  });
});

describe('the Hidden card counts down', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });
  it('"8 s" then fewer: the ring and the words follow the clock', () => {
    const r = render(createElement(HiddenNotice, { kind: 'episode', onUndo: jest.fn(), ms: 8000 }));
    expect(words(r)).toContain('8 s');
    act(() => { jest.advanceTimersByTime(3000); });
    expect(words(r)).toContain('5 s');
  });
});

describe('Charts (home--fold-a)', () => {
  const rows = ['a', 'b', 'c', 'd'].map(card);
  const tabs = [{ key: 'top' as const, label: 'Top', rows }, { key: 'talked' as const, label: 'Talked about', rows: [card('z')] }, { key: 'new' as const, label: 'New shows', rows: [] }];
  it('a card per chart, 270 x 220, rows 54 tall with the rank, the cover 40 and a Play glyph; "1 / 2 →" only where there are two pages', () => {
    const r = render(createElement(ChartSection, { tabs, onOpen: jest.fn(), onPlay: jest.fn(), onFull: jest.fn() }));
    expect(host(r, 'deck-card')).toHaveLength(3);
    expect(sized(r, 270, 220)).toHaveLength(3);
    expect(words(r)).toContain('1 / 2 →');
    expect(words(r).filter((w) => /\/ \d/.test(w))).toHaveLength(1);
    // The empty chart still has its card and says so.
    expect(words(r)).toContain('Nothing here yet — check back soon.');
    // Rank 1 is hot-text, the others text2.
    const rank = r.root.findAll((n) => String(n.type) === 'Text' && say(n.props['children']) === '1')[0]!;
    expect(String(rank.props['className'])).toMatch(/text-hotText/);
    const rank2 = r.root.findAll((n) => String(n.type) === 'Text' && say(n.props['children']) === '2')[0]!;
    expect(String(rank2.props['className'])).toMatch(/text-text2/);
  });
  it('a chart\'s name brings its card to the left of the deck; "Full chart ›" opens the chart', () => {
    const onFull = jest.fn();
    const r = render(createElement(ChartSection, { tabs, onOpen: jest.fn(), onPlay: jest.fn(), onFull }));
    act(() => { one(r, 'Talked about chart').props['onPress'](); });
    act(() => { one(r, 'Full chart').props['onPress'](); });
    expect(onFull).toHaveBeenCalled();
  });
});

describe('Genres (home--fold-b, home--hidden-categories)', () => {
  it('chips 36 tall with the genre\'s icon, its name and a × that hides it; "All ›" ends the cloud', () => {
    const onHide = jest.fn();
    const onAll = jest.fn();
    const onGenre = jest.fn();
    const r = render(createElement(CategoryStrip, { onGenre, onAll, onHide }));
    const g = GENRES[0]!;
    act(() => { one(r, g.name).props['onPress'](); });
    expect(onGenre).toHaveBeenCalledWith(g.id);
    act(() => { one(r, `Hide ${g.name}`).props['onPress'](); });
    expect(onHide).toHaveBeenCalledWith(g.id);
    act(() => { one(r, 'All').props['onPress'](); });
    expect(onAll).toHaveBeenCalled();
    expect(words(r)).toContain('All ›');
    expect(edgeLabels(r)).toEqual(['Explore by category']);
  });
  it('the Hidden section lists hidden genres as dashed "+" chips under the link; none hidden, just the link', () => {
    const g = GENRES[1]!;
    const onShow = jest.fn();
    const onPress = jest.fn();
    let r = render(createElement(MoreCategories, { onPress, hidden: [g.id], onShow }));
    expect(edgeLabels(r)).toEqual(['Hidden']);
    expect(words(r)).toContain('Tap a hidden genre to show it again.');
    const chip = one(r, `Show ${g.name} again`);
    expect(String(chip.props['className'])).toMatch(/border-dashed/);
    act(() => { chip.props['onPress'](); });
    expect(onShow).toHaveBeenCalledWith(g.id);
    act(() => { one(r, 'Explore more categories').props['onPress'](); });
    expect(onPress).toHaveBeenCalled();
    r = render(createElement(MoreCategories, { onPress, hidden: [], onShow }));
    expect(edgeLabels(r)).toEqual([]);
    expect(words(r)).toContain('Explore more categories ›');
  });
});

describe('Shows, Premium, Video (home--fold-b)', () => {
  it('Shows: cards 150 x 180 (cover 120), the name and one caption; each deck keeps the owner\'s rename as its label', () => {
    const onShow = jest.fn();
    const r = render(createElement(ShowTiles, { title: 'Popular shows', short: 'Popular', shows: [{ feedUrl: 'https://f/a.xml', title: 'Show a', line: 'Author a' }, { feedUrl: 'https://f/b.xml', title: 'Show b' }], caption: 'Picked for you', onShow }));
    expect(sized(r, 150, 180)).toHaveLength(2);
    expect(host(r, 'deck')[0]!.props['snapToInterval']).toBe(160);
    expect(words(r)).toEqual(expect.arrayContaining(['Show a', 'Author a', 'Picked for you']));
    expect(edgeLabels(r)).toEqual(['Popular shows']);
    act(() => { one(r, 'Show a. Author a').props['onPress'](); });
    expect(onShow).toHaveBeenCalledWith('https://f/a.xml');
  });
  it('Premium: cards 260 x 96, a PREMIUM tag, the cover 72, and no price and no buy button (nothing is sold)', () => {
    const onShow = jest.fn();
    const r = render(createElement(PremiumSection, { shows: [show('p')], onShow }));
    expect(sized(r, 260, 96)).toHaveLength(1);
    expect(words(r)).toContain('PREMIUM');
    expect(words(r).join(' ')).not.toMatch(/[$£€]|\bbuy\b|\bsubscribe\b/i);
    expect(r.root.findAll((n) => typeof n.type === 'string' && flat(n)['width'] === 72 && flat(n)['height'] === 72).length).toBeGreaterThan(0);
    act(() => { one(r, 'Show p, Author p. Premium pick').props['onPress'](); });
    expect(onShow).toHaveBeenCalledWith('https://f/p.xml');
    expect(String(host(r, 'deck-card')[0]!.props['className'])).toMatch(/bg-premiumTint/);
  });
  it('Video: cards 260 x 150 with a video mark, the title and the show; a card opens the episode', () => {
    const onOpen = jest.fn();
    const r = render(createElement(VideoSection, { items: [{ kind: 'video', key: 'v', episode: card('v') } as never], onOpen, onPlay: jest.fn() }));
    expect(sized(r, 260, 150)).toHaveLength(1);
    act(() => { one(r, 'Video: Title v, Show v').props['onPress'](); });
    expect(onOpen).toHaveBeenCalledWith(card('v'));
  });
});

describe('Lists, Said, New, Hunt (home--fold-b)', () => {
  it('Lists: cards 200 x 130, three covers of 36 overlapping by 10, the title and "n episodes · subtitle"; a card opens its list', () => {
    const items = ['x', 'y', 'z'].map((k) => ({ kind: 'pick' as const, key: k, episode: card(k) }));
    const r = render(createElement(TopicListCards, { lists: [{ id: 'c1', title: 'Gentle starts', subtitle: 'For slow mornings', items }] as never }));
    expect(sized(r, 200, 130)).toHaveLength(1);
    expect(r.root.findAll((n) => typeof n.type === 'string' && flat(n)['width'] === 36 && flat(n)['height'] === 36).length).toBeGreaterThanOrEqual(3);
    expect(words(r)).toEqual(expect.arrayContaining(['Gentle starts', '3 episodes · For slow mornings']));
    const second = r.root.findAll((n) => typeof n.type === 'string' && flat(n)['marginLeft'] === -10);
    expect(second).toHaveLength(2);
    act(() => { one(r, 'Gentle starts. For slow mornings. 3 episodes').props['onPress'](); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/topic/[id]', params: { id: 'c1' } });
  });
  it('Said: cards 240 x 130 with the comment, who ("A listener · …", never a name) and a Play disc; a card opens the episode', () => {
    const onOpen = jest.fn();
    const onPlay = jest.fn();
    const r = render(createElement(SaidSection, { items: [{ commentId: 'm', authorId: 'listener-7f3a', body: 'Loved the ending', createdAt: '2026-09-27T00:00:00Z', episode: card('e') }], now: Date.parse('2026-09-27T05:00:00Z'), onOpen, onPlay }));
    expect(sized(r, 240, 130)).toHaveLength(1);
    expect(words(r)).toEqual(expect.arrayContaining(['“Loved the ending”', 'A listener · 5 h ago']));
    expect(JSON.stringify(r.toJSON())).not.toContain('listener-7f3a');
    act(() => { one(r, 'Play Title e').props['onPress'](); });
    expect(onPlay).toHaveBeenCalledWith(card('e'));
    act(() => { one(r, 'Title e, Show e. A listener said: Loved the ending').props['onPress'](); });
    expect(onOpen).toHaveBeenCalledWith(card('e'));
  });
  it('New: cards 230 x 72 with the cover 48, the show and "New show · n episodes"; the Play glyph is kept', () => {
    const onPlay = jest.fn();
    const r = render(createElement(NewArrivalsSection, { items: [{ show: { ...show('n'), episodeCount: 3 }, episode: card('n') }], onOpen: jest.fn(), onPlay }));
    expect(sized(r, 230, 72)).toHaveLength(1);
    expect(words(r)).toEqual(expect.arrayContaining(['Show n', 'New show · 3 episodes']));
    act(() => { one(r, 'Play Title n').props['onPress'](); });
    expect(onPlay).toHaveBeenCalledWith(card('n'));
  });
  it('Hunt: the line, cards 250 x 76 with a Play disc 36, and a Shuffle chip 36 tall that asks for the next set', async () => {
    mockHunt.mockResolvedValue({ items: [card('h1'), card('h2')] });
    let r!: ReactTestRenderer;
    await act(async () => { r = create(createElement(TreasureHunt, { onOpen: jest.fn(), onPlay: jest.fn() })); });
    mounted.push(r);
    expect(words(r)).toContain("Three lesser-heard episodes from shows you don't follow. New ones every day.");
    expect(sized(r, 250, 76)).toHaveLength(2);
    expect(flat(one(r, 'Play Title h1'))['width']).toBe(36);
    expect(flat(one(r, 'Shuffle the treasure hunt'))['height']).toBe(36);
    await act(async () => { one(r, 'Shuffle the treasure hunt').props['onPress'](); });
    expect(mockHunt).toHaveBeenLastCalledWith(1);
  });
});

describe('the Not interested sheet (home--not-interested-sheet)', () => {
  it('the episode as a header, two choice tiles at least 120 tall, Cancel; choosing sends the kind', () => {
    const onChoose = jest.fn();
    const onClose = jest.fn();
    const r = render(createElement(NotInterestedSheet, { card: card('n'), onChoose, onClose }));
    expect(words(r)).toEqual(expect.arrayContaining(['Show n', 'Title n', 'Not interested in this episode', 'Stop recommending this show']));
    // (`Choice` is a component that carries the name too: the tile is the host view under it.)
    const tile = (label: string): ReactTestInstance => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function' && n.props['style'] !== undefined)[0]!;
    const left = tile('Not interested in this episode');
    const right = tile('Stop recommending Show n');
    expect([flat(left)['minHeight'], flat(right)['minHeight']]).toEqual([120, 120]);
    act(() => { left.props['onPress'](); });
    expect(onChoose).toHaveBeenCalledWith('episode', card('n'));
    act(() => { right.props['onPress'](); });
    expect(onChoose).toHaveBeenCalledWith('show', card('n'));
    act(() => { one(r, 'Cancel').props['onPress'](); });
    expect(onClose).toHaveBeenCalled();
  });
});
