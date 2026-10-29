// Tests the Pulse now bar in every state of the drawings: playing, paused, buffering, hot moment, circle, hidden.
/**
 * M31 T022 (design-pulse2 index.html §Bars, "Every state"). The bar is drawn from props only (the
 * player lane wires the store). States: bar playing / paused, buffering (the play circle breathes in
 * hot — a still hot ring with Reduce Motion), inside a hot moment (ticker + 1 px hot ring on the
 * cover), the 52 circle while scrolling down, hidden on Moments / keyboard / the player / a sheet,
 * and the swipe-up and tap behaviours. The break that turns it red: show the clock while `hot` is set
 * (drop the `hot` branch of `tickerText`), or draw the bar on the Moments feed (`nowBarMode`).
 */
jest.useFakeTimers();
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { NowBar, nowBarMode, opensOnSwipe, shrinkAfterScroll, tickerText, useNowBarShrink, type NowBarProps } from '@/ui/kit/NowBar';
import { bars, colour } from '@/design';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });

const BASE: NowBarProps = {
  mode: 'bar', title: 'Why mornings matter', playing: true, positionMs: 752_000, durationMs: 2_890_000, bottom: 100,
  onToggle: jest.fn(), onOpen: jest.fn(), onQueue: jest.fn(),
};
function render(p: Partial<NowBarProps> = {}): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(NowBar, { ...BASE, ...p })); });
  mounted.push(r);
  return r;
}
const flat = (s: unknown) => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;
const hosts = (r: ReactTestRenderer, f: (n: ReactTestInstance) => boolean) => r.root.findAll((n) => typeof n.type === 'string' && f(n));
const byId = (r: ReactTestRenderer, id: string) => hosts(r, (n) => n.props['testID'] === id);
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => [x.props['children']].flat(5).join(''));
const button = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0]!;

describe('which form the bar takes', () => {
  it('bar by default; the circle while scrolling down', () => {
    expect(nowBarMode({})).toBe('bar');
    expect(nowBarMode({ shrunk: true })).toBe('circle');
  });
  it('hidden on the Moments feed, with the keyboard up, on the player, and under a sheet — and it beats the circle', () => {
    for (const k of ['moments', 'keyboard', 'playerOpen', 'sheetOpen'] as const) {
      expect(nowBarMode({ [k]: true })).toBe('hidden');
      expect(nowBarMode({ [k]: true, shrunk: true })).toBe('hidden');
    }
  });
});

describe('shrinking on scroll (useNowBarShrink)', () => {
  it('down shrinks, up restores, the top restores, a small jiggle changes nothing', () => {
    expect(shrinkAfterScroll(0, 120, false)).toBe(true);
    expect(shrinkAfterScroll(120, 60, true)).toBe(false);
    expect(shrinkAfterScroll(120, 0, true)).toBe(false);
    expect(shrinkAfterScroll(120, 122, true)).toBe(true);
    expect(shrinkAfterScroll(120, 118, false)).toBe(false);
  });
  it('600 ms still brings the bar back', () => {
    let hook!: ReturnType<typeof useNowBarShrink>;
    const Probe = () => { hook = useNowBarShrink(); return null; };
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(Probe)); });
    mounted.push(r);
    const scroll = (y: number) => act(() => hook.onScroll({ nativeEvent: { contentOffset: { y, x: 0 } } } as never));
    expect(hook.shrunk).toBe(false);
    scroll(200);
    expect(hook.shrunk).toBe(true);
    act(() => { jest.advanceTimersByTime(500); });
    expect(hook.shrunk).toBe(true);
    act(() => { jest.advanceTimersByTime(150); });
    expect(hook.shrunk).toBe(false);
    scroll(400);
    expect(hook.shrunk).toBe(true);
    scroll(100); // scrolling up
    expect(hook.shrunk).toBe(false);
  });
});

describe('the bar', () => {
  it('playing: the cover, the title on one line, the clock "12:32 / 48:10", Pause, Playlist — 58 tall, 10 from the sides, 100 up', () => {
    const r = render();
    expect(words(r)).toEqual(['Why mornings matter', '12:32 / 48:10']);
    const title = r.root.findAll((n) => String(n.type) === 'Text' && n.props['children'] === 'Why mornings matter')[0]!;
    expect(title.props['numberOfLines']).toBe(1);
    expect(button(r, 'Pause').props['accessibilityState']).toMatchObject({ selected: true });
    expect(button(r, 'Playlist')).toBeTruthy();
    expect(button(r, 'Now playing: Why mornings matter. Open the player.')).toBeTruthy();
    const box = flat(byId(r, 'now-bar')[0]!.props['style']);
    expect(box).toMatchObject({ position: 'absolute', left: bars.nowSide, right: bars.nowSide, bottom: 100 });
    const inner = hosts(r, (n) => flat(n.props['style'])['minHeight'] === bars.now);
    expect(inner.length).toBeGreaterThan(0);
    expect(flat(byId(r, 'now-cover')[0]!.props['style'])).toMatchObject({ width: bars.cover, height: bars.cover });
  });

  it('paused: the glyph says Play, and the state follows', () => {
    const r = render({ playing: false });
    expect(button(r, 'Play').props['accessibilityState']).toMatchObject({ selected: false });
    expect(r.root.findAll((n) => n.props['name'] === 'play').length).toBeGreaterThan(0);
  });

  it('the progress line is 2 px, hot to violet, as wide as the position (26 %)', () => {
    const r = render();
    const line = byId(r, 'now-progress')[0]!;
    expect(flat(line.props['style'])).toMatchObject({ width: '26%', height: bars.progress });
    expect(r.root.findAll((n) => Array.isArray(n.props['colors']) && n.props['colors'].length === 2).length).toBeGreaterThan(0);
    const none = render({ durationMs: undefined, positionMs: 5000 });
    expect(flat(byId(none, 'now-progress')[0]!.props['style'])['width']).toBe('0%');
  });

  it('buffering: the play circle gets a hot edge (static with Reduce Motion) and says it is busy', () => {
    const r = render({ buffering: true });
    expect(flat(byId(r, 'now-play-ring')[0]!.props['style'])).toMatchObject({ borderWidth: 2, borderColor: colour.hot });
    expect(button(r, 'Pause').props['accessibilityState']).toMatchObject({ busy: true });
    expect(flat(byId(render(), 'now-play-ring')[0]!.props['style'])['borderWidth']).toBeUndefined();
  });

  it('buffering with motion: the edge breathes (an opacity loop is running)', () => {
    setReducedMotionForTest(false);
    const r = render({ buffering: true });
    const ring = byId(r, 'now-play-ring')[0]!;
    expect(flat(ring.props['style'])).toHaveProperty('opacity');
    act(() => { jest.advanceTimersByTime(1500); });
    expect(Number(flat(byId(r, 'now-play-ring')[0]!.props['style'])['opacity'])).toBeLessThanOrEqual(1);
  });

  it('inside a hot moment: "🔥 41 reacting at 14:32" in hot-text, and a 1 px hot ring on the cover', () => {
    const r = render({ hot: { count: 41, atMs: 872_000 } });
    expect(words(r)).toContain('🔥 41 reacting at 14:32');
    expect(words(r)).not.toContain('12:32 / 48:10');
    expect(flat(byId(r, 'now-hot-ring')[0]!.props['style'])).toMatchObject({ borderWidth: 1, borderColor: colour.hot });
    const ticker = r.root.findAll((n) => String(n.type) === 'Text' && String(n.props['children']).startsWith('🔥'))[0]!;
    expect(String(ticker.props['className'])).toContain('text-hotText');
    expect(byId(render(), 'now-hot-ring')).toHaveLength(0);
  });

  it('a note (the sleep timer) follows the clock', () => {
    expect(tickerText(5000, 60_000, undefined, ' · sleep 12:00')).toBe('0:05 / 1:00 · sleep 12:00');
    expect(tickerText(5000, undefined)).toBe('0:05');
  });

  it('the taps: the bar opens the player, the circle toggles, the list opens the queue', () => {
    const onToggle = jest.fn(); const onOpen = jest.fn(); const onQueue = jest.fn();
    const r = render({ onToggle, onOpen, onQueue });
    act(() => { button(r, 'Pause').props['onPress'](); });
    act(() => { button(r, 'Playlist').props['onPress'](); });
    act(() => { button(r, 'Now playing: Why mornings matter. Open the player.').props['onPress'](); });
    expect([onToggle, onQueue, onOpen].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('swipe up opens the player; a small or downward move does not', () => {
    expect(opensOnSwipe(-40, 0)).toBe(true);
    expect(opensOnSwipe(-5, -0.8)).toBe(true); // a quick flick
    expect(opensOnSwipe(-10, -0.1)).toBe(false);
    expect(opensOnSwipe(60, 0.9)).toBe(false);
    const handlers = byId(render(), 'now-bar')[0]!.props;
    expect(typeof handlers['onResponderRelease']).toBe('function');
  });
});

describe('the circle and hidden forms', () => {
  it('circle: 52, at the right, with the progress arc; tapping opens the player', () => {
    const onOpen = jest.fn();
    const r = render({ mode: 'circle', onOpen });
    const circle = byId(r, 'now-circle')[0]!;
    expect(flat(circle.props['style'])).toMatchObject({ right: bars.nowSide, width: bars.nowCircle, height: bars.nowCircle, bottom: 100 });
    expect(byId(r, 'now-bar')).toHaveLength(0);
    const arc = r.root.findAll((n) => n.props['testID'] === 'now-circle-arc')[0]!;
    const full = 2 * Math.PI * (bars.nowCircle / 2 - 2);
    expect(Number(arc.props['strokeDashoffset'])).toBeCloseTo(full * (1 - 752_000 / 2_890_000), 3);
    act(() => { button(r, 'Now playing: Why mornings matter. Open the player.').props['onPress'](); });
    expect(onOpen).toHaveBeenCalled();
  });

  it('hidden: nothing is drawn (no bar, no circle, nothing for a screen reader to announce twice)', () => {
    const r = render({ mode: 'hidden' });
    expect(r.toJSON()).toBeNull();
  });

  it('going hidden removes it, coming back draws it', () => {
    const r = render();
    expect(byId(r, 'now-bar')).toHaveLength(1);
    act(() => { r.update(createElement(NowBar, { ...BASE, mode: 'hidden' })); });
    expect(r.toJSON()).toBeNull();
    act(() => { r.update(createElement(NowBar, { ...BASE, mode: 'bar' })); });
    expect(byId(r, 'now-bar')).toHaveLength(1);
    act(() => { r.update(createElement(NowBar, { ...BASE, mode: 'circle' })); });
    expect(byId(r, 'now-circle')).toHaveLength(1);
  });
});
