// Tests the Moments card and feed as drawn: the preview rules, the buttons, the states, the stops.
/**
 * M31 T025 (design-pulse2 `home--moments`, research T020 §4). A card's preview shows as its Play circle
 * (Pause while it runs) and as hot bars that light one by one; it runs only for the active card, with
 * Home in front, the app in front, Reduce Motion off, not on the web, and not paused by a tap. The feed
 * stops a card's sound when its card is left, Home leaves the front or the app does.
 *
 * The breaks that turn it red: drop `reduceMotion` from `previewRuns` (the Reduce Motion case shows
 * Pause); let `MomentsFeed` skip `stop.current(before)` (leaving a card keeps its sound).
 */
jest.useFakeTimers();
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { MomentCard, type Ambient, type CardActions } from '@/ui/discover/MomentCard';
import { MomentsFeed } from '@/ui/discover/MomentsFeed';
import { RisingComments, REST_STRENGTH } from '@/ui/discover/RisingComments';
import { HomeSwitch } from '@/ui/discover/HomeSwitch';
import type { Moment } from '@/discover/moments-api';
import type { MomentsList } from '@/ui/discover/useMoments';
import { colour } from '@/design';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockHeat = jest.fn();
jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: (...a: unknown[]) => mockHeat(...a) }));
const mockActions: Record<string, jest.Mock> = {};
let mockPending: unknown;
jest.mock('@/ui/discover/useMomentActions', () => ({ useMomentActions: () => ({ ...mockActions, pendingSwitch: mockPending }) }));
let mockPlayingKey: string | undefined;
jest.mock('@/playback/store', () => ({ usePlayer: () => ({ clip: () => undefined }), usePlayerSelector: () => mockPlayingKey }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));

const ITEM: Moment = {
  episodeId: 'e1', showTitle: 'Morning Notes', episodeTitle: 'Why mornings matter', startMs: 872_000, endMs: 910_000, reactions: 2400, rank: 1, followed: true,
  comments: [{ id: 'c1', author: 'Rui', text: 'the part I replay every morning', likes: 3 }, { id: 'c2', author: 'Ana', text: 'goosebumps', likes: 2 }],
};
const ITEM_2: Moment = { ...ITEM, episodeId: 'e2', episodeTitle: 'Second', startMs: 60_000, endMs: 90_000 };
const HEAT = { buckets: new Array<number>(100).fill(0.2), durationMs: 2_890_000, comments: 318, mine: [] as number[] };
const NO_HEAT = { buckets: undefined, durationMs: undefined, comments: undefined, mine: undefined };
const GO: Ambient = { focused: true, appActive: true, reduceMotion: false, web: false };

const mounted: ReactTestRenderer[] = [];
beforeEach(() => {
  setReducedMotionForTest(true); // the Dialog / kit parts hold still; the card reads `ambient`, not this
  mockHeat.mockReset(); mockHeat.mockReturnValue(HEAT);
  for (const k of ['playFull', 'toggleSound', 'stopSound', 'comments', 'react', 'share', 'confirmSwitch', 'cancelSwitch']) mockActions[k] = jest.fn();
  mockActions['react']!.mockResolvedValue(true);
  mockPending = undefined; mockPlayingKey = undefined;
});
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });

const actions = (): CardActions => ({ playFull: mockActions['playFull']!, toggleSound: mockActions['toggleSound']!, comments: mockActions['comments']!, react: mockActions['react']! as never, share: mockActions['share']! });
type CardProps = Partial<Parameters<typeof MomentCard>[0]>;
function card(p: CardProps = {}): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(MomentCard, { item: ITEM, width: 390, height: 700, top: 47, active: true, near: true, ambient: GO, soundOn: false, actions: actions(), ...p })); });
  mounted.push(r);
  return r;
}
/** Each button once: the outermost node that carries the label and the press (wrappers repeat their props). */
const all = (r: ReactTestRenderer, label: string) => {
  const is = (n: ReactTestInstance | null): boolean => n !== null && n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function';
  return r.root.findAll((n) => is(n) && !is(n.parent));
};
const btn = (r: ReactTestRenderer, label: string): ReactTestInstance => { const b = all(r, label)[0]; if (!b) throw new Error(`no button "${label}"`); return b; };
const has = (r: ReactTestRenderer, label: string) => all(r, label).length > 0;
const press = (r: ReactTestRenderer, label: string) => act(() => { btn(r, label).props['onPress'](); });
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => [x.props['children']].flat(5).join(''));
const hotBars = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === 'curve-bar' && (StyleSheet.flatten(n.props['style']) as { backgroundColor?: string }).backgroundColor === colour.hot).length;

describe('the card as drawn', () => {
  it('shows the hot tag, the title, the show line and the sound pill', () => {
    const r = card();
    const w = words(r);
    expect(w).toContain('HOT · 14:32 – 15:10');
    expect(w).toContain('Why mornings matter');
    expect(w).toContain('Morning Notes · 2.4k reacted here');
    expect(w).toContain('Sound off');
  });
  it('the buttons are named for the moment and call their action with it', () => {
    const r = card();
    press(r, 'React at 14:32. 2400 reacted');
    expect(mockActions['react']).toHaveBeenCalledWith(ITEM, 2_890_000);
    press(r, 'Comments at 14:32');
    expect(mockActions['comments']).toHaveBeenCalledWith(ITEM);
    press(r, 'Share a clip of 14:32');
    expect(mockActions['share']).toHaveBeenCalledWith(ITEM);
    press(r, 'Play Why mornings matter from 14:32');
    expect(mockActions['playFull']).toHaveBeenCalledWith(ITEM);
    press(r, 'Sound off. Turn sound on');
    expect(mockActions['toggleSound']).toHaveBeenCalledWith(ITEM, false);
  });
  it('the comment number is the episode\'s once known; before that it says Chat', () => {
    expect(words(card())).toContain('318');
    mockHeat.mockReturnValue(NO_HEAT);
    expect(words(card())).toContain('Chat');
  });
  it('with the sound on the pill says so and a tap turns it off', () => {
    const r = card({ soundOn: true });
    expect(words(r)).toContain('Sound on');
    press(r, 'Sound on. Turn sound off');
    expect(mockActions['toggleSound']).toHaveBeenCalledWith(ITEM, true);
  });
  it('only the active card has a sound pill', () => {
    expect(has(card({ active: false }), 'Sound off. Turn sound on')).toBe(false);
  });
  it('a card far from the screen reads no curve; a near one does', () => {
    card({ near: false });
    expect(mockHeat).toHaveBeenLastCalledWith('e1', false);
    card({ near: true });
    expect(mockHeat).toHaveBeenLastCalledWith('e1', true);
  });
});

describe('the flame', () => {
  it('turns on at once and counts one more; the server\'s answer settles it', async () => {
    const r = card();
    await act(async () => { btn(r, 'React at 14:32. 2400 reacted').props['onPress'](); });
    expect(words(r)).toContain('2.4k');
    expect(has(r, 'React at 14:32. 2401 reacted')).toBe(true);
    expect(btn(r, 'React at 14:32. 2401 reacted').props['accessibilityState']).toEqual({ selected: true });
  });
  it('signed out (no answer) it goes back; a reaction the viewer already had is not counted twice', async () => {
    mockActions['react']!.mockResolvedValue(undefined);
    const r = card();
    await act(async () => { btn(r, 'React at 14:32. 2400 reacted').props['onPress'](); });
    expect(has(r, 'React at 14:32. 2400 reacted')).toBe(true);
    // bucketOf(886_000, 2_890_000) = 30; the viewer already reacted there
    mockHeat.mockReturnValue({ ...HEAT, mine: [30] });
    const again = card();
    expect(has(again, 'React at 14:32. 2400 reacted')).toBe(true);
    expect(btn(again, 'React at 14:32. 2400 reacted').props['accessibilityState']).toEqual({ selected: true });
  });
});

describe('the preview: muted, only when nothing forbids it', () => {
  it('runs on the active card: the circle says Pause and the hot bars light one by one', () => {
    const r = card();
    expect(has(r, 'Pause preview')).toBe(true);
    expect(hotBars(r)).toBe(1);
    act(() => { jest.advanceTimersByTime(15_000); });
    expect(hotBars(r)).toBe(2);
    act(() => { jest.advanceTimersByTime(5_250); }); // the loop wraps
    expect(hotBars(r)).toBe(1);
  });
  it.each([
    ['not the active card', { active: false }],
    ['Home not in front', { ambient: { ...GO, focused: false } }],
    ['the app not in front', { ambient: { ...GO, appActive: false } }],
    ['Reduce Motion', { ambient: { ...GO, reduceMotion: true } }],
    ['the web build', { ambient: { ...GO, web: true } }],
  ] as const)('does not run: %s — a Play button, the moment\'s bars all hot at rest', (_why, p) => {
    const r = card(p as CardProps);
    expect(has(r, 'Pause preview')).toBe(false);
    expect(has(r, 'Play from 14:32')).toBe(true);
    expect(hotBars(r)).toBe(2);
  });
  it('a tap on Pause stops it; the next tap plays the episode from the moment', () => {
    const r = card();
    press(r, 'Pause preview');
    expect(has(r, 'Pause preview')).toBe(false);
    expect(mockActions['playFull']).not.toHaveBeenCalled();
    press(r, 'Play from 14:32');
    expect(mockActions['playFull']).toHaveBeenCalledWith(ITEM);
  });
  it('a stopped preview starts again when it is the active card again', () => {
    const r = card();
    press(r, 'Pause preview');
    act(() => { r.update(createElement(MomentCard, { item: ITEM, width: 390, height: 700, top: 47, active: false, near: true, ambient: GO, soundOn: false, actions: actions() })); });
    act(() => { r.update(createElement(MomentCard, { item: ITEM, width: 390, height: 700, top: 47, active: true, near: true, ambient: GO, soundOn: false, actions: actions() })); });
    expect(has(r, 'Pause preview')).toBe(true);
  });
  it('a moment with no known length lights nothing until the curve answers', () => {
    mockHeat.mockReturnValue(NO_HEAT);
    expect(hotBars(card())).toBe(0);
  });
});

describe('rising comments', () => {
  it('at rest: up to three, full, three-quarters and half strength, read as one line', () => {
    expect(REST_STRENGTH).toEqual([1, 0.75, 0.5]);
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(RisingComments, { comments: [...ITEM.comments, { id: 'c3', author: 'Jo', text: 'clip it', likes: 0 }, { id: 'c4', author: 'Zed', text: 'fourth', likes: 0 }], run: false, top: 100 })); });
    mounted.push(r);
    const line = r.root.findAll((n) => typeof n.props['accessibilityLabel'] === 'string' && String(n.props['accessibilityLabel']).startsWith('Top comments'))[0]!;
    expect(line.props['accessibilityLabel']).toBe('Top comments at this moment: Rui: the part I replay every morning. Ana: goosebumps. Jo: clip it');
  });
  it('none → nothing drawn', () => {
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(RisingComments, { comments: [], run: true, top: 100 })); });
    mounted.push(r);
    expect(r.toJSON()).toBeNull();
  });
});

describe('the feed', () => {
  beforeEach(() => setReducedMotionForTest(false));
  const list = (over: Partial<MomentsList> = {}): MomentsList => ({ status: 'ready', items: [ITEM, ITEM_2], more: false, loadingMore: false, failed: false, refresh: jest.fn(async () => undefined), loadMore: jest.fn(async () => undefined), refreshIfOld: jest.fn(), ...over });
  function feed(l: MomentsList, inFront = true, onDiscover = jest.fn()): ReactTestRenderer {
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(MomentsFeed, { list: l, body: undefined, inFront, onDiscover })); });
    mounted.push(r);
    const root = r.root.findAll((n) => typeof n.props['onLayout'] === 'function')[0];
    if (root) act(() => { root.props['onLayout']({ nativeEvent: { layout: { width: 390, height: 700 } } }); });
    return r;
  }
  const scrollTo = (r: ReactTestRenderer, y: number) => act(() => { r.root.findAll((n) => typeof n.props['onScroll'] === 'function' && n.props['pagingEnabled'])[0]!.props['onScroll']({ nativeEvent: { contentOffset: { y } } }); });

  it('loading: a line and the loading mark, no cards', () => {
    const r = feed(list({ status: 'loading', items: [] }));
    expect(words(r)).toContain('Finding hot moments');
    expect(has(r, 'Comments at 14:32')).toBe(false);
  });
  it('error: a sentence, Try again reads the list again, Open Discover goes to Discover', () => {
    const l = list({ status: 'error', items: [] }); const onDiscover = jest.fn();
    const r = feed(l, true, onDiscover);
    expect(words(r)).toContain("Couldn't load moments");
    press(r, 'Try again');
    expect(l.refresh).toHaveBeenCalled();
    press(r, 'Open Discover');
    expect(onDiscover).toHaveBeenCalled();
  });
  it('empty: says why and offers Discover and Refresh', () => {
    const l = list({ items: [] }); const onDiscover = jest.fn();
    const r = feed(l, true, onDiscover);
    expect(words(r)).toContain('No hot moments yet');
    press(r, 'Open Discover');
    expect(onDiscover).toHaveBeenCalledTimes(1);
    press(r, 'Refresh');
    expect(l.refresh).toHaveBeenCalled();
  });
  it('ready: the first card is active (pill, Pause); the next one is not', () => {
    const r = feed(list());
    expect(has(r, 'Pause preview')).toBe(true);
    expect(all(r, 'Sound off. Turn sound on')).toHaveLength(1);
    expect(has(r, 'Play Second from 1:00')).toBe(true);
  });
  it('swiping to the next card makes it the active one and stops the sound the first started', () => {
    const r = feed(list());
    scrollTo(r, 700);
    expect(mockActions['stopSound']).toHaveBeenCalledWith(ITEM);
    expect(all(r, 'Pause preview')).toHaveLength(1);
    expect(has(r, 'Play Why mornings matter from 14:32')).toBe(true);
  });
  it('a long list draws only the first cards, and only those read a curve (the window, not the whole list)', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ ...ITEM, episodeId: id, startMs: i * 1000 }));
    feed(list({ items: many }));
    const reads = mockHeat.mock.calls.filter((c) => c[1] === true).map((c) => c[0]);
    expect(new Set(reads)).toEqual(new Set(['a', 'b']));
  });
  it('mid-swipe changes nothing', () => {
    const r = feed(list());
    scrollTo(r, 350);
    expect(mockActions['stopSound']).not.toHaveBeenCalled();
  });
  it('Home leaving the front stops the card\'s preview and its sound', () => {
    const r = feed(list());
    act(() => { r.update(createElement(MomentsFeed, { list: list(), body: undefined, inFront: false, onDiscover: jest.fn() })); });
    expect(mockActions['stopSound']).toHaveBeenCalledWith(ITEM);
    expect(has(r, 'Pause preview')).toBe(false);
  });
  it('leaving the Moments view (the feed goes away) stops the sound too', () => {
    const r = feed(list());
    act(() => { r.unmount(); });
    mounted.splice(mounted.indexOf(r), 1);
    expect(mockActions['stopSound']).toHaveBeenCalledWith(ITEM);
  });
  it('a sound that is playing shows on its card', () => {
    mockPlayingKey = 'e1@872000';
    const r = feed(list());
    expect(words(r)).toContain('Sound on');
  });
  it('"Switch to this moment?" appears while something else plays; Switch confirms, Cancel does not', () => {
    mockPending = ITEM;
    const r = feed(list());
    expect(words(r)).toContain('Switch to this moment?');
    press(r, 'Switch');
    expect(mockActions['confirmSwitch']).toHaveBeenCalled();
    press(r, 'Cancel');
    expect(mockActions['cancelSwitch']).toHaveBeenCalled();
  });
  it('reaching the end asks for the next page', () => {
    const l = list({ more: true });
    const r = feed(l);
    act(() => { r.root.findAll((n) => typeof n.props['onEndReached'] === 'function')[0]!.props['onEndReached'](); });
    expect(l.loadMore).toHaveBeenCalled();
  });
});

describe('the switch', () => {
  function sw(view: 'moments' | 'discover', onChange = jest.fn(), onOpen = jest.fn()): ReactTestRenderer {
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(HomeSwitch, { view, onChange, ...(view === 'moments' ? { search: { label: 'Search. Trending: morning', onOpen } } : {}) })); });
    // The circle measures where it sits in the window; the test renderer's Views answer like laid-out ones.
    for (const n of r.root.findAll((x) => x.instance && typeof (x.instance as { measureInWindow?: unknown }).measureInWindow === 'function')) {
      (n.instance as { measureInWindow: unknown }).measureInWindow = (cb: (x: number, y: number) => void) => cb(0, 640);
    }
    mounted.push(r);
    return r;
  }
  it('two tabs, the chosen one selected; a tap on the other changes the view', () => {
    const onChange = jest.fn();
    const r = sw('moments', onChange);
    expect(btn(r, 'Moments').props['accessibilityState']).toEqual({ selected: true });
    expect(btn(r, 'Discover').props['accessibilityState']).toEqual({ selected: false });
    press(r, 'Discover');
    expect(onChange).toHaveBeenCalledWith('discover');
  });
  it('the search circle is on the Moments view only, and opens Search', () => {
    const onOpen = jest.fn();
    const r = sw('moments', jest.fn(), onOpen);
    press(r, 'Search. Trending: morning');
    expect(onOpen).toHaveBeenCalledWith(640);
    expect(has(sw('discover'), 'Search. Trending: morning')).toBe(false);
  });
});
