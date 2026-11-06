// Tests that the Me tab's list parts match their drawings in the numbers the owner compared.
/**
 * M31 W3-C (T041; owner: "the design I want completely the same, or you can explain why it is different"). Source of
 * every number: specs/033-m31-redesign/design-pulse2 `listen.html` (`spine`, `card`, `histNode`, `momCard`, `dcard`, `dots`,
 * `mosaic`), `shell.html` (`seg`, `glowTile`), `discover.html` (`lBars`, `seg`). Each test names the revert that turns it red
 * (each was seen red once, then restored):
 *  - (039 I2: the spine, the node's 46 column and 56 indent, the dots, the deck and the mosaic column went with the parts that drew them.)
 *  - card radius 16, padding 16, gap 8: `LIST.cardRadius` / `LIST.cardPad` changed — red;
 *  - day tag light and upper case: `bg-text` to `bg-hot`, or the tag's `toUpperCase` removed — red;
 *  - switch pill track, chosen light with void words, spoken as tabs: `bg-text` removed from the chosen choice — red;
 *  - search field 48, radius 16, raise2: `LIST.field` to 44 — red;
 *  - bars 8 + 110 × share, a quiet day a 3 tick, the tapped bar hot, a tap picks the column: `BARS.span` to 100 — red;
 *  - the title bar takes a drawn size (26), the foot zone lifts it (`below`), `bare` hides it: the props removed from PushedPage — red.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { ageLabel, ArtTile, DayTag, PageEmpty, PlayDot, SearchField, SegmentSwitch, ThreadCard, GlowTile } from '@/ui/me/lists';
import { barHeight, BARS, columnAt, ListeningBars } from '@/ui/me/ListeningBars';
import { PushedPage } from '@/ui/kit/PushedPage';
import { TitleBar } from '@/ui/kit/TitleBar';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }, usePathname: () => '/history' }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

const mounted: ReactTestRenderer[] = [];
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
function render(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  mounted.push(r);
  return r;
}
const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const hosts = (r: ReactTestRenderer, f: (n: ReactTestInstance) => boolean): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && f(n));
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance[] => hosts(r, (n) => n.props['testID'] === id);
const val = (x: unknown): unknown => (x !== null && typeof x === 'object' && '__getValue' in x ? (x as { __getValue: () => unknown }).__getValue() : x);
const classOf = (n: ReactTestInstance): string => String(n.props['className'] ?? '');
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));

describe('Card (listen.html card, 039 I2 on the 038 tokens)', () => {
  it('a card is raise, radius 16, padding 16, 8 between its parts', () => {
    // 039 I2: was radius 18, padding 12, gap 6 (the drawing's `card()`); now radius.row, spacing.section, spacing.gap.
    const r = render(createElement(ThreadCard, null));
    const c = byId(r, 'thread-card')[0]!;
    expect(classOf(c)).toContain('bg-raise');
    expect(flat(c)).toMatchObject({ borderRadius: 16, padding: 16, gap: 8 });
  });
});

describe('Day tag, play dot', () => {
  it('the day tag is the light tag: 22 tall, radius 7, 8 of padding, upper case, Geist Mono 11', () => {
    const r = render(createElement(DayTag, { text: 'Earlier this week' }));
    const t = byId(r, 'day-tag')[0]!;
    expect(classOf(t)).toContain('bg-text');
    expect(flat(t)).toMatchObject({ height: 22, paddingHorizontal: 8, borderRadius: 7 });
    expect(words(r)).toEqual(['EARLIER THIS WEEK']);
    const w = r.root.findAll((x) => String(x.type) === 'Text')[0]!;
    expect(classOf(w)).toContain('text-void');
    expect(classOf(w)).toContain('font-mono');
    expect(flat(w)).toMatchObject({ fontSize: 11 });
  });

  it('the play dot is a light circle with a void play glyph at 0.4 of it', () => {
    const r = render(createElement(PlayDot, { size: 34 }));
    const d = byId(r, 'play-dot')[0]!;
    expect(classOf(d)).toContain('bg-text');
    expect(flat(d)).toMatchObject({ width: 34, height: 34, borderRadius: 17 });
    expect(byId(r, 'icon-play')[0]!.props['width']).toBe(14);
  });
});

describe('Switch, search field, empty block, tile', () => {
  const items = [{ value: 'a', label: 'Episodes · 6', accessibilityLabel: 'Episodes' }, { value: 'b', label: 'Comments · 3', accessibilityLabel: 'Comments' }] as const;

  it('the switch is a pill track (raise, a line, 4 and 4), choices 36 / pill; the chosen one is light with void words', () => {
    // 039 I2: was a 44 track, radius 22, padding 3, choices radius 18.
    const onChange = jest.fn();
    const r = render(createElement(SegmentSwitch, { items, value: 'a', onChange }));
    const track = byId(r, 'segment-switch')[0]!;
    expect(flat(track)).toMatchObject({ borderRadius: 999, padding: 4, gap: 4 });
    expect(track.props['accessibilityRole']).toBe('tablist');
    const all = r.root.findAll((n) => n.props['accessibilityRole'] === 'tab' && typeof n.props['onPress'] === 'function');
    const tabs = ['Episodes', 'Comments'].map((l) => all.find((n) => n.props['accessibilityLabel'] === l)!);
    expect(tabs.map((t) => t.props['accessibilityLabel'])).toEqual(['Episodes', 'Comments']);
    expect(flat(tabs[0])).toMatchObject({ height: 36, borderRadius: 999 });
    expect(classOf(tabs[0]!)).toContain('bg-text');
    expect(classOf(tabs[1]!)).not.toContain('bg-text');
    expect(tabs[0]!.props['accessibilityState']).toEqual({ selected: true });
    act(() => { tabs[1]!.props['onPress'](); });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('the roomy switch of Listening data is the same one track (039 I2: there is one size, 4 and 4)', () => {
    const r = render(createElement(SegmentSwitch, { items, value: 'a', onChange: jest.fn(), roomy: true }));
    expect(flat(byId(r, 'segment-switch')[0])).toMatchObject({ padding: 4, gap: 4 });
  });

  it('the search field is 48 tall, radius 16, raise2, with a 20 magnifier and the typed words reported', () => {
    const onChange = jest.fn();
    const r = render(createElement(SearchField, { value: '', onChange, placeholder: 'Search your history' }));
    const f = byId(r, 'search-field')[0]!;
    expect(classOf(f)).toContain('bg-raise2');
    expect(flat(f)).toMatchObject({ height: 48, borderRadius: 16 }); // 039 I2: was radius 18
    expect(byId(r, 'icon-search-outline')[0]!.props['width']).toBe(20);
    const input = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Search your history' && typeof n.props['onChangeText'] === 'function')[0]!;
    act(() => { input.props['onChangeText']('rain'); });
    expect(onChange).toHaveBeenCalledWith('rain');
  });

  it('the empty block: a flat 200 wide curve, the title and line (one spoken sentence) and a light button that acts', () => {
    const onPress = jest.fn();
    const r = render(createElement(PageEmpty, { top: 204, title: 'Sign in to comment', line: 'Your comments, at their moments, live here.', action: { label: 'Sign in', onPress } }));
    expect(flat(byId(r, 'page-empty')[0])).toMatchObject({ marginTop: 204 });
    expect(words(r)).toEqual(expect.arrayContaining(['Sign in to comment', 'Your comments, at their moments, live here.', 'Sign in']));
    const spoken = hosts(r, (n) => n.props['accessibilityLabel'] === 'Sign in to comment Your comments, at their moments, live here.');
    expect(spoken).toHaveLength(1);
    const b = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Sign in' && typeof n.props['onPress'] === 'function')[0]!;
    act(() => { b.props['onPress'](); });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('an empty block with no line speaks only its title', () => {
    const r = render(createElement(PageEmpty, { top: 0, title: 'Nothing matches' }));
    expect(hosts(r, (n) => n.props['accessibilityLabel'] === 'Nothing matches')).toHaveLength(1);
  });

  it('an art tile: radius 24, the words low on a fade, a corner mark top right', () => {
    const r = render(createElement(ArtTile, { name: 'Morning Notes', width: 168, height: 194, corner: createElement(PlayDot, { size: 18 }) } as React.ComponentProps<typeof ArtTile>, createElement(ThreadCard, null)));
    expect(flat(byId(r, 'art-tile')[0])).toMatchObject({ width: 168, height: 194, borderRadius: 24 }); // 039 I2: was radius 22
    expect(byId(r, 'play-dot')).toHaveLength(1);
  });

  it('the glow tile is 110, radius 0.26 of it, tilted', () => {
    const r = render(createElement(GlowTile, { icon: 'star', size: 110, rotate: -6 }));
    const g = byId(r, 'glow-tile')[0]!;
    expect(flat(g)).toMatchObject({ width: 110, height: 110, borderRadius: 29 });
    expect(JSON.stringify(flat(g)['transform'])).toContain('-6deg');
  });
});

describe('measures', () => {
  it('ages: now, minutes, hours, days, then the date', () => {
    const now = Date.UTC(2026, 9, 28, 12, 0, 0);
    expect(ageLabel(now - 20_000, now)).toBe('now');
    expect(ageLabel(now - 5 * 60_000, now)).toBe('5m');
    expect(ageLabel(now - 4 * 3_600_000, now)).toBe('4h');
    expect(ageLabel(now - 3 * 86_400_000, now)).toBe('3d');
    expect(ageLabel(now - 30 * 86_400_000, now)).not.toMatch(/^\d+d$/);
  });
});

describe('Listening bars (discover.html lBars)', () => {
  it('a bar is 8 + 110 × its share of the busiest; a quiet day a 3 tick', () => {
    expect(barHeight(60, 60)).toBe(118);
    expect(barHeight(30, 60)).toBe(63);
    expect(barHeight(0, 60)).toBe(3);
    expect(BARS).toMatchObject({ height: 120, gap: 3, radius: 3 });
  });

  it('a tap picks the column under it, and nothing outside the chart', () => {
    expect(columnAt(0, 300, 30)).toBe(0);
    expect(columnAt(299, 300, 30)).toBe(29);
    expect(columnAt(155, 300, 30)).toBe(15);
    expect(columnAt(-1, 300, 30)).toBeUndefined();
    expect(columnAt(10, 0, 30)).toBeUndefined();
  });

  const days = Array.from({ length: 30 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, minutes: i === 15 ? 48 : i % 3 === 0 ? 0 : 20 }));
  it('30 bars 120 tall, 3 apart; the tapped one is hot and read out under the chart', () => {
    const r = render(createElement(ListeningBars, { points: days, unit: 'day' }));
    const chart = byId(r, 'listening-bars')[0]!;
    expect(flat(chart)).toMatchObject({ height: 120, gap: 3 });
    expect(chart.props['accessibilityRole']).toBe('image');
    const bars = byId(r, 'listening-bar');
    expect(bars).toHaveLength(30);
    expect(flat(bars[15])).toMatchObject({ height: 118, borderRadius: 3 });
    expect(flat(bars[0])).toMatchObject({ height: 3 });
    expect(bars.every((b) => classOf(b).includes('bg-barIdle'))).toBe(true);
    expect(words(r)).toContain('Tap a bar to see its minutes.');
    act(() => { chart.props['onLayout']({ nativeEvent: { layout: { width: 300 } } }); });
    act(() => { chart.props['onResponderRelease']({ nativeEvent: { locationX: 155 } }); });
    expect(classOf(byId(r, 'listening-bar')[15]!)).toContain('bg-hot');
    expect(words(r)).toContain('16 Oct: 48 min');
    act(() => { byId(r, 'listening-bars')[0]!.props['onResponderRelease']({ nativeEvent: { locationX: 155 } }); });
    expect(classOf(byId(r, 'listening-bar')[15]!)).toContain('bg-barIdle');
  });

  it('the newest of the 30 days is named Today, the first by its date', () => {
    const r = render(createElement(ListeningBars, { points: days, unit: 'day' }));
    expect(words(r)).toEqual(expect.arrayContaining(['1 Oct', 'Today']));
  });
});

describe('PushedPage additions (size, below, bare, onTitle)', () => {
  // 038 D3: was "the title takes the drawn size: 26 and its own line (33), tracking −1 % (−0.26)" via a `size` prop; there is one title size now: 30, line 38, tracking −0.3.
  it('a long title is still the one title size: 30, line 38, tracking −0.3', () => {
    const r = render(createElement(TitleBar, { title: 'Listening history', top: 53 }));
    const t = r.root.findAll((n) => n.props['accessibilityRole'] === 'header')[0]!;
    const s = flat(t);
    expect(val(s['fontSize'])).toBe(30);
    expect(val(s['lineHeight'])).toBe(38);
    expect(s['letterSpacing']).toBeCloseTo(-0.3);
  });

  // 037 D1: was "…and lifts the title row by its height and 12" (a bottom title stood on the zone). The title is at the top now and stays put; the zone sits lowest and the content leaves room for it and 12.
  it('a foot zone sits lowest; the title bar stays at the top and does not lift', () => {
    const r = render(createElement(PushedPage, { title: 'Favourites', below: createElement(SegmentSwitch, { items: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], value: 'a', onChange: jest.fn() }), belowHeight: 44 } as React.ComponentProps<typeof PushedPage>, null));
    const zone = byId(r, 'pushed-below')[0]!;
    expect(flat(zone)).toMatchObject({ bottom: 6, paddingHorizontal: 20, gap: 12 });
    expect(flat(r.root.findAllByType(TitleBar)[0]!.findAll((n) => n.props['testID'] === 'title-bar' && typeof n.type === 'string')[0]!)).toMatchObject({ zIndex: 20 });
    expect(r.root.findAllByType(TitleBar)[0]!.props['top']).toBe(6);
    expect(r.root.findAllByType(TitleBar)[0]!.props['bottom']).toBeUndefined();
  });

  it('bare draws no title bar; a title link is a link with its spoken name', () => {
    const bare = render(createElement(PushedPage, { title: 'Slow mornings', bare: true } as React.ComponentProps<typeof PushedPage>, null));
    expect(bare.root.findAll((n) => n.props['accessibilityRole'] === 'header')).toHaveLength(0);
    // F3 defect 4: a bare page draws its own foot (and its own fade) — the page's fade must not be laid over it (zIndex 15 over the wrapper hid the rename form).
    const fades = (t: ReturnType<typeof render>) => t.root.findAll((n) => typeof n.type === 'string' && flat(n)['zIndex'] === 15);
    expect(fades(bare)).toHaveLength(0);
    expect(fades(render(createElement(PushedPage, { title: 'Slow mornings' } as React.ComponentProps<typeof PushedPage>, null)))).toHaveLength(1);
    const onTitle = jest.fn();
    const link = render(<PushedPage title="Slow mornings" onTitle={onTitle} titleLabel="Slow mornings, rename">{null}</PushedPage>);
    const l = link.root.findAll((n) => n.props['accessibilityLabel'] === 'Slow mornings, rename' && typeof n.props['onPress'] === 'function')[0]!;
    act(() => { l.props['onPress'](); });
    expect(onTitle).toHaveBeenCalledTimes(1);
  });
});
