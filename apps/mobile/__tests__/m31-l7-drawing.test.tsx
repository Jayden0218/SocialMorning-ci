// Tests that Discover, Moments and Launch match their drawings in the numbers the owner compared.
/**
 * M31 lane L7 (owner, 2026-10-28, after the wave-1 captures: "the design I want completely the same").
 * Source of every number: specs/033-m31-redesign/design-pulse2/index.html `#discover--screen`,
 * `#home--moments`, `#launch--promotion` and kit.js / kit.css. Each test names the revert that turns it red:
 *  - edge label: measure the visible, turned Text again (it reads 14 back and shows "T") — red;
 *  - fade: `FADE_HEIGHT` back to 260, or `ZONE_BOTTOM` back to a 10 gap — red;
 *  - curve: `spread` back to the drawing helper's first-70-buckets `sample`, or the hot glow back to a
 *    bucket-sized radius — red;
 *  - shortcuts: `untouched` always false (the old order) — red;
 *  - pick / Hot now / Premium / Queue: the old eyebrow, a solid-colour time, a washed Premium, no count — red;
 *  - Moments card: scrim stops, curve at 68, circle at 20 from the right, a hugging tag, a nested comment Text — red;
 *  - Launch: Skip at 8 under the status bar, the 56 foot block taller than its words — red.
 */
jest.useFakeTimers();
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { bars, colour, glow, typeScale } from '@/design';
import { EdgeLabel, MEASURE_ROOM, SLACK } from '@/ui/kit/EdgeLabel';
import { Fade } from '@/ui/kit/Fade';
import { Curve, spread } from '@/ui/kit/Curve';
import { DiscoverMosaic, GradientTime, HOT_HEIGHT, HotNowTile, type MosaicActions, type ShortcutTile } from '@/ui/discover/DiscoverMosaic';
import { DRAWN_ORDER, shortcutTiles, untouched } from '@/ui/discover/DiscoverShortcuts';
import { FADE_HEIGHT, MOSAIC_TOP, ZONE_BOTTOM } from '@/ui/discover/DiscoverPage';
import { SWITCH_HEIGHT, SWITCH_LIFT } from '@/ui/discover/HomeSwitch';
import { DiscoverGlow, GLOW } from '@/ui/discover/DiscoverGlow';
import { avatarTone } from '@/ui/kit/Avatar';
import { COUNT_LINE, MomentCard, type Ambient, type CardActions } from '@/ui/discover/MomentCard';
import { LaunchScreen, OPEN_LINE } from '@/ui/shell/LaunchScreen';
import { SearchBar } from '@/ui/discover/parts';
import { SHORTCUT_IDS } from '@socialmorning/social-core';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import type { Moment } from '@/discover/moments-api';
import type { PickWithFaces } from '@/discover/explore-api';

jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined }, queue: { list: () => [] } }), useToast: () => () => undefined, useCovered: () => false }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useRouter: () => ({ push: jest.fn() }), useFocusEffect: () => undefined }));
jest.mock('react-native-reanimated', () => {
  const { ScrollView, View } = require('react-native');
  return { __esModule: true, default: { ScrollView, View }, Extrapolation: { CLAMP: 'clamp' }, interpolate: (v: number, i: number[], o: number[]) => o[v <= i[0]! ? 0 : 1], runOnJS: (f: unknown) => f, useAnimatedScrollHandler: (h: { onScroll: (e: unknown) => void }) => (e: unknown) => h.onScroll(e), useAnimatedStyle: (f: () => object) => f(), useSharedValue: (v: number) => ({ value: v }) };
});
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: {}, listener: undefined }) }));
jest.mock('@/ui/discover/useMomentActions', () => ({ useMomentActions: () => ({}) }));
jest.mock('@/ui/discover/TheirLikes', () => ({ TheirLikes: () => null }));
jest.mock('@/ui/discover/TreasureHunt', () => ({ TreasureHunt: () => null }));
jest.mock('@/ui/discover/NotInterested', () => ({ NotInterestedSheet: () => null, HiddenNotice: () => null }));
jest.mock('@/ui/discover/RecFeedback', () => ({ RecFeedbackLink: () => null }));
jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: () => ({ buckets: Array.from({ length: 100 }, () => 0.2), durationMs: 2_890_000, comments: 318, mine: [] }) }));
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
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const texts = (r: ReactTestRenderer): ReactTestInstance[] => r.root.findAll((x) => String(x.type) === 'Text');
const textWith = (r: ReactTestRenderer, words: string): ReactTestInstance => {
  const t = texts(r).filter((x) => say(x.props['children']) === words);
  if (t.length === 0) throw new Error(`no Text says "${words}"`);
  return t[t.length - 1]!;
};
const classOf = (n: ReactTestInstance): string => String(n.props['className'] ?? '');
const labelled = (r: ReactTestRenderer, label: string): ReactTestInstance => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0]!;
/** The nearest ancestor (or self) whose flattened style has `key`. */
const withStyle = (n: ReactTestInstance, key: string): Record<string, unknown> => {
  for (let x: ReactTestInstance | null = n; x !== null; x = x.parent) { const f = flat(x); if (f[key] !== undefined) return f; }
  throw new Error(`no ancestor with style ${key}`);
};

describe('4/6 edge label: the whole of "TODAY\'S PICK"', () => {
  it('measures an unconstrained copy (wider than any label, off the left edge, unseen), then gives the turned label that width', () => {
    const r = render(createElement(EdgeLabel, { label: "Today's pick", top: 30 }));
    const copy = byId(r, 'edge-measure')[0]!;
    expect(flat(copy)).toMatchObject({ width: MEASURE_ROOM, opacity: 0, left: -MEASURE_ROOM });
    expect(copy.props['pointerEvents']).toBe('none');
    expect(copy.props['importantForAccessibility']).toBe('no-hide-descendants');
    const measured = copy.findAll((n) => String(n.type) === 'Text')[0]!;
    expect(measured.props['numberOfLines']).toBeUndefined(); // never cut while it is measured
    act(() => { measured.props['onLayout']({ nativeEvent: { layout: { width: 143.2, height: 14, x: 0, y: 0 } } }); });
    const shown = texts(r).filter((t) => t.props['numberOfLines'] === 1)[0]!;
    // Room for the quarter pixel the measure rounds off: on the web a line a hair too long is ellipsised ("TODAY'S PIC…"), so width AND maxWidth carry the slack.
    expect(flat(shown)).toMatchObject({ width: 144 + SLACK, maxWidth: 144 + SLACK, opacity: 1 });
    expect(JSON.stringify(flat(shown)['transform'])).toContain('-90deg');
    // the box is the turned size: the lane wide, the label long; its centre is the box's centre
    const box = r.root.findAll((n) => n.props['accessibilityRole'] === 'header')[0]!;
    expect(flat(box)).toMatchObject({ width: typeScale.edge.lineSafe, height: 144, left: 6, top: 30 });
    expect(flat(shown)['left']).toBe((typeScale.edge.lineSafe - 144) / 2);
    expect(flat(shown)['top']).toBe((144 - typeScale.edge.lineSafe) / 2);
  });
});

describe('7 Discover bottom zone', () => {
  it('the fade is 360 tall above the page foot, transparent to void at 55 %', () => {
    expect(FADE_HEIGHT).toBe(360);
    const r = render(createElement(Fade, { bottom: 0, height: FADE_HEIGHT }));
    const g = r.root.findAll((n) => Array.isArray(n.props['colors']))[0]!;
    expect(g.props['locations']).toEqual([0, 0.55, 1]);
    expect(g.props['colors']).toEqual([colour.clear, colour.void, colour.void]);
    expect(flat(g)).toMatchObject({ bottom: 0, height: 360 });
  });
  it('the title and search sit 16 above the switch (drawn bottom 168 over a 100 + 52 switch); the mosaic starts 6 under the status bar', () => {
    expect(SWITCH_LIFT + SWITCH_HEIGHT).toBe(60);
    expect(ZONE_BOTTOM).toBe(76); // 168 - 92 (the tab bar)
    expect(MOSAIC_TOP).toBe(6); // 56 - 50
  });
  it('the hot and violet glow is the drawn box: 520 tall from 160 above the screen, 40 % strong', () => {
    expect(GLOW).toMatchObject({ top: -160, height: 520, strength: 0.4 });
    const r = render(createElement(DiscoverGlow));
    expect(byId(r, 'discover-glow')).toHaveLength(1);
  });
});

describe('8 the heat curve as drawn on Moments', () => {
  const data = Array.from({ length: 100 }, (_, k) => (k >= 98 ? 1 : 0));
  const barsOf = (r: ReactTestRenderer): Record<string, unknown>[] => byId(r, 'curve-bar').map((b) => flat(b));
  it('70 bars are spread over ALL 100 buckets, so the last bar reads the end of the episode (the drawing helper stopped at bucket 70)', () => {
    expect(spread(data, 70)).toHaveLength(70);
    expect(spread(data, 70)[69]).toBe(1);
    expect(spread(data, 50)).toEqual(Array.from({ length: 50 }, (_, k) => data[k * 2]!)); // 50 over 100 is every second, as drawn
    const b = barsOf(render(createElement(Curve, { data, count: 70, height: 24, min: 2 })));
    expect(b).toHaveLength(70);
    expect(b[69]!['height']).toBe(24);
    expect(b[0]!['height']).toBe(2);
  });
  it('2 px gaps; the moment hot with the drawn glow (8 blur at 70 % → radius 4); the rest the idle white', () => {
    const r = render(createElement(Curve, { data: Array.from({ length: 100 }, () => 0.5), count: 70, height: 24, min: 2, hotRange: [20, 24] }));
    const row = r.root.findAll((n) => flat(n)['gap'] === 2)[0]!;
    expect(flat(row)['height']).toBe(24);
    const b = barsOf(r);
    expect([19, 20, 24, 25].map((i) => b[i]!['backgroundColor'])).toEqual([colour.barIdle, colour.hot, colour.hot, colour.barIdle]);
    expect(b[22]).toMatchObject({ shadowColor: colour.hot, shadowOpacity: 0.7, shadowRadius: 4 });
    expect(glow.bar).toMatchObject({ opacity: 0.7, radius: 4 });
    expect(b[30]!['shadowColor']).toBeUndefined();
  });
});

describe('4/5 the Discover shortcut tiles, the pick and Hot now', () => {
  it('untouched, the eight run in the drawn order: Friends listening, Categories, Queue, Issues, Premium, Academy, Plaza, Talked about', () => {
    expect(shortcutTiles(SHORTCUT_IDS.map((id) => ({ id }))).map((t) => t.label)).toEqual(['Friends listening', 'Categories', 'Queue', 'Issues', 'Premium', 'Academy', 'Plaza', 'Talked about']);
    expect(shortcutTiles([]).map((t) => t.id)).toEqual([...DRAWN_ORDER]);
  });
  it('an order the admin saved, a new name, or a hidden tile is kept as saved', () => {
    expect(untouched([{ id: 'plaza' }, { id: 'queue' }])).toBe(false);
    expect(untouched(SHORTCUT_IDS.map((id, i) => (i === 0 ? { id, label: 'Browse' } : { id })))).toBe(false);
    expect(untouched(SHORTCUT_IDS.map((id, i) => (i === 3 ? { id, hidden: true } : { id })))).toBe(false);
    expect(shortcutTiles([{ id: 'plaza' }, { id: 'queue', hidden: true }]).map((t) => t.id)).toEqual(['plaza', 'categories', 'issues', 'friends', 'academy', 'premium', 'talked']);
  });

  const PICK = { kind: 'pick', key: 'k', why: 'Short, warm, and good with coffee.', episode: { id: 'e1', feedUrl: 'https://f', guid: 'g', title: 'Why mornings matter', showTitle: 'Morning Notes', enclosureUrl: 'https://a.mp3' } } as unknown as PickWithFaces;
  const HOT: Moment = { episodeId: 'h1', showTitle: 'S', episodeTitle: 'Hot ep', startMs: 872_000, endMs: 910_000, reactions: 41, rank: 1, followed: false, comments: [{ id: 'c', author: 'Rui', text: 'the part I replay', likes: 1 }] };
  const tiles = (): ShortcutTile[] => DRAWN_ORDER.map((id, i) => ({ label: `T${i}`, icon: 'grid-outline', onPress: jest.fn(), ...(id === 'premium' ? { tinted: true } : {}), ...(id === 'queue' ? { count: 4 } : {}) }));
  const acts = (): MosaicActions => ({ onOpen: jest.fn(), onPlay: jest.fn(), onQueue: jest.fn(), onPast: jest.fn(), onHot: jest.fn() });
  const mosaic = (): ReactTestRenderer => render(createElement(DiscoverMosaic, { pick: PICK, date: '2026-10-27', stats: { listeners: 120, comments: 14 }, hot: HOT, tiles: tiles(), offline: false, actions: acts() }));

  it('the pick: "TODAY\'S PICK · OCT 27" and "PAST →" on one row at the top (mono 11, 0.08 em), the cover dimmed to 90 %, the foot clear at 30 % to void at 92 %', () => {
    const r = mosaic();
    const eyebrow = textWith(r, "TODAY'S PICK · OCT 27");
    expect(classOf(eyebrow)).toContain('text-pulse-tag');
    expect(flat(eyebrow)).toMatchObject({ letterSpacing: 0.88 });
    const past = textWith(r, 'PAST →');
    expect(classOf(past)).toContain('text-hotText');
    expect(typeScale.tag.size).toBe(11);
    // "Past picks" is not pushed down by a 48 tall box: the words sit at the top, the touch is made with hitSlop
    const link = labelled(r, 'Past picks');
    expect(link.props['hitSlop']).toBeTruthy();
    expect(flat(link)['minHeight']).toBeUndefined();
    const foot = r.root.findAll((n) => Array.isArray(n.props['colors']) && n.props['colors'][1] === colour.pickFoot)[0]!;
    expect(foot.props['colors']).toEqual([colour.clear, colour.pickFoot]);
    expect(foot.props['locations']).toEqual([0.3, 1]);
  });
  it('the pick: the counts wrap to a second line rather than cut, in text2', () => {
    const t = textWith(mosaic(), '120 listened · 14 comments');
    expect(t.props['numberOfLines']).toBe(2);
    expect(classOf(t)).toContain('text-text2');
  });
  it('Hot now: the time is the hot gradient, a step per character, from hot to the gradient end', () => {
    const r = render(createElement(GradientTime, { text: '14:32', from: colour.hot }));
    const chars = texts(r).filter((t) => say(t.props['children']).length === 1);
    expect(chars.map((c) => say(c.props['children'])).join('')).toBe('14:32');
    const cols = chars.map((c) => String(flat(c)['color']));
    expect(new Set(cols).size).toBe(5);
    expect(cols[0]).not.toBe(cols[4]);
    expect(classOf(texts(r)[0]!)).toContain('text-pulse-figure');
    expect(typeScale.figure.size).toBe(34);
  });
  it('Premium is its own solid tile colour; Queue carries its count in mono after the label', () => {
    const r = mosaic();
    const premium = r.root.findAll((n) => n.props['accessibilityLabel'] === 'T4' && typeof n.props['onPress'] === 'function')[0]!;
    expect(classOf(premium)).toContain('bg-premiumTint');
    expect(colour.premiumTint).toBe('#2a1530');
    const queue = r.root.findAll((n) => n.props['accessibilityLabel'] === 'T2' && typeof n.props['onPress'] === 'function')[0]!;
    expect(say(queue.findAll((x) => String(x.type) === 'Text')[0]!.props['children'])).toBe('T2 4');
    expect(queue.props['accessibilityValue']).toEqual({ text: '4 queued' });
    expect(queue.findAll((x) => String(x.type) === 'Text' && classOf(x).includes('font-mono'))).toHaveLength(1);
  });
});

describe('the Moments card as drawn', () => {
  const ITEM: Moment = {
    episodeId: 'e1', showTitle: 'Morning Notes', episodeTitle: 'Why mornings matter', startMs: 872_000, endMs: 910_000, reactions: 2400, rank: 1, followed: true,
    comments: [{ id: 'c1', author: 'Rui', text: 'the part I replay every morning and a lot more words than fit', likes: 3 }, { id: 'c2', author: 'Ana', text: 'goosebumps', likes: 2 }],
  };
  const AMBIENT: Ambient = { focused: true, appActive: true, reduceMotion: true, web: true };
  const noop = jest.fn();
  const actions: CardActions = { playFull: noop, toggleSound: noop, comments: noop, react: jest.fn(async () => true) as never, share: noop };
  const card = (): ReactTestRenderer => render(createElement(MomentCard, { item: ITEM, width: 390, height: 752, top: 50, below: 92, active: true, near: true, ambient: AMBIENT, soundOn: false, actions }));

  it('the scrim is the drawing\'s three stops (10, 25, 94 %) over the PHONE\'s height, so they fall where drawn', () => {
    const g = card().root.findAll((n) => Array.isArray(n.props['colors']) && n.props['colors'][0] === colour.scrimTop)[0]!;
    expect(g.props['colors']).toEqual([colour.scrimTop, colour.scrimMid, colour.scrimFoot, colour.scrimFoot]);
    expect(g.props['locations']).toEqual([0, 0.38, 0.76, 1]);
    expect(flat(g)).toMatchObject({ top: 0, height: 752 + 92 });
  });
  it('70 bars, 24 tall, 2 apart, 76 above the page foot (drawn 168 from the phone\'s)', () => {
    const r = card();
    expect(byId(r, 'curve-bar')).toHaveLength(70);
    const wrap = withStyle(byId(r, 'curve-bar')[0]!.parent!.parent!, 'bottom');
    expect(wrap['bottom']).toBe(76);
    expect(wrap).toMatchObject({ left: 20, right: 20 });
  });
  it('the sound pill is 10 under the status bar, 14 in; the Play circle and the action column are 16 from the right; the title block ends 84 from it', () => {
    const r = card();
    expect(flat(labelled(r, 'Sound off. Turn sound on'))).toMatchObject({ left: 14, top: 60, height: 32 });
    expect(classOf(textWith(r, 'Sound off'))).toContain('text-pulse-chip');
    expect(flat(labelled(r, 'Play from 14:32'))).toMatchObject({ right: 16, bottom: 104, width: 56, height: 56 });
    expect(withStyle(labelled(r, 'Share a clip of 14:32'), 'right')).toMatchObject({ right: 16, bottom: 208 });
    expect(withStyle(textWith(r, 'Why mornings matter'), 'right')).toMatchObject({ left: 20, right: 84, bottom: 114 });
  });
  it('the action words are mono 11, and each action is 48+ to touch without taking the room (hitSlop, no minimum height)', () => {
    const r = card();
    expect(classOf(textWith(r, 'Share'))).toContain('text-pulse-tag');
    const share = labelled(r, 'Share a clip of 14:32');
    expect(flat(share)['minHeight']).toBeUndefined();
    const s = share.props['hitSlop'] as { top: number; bottom: number; left: number; right: number };
    expect(28 + 4 + typeScale.tag.lineSafe + s.top + s.bottom).toBeGreaterThanOrEqual(48);
  });
  it('round 3: each action is the drawn 43 tall (28 + 4 + an 11 count), so the column is 165 and sits where drawn — the safe 15 line is trimmed 2 above and below the count', () => {
    // Red if COUNT_LINE is dropped from a count (the column grew to 189 and sat 24 too high) or its margins change.
    expect(28 + 4 + typeScale.tag.lineSafe + COUNT_LINE.marginVertical * 2).toBe(43);
    const r = card();
    for (const words of ['2.4k', '318', 'Share']) expect(flat(textWith(r, words))).toMatchObject({ marginVertical: -2 });
  });
  it('round 3: the cover is laid out over the PHONE\'s height (752 + the 92 under the page = 844), from the top, so a square cover crops as the drawing\'s art does', () => {
    // Red if the cover goes back to filling only the page (its circles then sat 28 px high and a third larger).
    const withCover = render(createElement(MomentCard, { item: { ...ITEM, coverUrl: 'https://img.example.test/c.png' }, width: 390, height: 752, top: 50, below: 92, active: true, near: true, ambient: AMBIENT, soundOn: false, actions }));
    const img = withCover.root.findAll((n) => n.props['source'] !== undefined && flat(n)['position'] === 'absolute')[0]!;
    expect(flat(img)).toMatchObject({ left: 0, top: 0, width: 390, height: 844 });
    const wash = card().root.findAll((n) => flat(n)['opacity'] === 0.55 && flat(n)['height'] === 844)[0];
    expect(wash).toBeTruthy(); // the no-cover wash is the same box
  });
  it('the hot tag fills the block\'s width as drawn (not self-start), mono 12 on 22', () => {
    const r = card();
    const tag = byId(r, 'hot-tag')[0]!;
    expect(classOf(tag)).not.toContain('self-start');
    expect(classOf(tag)).toContain('bg-hot');
    expect(flat(tag)).toMatchObject({ minHeight: bars.stamp, paddingHorizontal: bars.stampPad });
  });
  it('a comment is one line on every platform: the name never shrinks, the words are one line with an ellipsis, 10 between pills', () => {
    const r = card();
    const words = byId(r, 'comment-words').length ? texts(r).filter((t) => t.props['testID'] === 'comment-words') : [];
    expect(words).toHaveLength(2);
    for (const w of words) {
      expect(w.props['numberOfLines']).toBe(1);
      expect(flat(w)).toMatchObject({ flexShrink: 1, minWidth: 0 });
    }
    const col = r.root.findAll((n) => flat(n)['top'] === 118 && flat(n)['right'] === 16)[0]!;
    expect(flat(col)['gap']).toBe(10);
  });
  it('each commenter\'s disc and letter come from their NAME (avatarTone, wave 5b), not from their place in the column', () => {
    const r = card();
    for (const name of ['Rui', 'Ana']) {
      const tone = avatarTone(name);
      const disc = r.root.findAll((n) => flat(n)['backgroundColor'] === tone.fill && flat(n)['width'] === 22)[0]!;
      expect(disc).toBeDefined();
      expect(classOf(disc.findAll((x) => String(x.type) === 'Text')[0]!)).toContain(tone.ink === 'text' ? 'text-text' : 'text-void');
    }
  });
});

describe('Launch as drawn', () => {
  const mount = (): ReactTestRenderer => render(createElement(SafeAreaInsetsContext.Provider, { value: { top: 50, bottom: 34, left: 0, right: 0 } }, createElement(LaunchScreen, { promotion: { id: 'a', label: 'Promotion' }, uri: 'file:///a.png', started: true, onShown: jest.fn(), onTap: jest.fn(), onDone: jest.fn() })));
  it('Skip: 44 tall, 16 from the right, 10 under the status bar, a 15 % line, 10 between the word and the 32 ring', () => {
    const r = mount();
    const skip = labelled(r, 'Skip');
    expect(flat(skip)).toMatchObject({ top: 60, right: 16, height: 44, paddingLeft: 16, paddingRight: 6, gap: 10 });
    expect(classOf(skip)).toContain('border-glassEdge');
    expect(colour.glassEdge).toBe('rgba(255,255,255,0.15)');
    const ring = r.root.findAll((n) => flat(n)['width'] === 32 && flat(n)['height'] === 32)[0]!;
    expect(ring).toBeTruthy();
  });
  it('the app mark is 30 at 20 from the left and 14 under the status bar, hidden from a screen reader; the name is Unbounded 15', () => {
    const r = mount();
    const mark = byId(r, 'launch-mark')[0]!;
    expect(flat(mark)).toMatchObject({ top: 64, left: 20 });
    expect(mark.props['importantForAccessibility']).toBe('no-hide-descendants');
    const img = mark.findAll((n) => flat(n)['width'] === 30 && flat(n)['height'] === 30)[0]!;
    expect(flat(img)['borderRadius']).toBe(9);
    const name = textWith(r, 'SocialNet');
    expect(classOf(name)).toContain('font-display');
    expect(classOf(name)).toContain('text-pulse-row'); // 15
  });
  it('round 3: "Open →" is trimmed to its drawn 15 line, so the label block is the drawn 40 tall (red if OPEN_LINE is dropped: it is 45)', () => {
    expect(OPEN_LINE).toEqual({ marginVertical: -2.5 });
    expect(flat(textWith(mount(), 'Open →'))).toMatchObject({ marginVertical: -2.5 });
    expect(typeScale.tag.lineSafe + 10 + typeScale.row.lineSafe + OPEN_LINE.marginVertical * 2).toBe(40);
  });
  it('the label block is 56 from the foot, 10 between "PROMOTION" (mono 11, 0.1 em) and "Open →", not stretched to a 48 box', () => {
    const r = mount();
    const link = labelled(r, 'Promotion. Opens the promotion');
    expect(flat(link)).toMatchObject({ left: 20, right: 20, bottom: 56, gap: 10 });
    expect(flat(link)['minHeight']).toBeUndefined();
    expect(link.props['hitSlop']).toBeTruthy();
    const label = textWith(r, 'Promotion');
    expect(classOf(label)).toContain('text-pulse-tag');
    expect(flat(label)).toMatchObject({ letterSpacing: 1.1, textTransform: 'uppercase' });
  });
});

describe('round 3 (wave 1b): what the capture found', () => {
  it('Hot now keeps its padding on an inner box: the tile itself has none, so its `flex: 1` share is not widened by 28 on the web', () => {
    const r = render(createElement(HotNowTile, { moment: { episodeId: 'e', showTitle: 's', episodeTitle: 't', startMs: 872_000, endMs: 910_000, reactions: 2400, rank: 1, followed: true, comments: [{ id: 'c', author: 'Rui', text: 'x', likes: 1 }] }, onPress: jest.fn() }));
    const tile = r.root.findAll((n) => typeof n.props['onPress'] === 'function' && String(n.props['accessibilityLabel']).startsWith('Hot now'))[0]!;
    const f = flat(tile);
    expect(f['padding']).toBeUndefined();
    expect(f).toMatchObject({ minHeight: HOT_HEIGHT, flex: 1, minWidth: 0 });
    const inner = tile.findAll((n) => flat(n)['padding'] === 14)[0];
    expect(inner).toBeTruthy();
  });
  it('the search field says "Trending: …", as drawn (the hint alone did not say what the line is), and still names itself "Search. Trending: …"', () => {
    const r = render(createElement(SearchBar, { hint: 'morning routines', onPress: jest.fn() }));
    expect(texts(r).map((t) => say(t.props['children']))).toContain('Trending: morning routines');
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Search. Trending: morning routines').length).toBeGreaterThan(0);
  });
});
