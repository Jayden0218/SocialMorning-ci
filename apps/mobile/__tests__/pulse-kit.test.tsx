// Tests the Pulse kit parts: buttons, chip, toggle, timestamp chip, title bar, fade, edge label, curve, ring, sheet, dialog, toast, empty block.
/**
 * M31 T022 (design-pulse2 `kit.css` + index.html §Bars). One render test per part, on the sizes,
 * states and behaviours the drawings give. The breaks that turn them red are named at each test.
 */
jest.useFakeTimers();
import { createElement } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { bars, colour, radius, typeScale } from '@/design';
import { ActionSheet, closesOnRelease } from '@/ui/kit/ActionSheet';
import { Chip } from '@/ui/kit/Chip';
import { Curve } from '@/ui/kit/Curve';
import { Dialog } from '@/ui/kit/Dialog';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { EmptyState, splitSentence } from '@/ui/kit/EmptyState';
import { Fade } from '@/ui/kit/Fade';
import { IconButton, PulseButton } from '@/ui/kit/PulseButton';
import { Ring } from '@/ui/kit/RingScrubber';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { TitleBar } from '@/ui/kit/TitleBar';
import { Toast } from '@/ui/kit/Toast';
import { Toggle } from '@/ui/kit/Toggle';
import { Type } from '@/ui/kit/Type';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { playedColour } from '@/ui/kit/pulse-math';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
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
const flat = (s: unknown) => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;
const hosts = (r: ReactTestRenderer, f: (n: ReactTestInstance) => boolean) => r.root.findAll((n) => typeof n.type === 'string' && f(n));
const byId = (r: ReactTestRenderer, id: string) => hosts(r, (n) => n.props['testID'] === id);
const words = (r: ReactTestRenderer | ReactTestInstance): string[] => ('root' in r ? r.root : r).findAll((x) => String(x.type) === 'Text').map((x) => [x.props['children']].flat(5).join(''));
const val = (x: unknown): unknown => (x !== null && typeof x === 'object' && '__getValue' in x ? (x as { __getValue: () => unknown }).__getValue() : x);
const host = (r: ReactTestRenderer, label: string) => hosts(r, (n) => n.props['accessibilityLabel'] === label)[0]!;
const press = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0]!;
const classOf = (n: ReactTestInstance) => String(n.props['className'] ?? '');

describe('Type', () => {
  it('a step is its face, size and colour classes plus its line height and tracking as a style', () => {
    const r = render(createElement(Type, { step: 'hero', className: 'text-text' }, 'Why mornings matter'));
    const t = r.root.findAll((n) => String(n.type) === 'Text')[0]!;
    expect(classOf(t)).toContain('font-display');
    expect(classOf(t)).toContain('text-pulse-hero');
    expect(classOf(t)).toContain('text-text');
    expect(flat(t.props['style'])).toMatchObject({ lineHeight: 38, letterSpacing: typeScale.hero.tracking }); // drawn 31; Unbounded is 1.24 tall
  });
});

describe('buttons', () => {
  it.each([
    ['light', 'bg-text', 'text-void'],
    ['hot', 'bg-hot', 'text-void'],
    ['ring', 'border-outline', 'text-text'],
    ['quiet', 'bg-raise', 'text-text'],
  ] as const)('%s: fill %s, words %s — 48 tall, a full pill', (kind, fill, wordsClass) => {
    const onPress = jest.fn();
    const r = render(createElement(PulseButton, { label: 'Discover', kind, onPress }));
    const b = press(r, 'Discover');
    expect(classOf(b)).toContain(fill);
    expect(classOf(b)).toContain('rounded-pill');
    expect(flat(b.props['style'])).toMatchObject({ height: 48 });
    expect(classOf(r.root.findAll((n) => String(n.type) === 'Text' && n.props['children'] === 'Discover')[0]!)).toContain(wordsClass);
    act(() => { b.props['onPress'](); });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('words on hot are void — never white (white on hot is 3.21)', () => {
    const r = render(createElement(PulseButton, { label: 'Go', kind: 'hot', onPress: jest.fn() }));
    const t = r.root.findAll((n) => String(n.type) === 'Text' && n.props['children'] === 'Go')[0]!;
    expect(classOf(t)).toContain('text-void');
    expect(classOf(t)).not.toContain('text-white');
  });
  it('disabled: dimmed and no press; busy: the press is dropped and it says so', () => {
    const onPress = jest.fn();
    const d = render(createElement(PulseButton, { label: 'Send', onPress, disabled: true }));
    expect(d.root.findAll((n) => n.props['accessibilityLabel'] === 'Send' && typeof n.props['onPress'] === 'function')).toHaveLength(0);
    expect(host(d, 'Send').props['accessibilityState']).toMatchObject({ disabled: true });
    const b = render(createElement(PulseButton, { label: 'Send', onPress, busy: true }));
    expect(b.root.findAll((n) => n.props['accessibilityLabel'] === 'Send' && typeof n.props['onPress'] === 'function')).toHaveLength(0);
    expect(host(b, 'Send').props['accessibilityState']).toMatchObject({ busy: true });
  });
  it('the icon button is a 44 circle with a name; `fill` puts a raise disc behind it; a 36 one keeps a 44 tap area', () => {
    const r = render(createElement(IconButton, { icon: 'chevron-back', label: 'Back', onPress: jest.fn(), fill: true }));
    expect(flat(press(r, 'Back').props['style'])).toMatchObject({ width: 44, height: 44 });
    expect(classOf(press(r, 'Back'))).toContain('bg-raise');
    const small = render(createElement(IconButton, { icon: 'close', label: 'Close', onPress: jest.fn(), diameter: 36 }));
    expect(flat(press(small, 'Close').props['style'])).toMatchObject({ width: 36, height: 36 });
    expect(press(small, 'Close').props['hitSlop']).toBe(4);
  });
});

describe('chip and toggle', () => {
  it('chip: 36 tall pill, raise with a line; chosen it is the text fill with void words', () => {
    const idle = render(createElement(Chip, { label: 'News', onPress: jest.fn() }));
    expect(flat(press(idle, 'News').props['style'])).toMatchObject({ height: bars.chip });
    expect(classOf(press(idle, 'News'))).toContain('bg-raise');
    const on = render(createElement(Chip, { label: 'News', chosen: true, onPress: jest.fn() }));
    expect(classOf(press(on, 'News'))).toContain('bg-text');
    expect(press(on, 'News').props['accessibilityState']).toMatchObject({ selected: true });
    expect(classOf(on.root.findAll((n) => String(n.type) === 'Text')[0]!)).toContain('text-void');
    expect(press(idle, 'News').props['hitSlop']).toMatchObject({ top: 4, bottom: 4 });
  });
  it('toggle: 46 × 28, off = the grey track with a text2 thumb, on = the hot track with a void thumb', () => {
    const off = render(createElement(Toggle, { value: false, onChange: jest.fn(), label: 'Autoplay' }));
    const track = (r: ReactTestRenderer) => hosts(r, (n) => flat(n.props['style'])['width'] === 46)[0]!;
    expect(flat(track(off).props['style'])).toMatchObject({ width: 46, height: 28 });
    expect(classOf(track(off))).toContain('bg-switchOff');
    expect(off.root.findAll((n) => classOf(n).includes('bg-text2')).length).toBeGreaterThan(0);
    const on = render(createElement(Toggle, { value: true, onChange: jest.fn(), label: 'Autoplay' }));
    expect(classOf(track(on))).toContain('bg-hot');
    expect(on.root.findAll((n) => classOf(n).includes('bg-void')).length).toBeGreaterThan(0);
  });
});

describe('timestamp chip', () => {
  it('soft: hot-text on hot at 16 %, at least 22 tall (minHeight, F10), radius 7; solid: void on hot', () => {
    const soft = render(createElement(TimestampChip, { text: '14:32' }));
    const box = hosts(soft, (n) => flat(n.props['style'])['minHeight'] === bars.stamp)[0]!;
    expect(classOf(box)).toContain('bg-hotSoft');
    expect(classOf(box)).toContain('rounded-chip');
    expect(classOf(soft.root.findAll((n) => String(n.type) === 'Text')[0]!)).toContain('text-hotText');
    const solid = render(createElement(TimestampChip, { text: 'HOT · 14:32 – 15:10', solid: true }));
    expect(classOf(hosts(solid, (n) => flat(n.props['style'])['minHeight'] === bars.stamp)[0]!)).toContain('bg-hot');
    expect(classOf(solid.root.findAll((n) => String(n.type) === 'Text')[0]!)).toContain('text-void');
  });
  it('with a press it is a button named "Play from 14:32" with a 44 tap area; without one it is not', () => {
    const onPress = jest.fn();
    const r = render(createElement(TimestampChip, { text: '14:32', onPress }));
    const b = press(r, 'Play from 14:32');
    expect(b.props['hitSlop']).toMatchObject({ top: 11, bottom: 11 });
    act(() => { b.props['onPress'](); });
    expect(onPress).toHaveBeenCalled();
    expect(render(createElement(TimestampChip, { text: '14:32' })).root.findAll((n) => n.props['accessibilityRole'] === 'button')).toHaveLength(0);
  });
});

describe('title bar', () => {
  const bar = (p: Partial<React.ComponentProps<typeof TitleBar>> = {}) => render(createElement(TitleBar, { title: 'Downloads', subtitle: '12 episodes · 1.4 GB', bottom: 168, onBack: jest.fn(), actions: [{ icon: 'ellipsis-horizontal', label: 'More', onPress: jest.fn() }], ...p }));
  const title = (r: ReactTestRenderer) => r.root.findAll((n) => n.props['accessibilityRole'] === 'header')[0]!;

  it('sits at `bottom` over the content, side padding 20, with the back circle, the title, the subtitle and the action', () => {
    const r = bar();
    const box = hosts(r, (n) => flat(n.props['style'])['bottom'] === 168)[0]!;
    expect(flat(box.props['style'])).toMatchObject({ bottom: 168, paddingHorizontal: 20, zIndex: 20 });
    expect(press(r, 'Back')).toBeTruthy();
    expect(press(r, 'More')).toBeTruthy();
    expect(words(r)).toContain('12 episodes · 1.4 GB');
    expect(title(r).props['accessibilityLabel']).toBe('Downloads');
  });
  it('the title is Unbounded 30 on up to 2 lines (one word: 1 line that shrinks to fit, F10); once scrolled it is 20 on one line', () => {
    const big = bar({ title: 'Recent downloads' });
    expect([val(flat(title(big).props['style'])['fontSize']), val(flat(title(big).props['style'])['lineHeight'])]).toEqual([30, 38]);
    expect(title(big).props['numberOfLines']).toBe(2);
    const small = bar({ shrunk: true });
    expect(val(flat(title(small).props['style'])['fontSize'])).toBe(20);
    expect(title(small).props['numberOfLines']).toBe(1);
  });
  it('F3: a one-word title runs on under the action circles (drawn: Downloads) instead of wrapping into letters; a title of words keeps its own width', () => {
    const wrap = (r: ReactTestRenderer) => flat(hosts(r, (n) => n.props['testID'] === 'title-bar-title')[0]!.props['style']);
    const two = [{ icon: 'settings-outline' as const, label: 'Download settings', onPress: jest.fn() }, { icon: 'checkmark' as const, label: 'Select', onPress: jest.fn() }];
    expect(wrap(bar({ actions: two }))['marginRight']).toBe(-(2 * (44 + 12)));
    expect(wrap(bar())['marginRight']).toBe(-(44 + 12));
    expect(wrap(bar({ title: 'Slow mornings', actions: two }))['marginRight']).toBe(0);
    expect(wrap(bar({ actions: [] }))['marginRight']).toBe(0);
  });
  it('a narrow phone uses the 16 gutter', () => {
    (useWindowDimensions as unknown as jest.Mock).mockReturnValue({ width: 360, height: 640, scale: 3, fontScale: 1 });
    const r = bar();
    expect(flat(hosts(r, (n) => flat(n.props['style'])['bottom'] === 168)[0]!.props['style'])['paddingHorizontal']).toBe(16);
    (useWindowDimensions as unknown as jest.Mock).mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  });
  it('large text: three lines before it cuts, the full name stays in the label', () => {
    (useWindowDimensions as unknown as jest.Mock).mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1.6 });
    const r = bar({ title: 'A very long title that will wrap' });
    expect(title(r).props['numberOfLines']).toBe(3);
    expect(title(r).props['accessibilityLabel']).toBe('A very long title that will wrap');
    (useWindowDimensions as unknown as jest.Mock).mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  });
  it('no back on a tab screen; at most two actions; a subtitle link is hot-text and pressable', () => {
    const onSubtitle = jest.fn();
    const three = ['a', 'b', 'c'].map((l) => ({ icon: 'download-outline' as const, label: l, onPress: jest.fn() }));
    const r = render(createElement(TitleBar, { title: 'Updates', subtitle: 'My subscriptions · 6 ›', onSubtitle, actions: three, bottom: 100 }));
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Back')).toHaveLength(0);
    expect(hosts(r, (n) => ['a', 'b', 'c'].includes(n.props['accessibilityLabel']) && n.props['accessibilityRole'] === 'button').map((n) => n.props['accessibilityLabel'])).toEqual(['a', 'b']);
    act(() => { press(r, 'My subscriptions · 6 ›').props['onPress'](); });
    expect(onSubtitle).toHaveBeenCalled();
    expect(classOf(r.root.findAll((n) => String(n.type) === 'Text' && n.props['children'] === 'My subscriptions · 6 ›')[0]!)).toContain('text-hotText');
  });
  it('an extra (the search field) is drawn above the row', () => {
    const r = bar({ extra: createElement(Type, { step: 'body', className: 'text-text' }, 'Search field') });
    expect(words(r)).toContain('Search field');
  });
});

describe('fade and edge label', () => {
  it('fade: 200 tall by default (Discover asks for 360) at `bottom`, transparent to void at 55 %, never takes a touch', () => {
    const r = render(createElement(Fade, { bottom: 160 }));
    const g = r.root.findAll((n) => Array.isArray(n.props['colors']))[0]!;
    expect(g.props['locations']).toEqual([0, 0.55, 1]);
    expect(flat(g.props['style'])).toMatchObject({ bottom: 160, height: 200, zIndex: 15 });
    expect(g.props['pointerEvents']).toBe('none');
  });
  it('edge label: the section name in Unbounded 11, spaced, uppercase, text3, still a header for a screen reader', () => {
    const r = render(createElement(EdgeLabel, { label: "Today's pick", top: 30 }));
    const h = r.root.findAll((n) => n.props['accessibilityRole'] === 'header')[0]!;
    expect(h.props['accessibilityLabel']).toBe("Today's pick");
    // The unconstrained measuring copy and the turned label: the same words twice.
    expect(words(r)).toEqual(["TODAY'S PICK", "TODAY'S PICK"]);
    const t = r.root.findAll((n) => String(n.type) === 'Text' && n.props['numberOfLines'] === 1)[0]!;
    expect(classOf(t)).toContain('text-text3');
    expect(classOf(t)).toContain('font-display');
    expect(flat(t.props['style'])).toMatchObject({ letterSpacing: typeScale.edge.tracking });
    expect(JSON.stringify(flat(t.props['style'])['transform'])).toContain('-90deg');
  });
});

describe('curve (the heat bars)', () => {
  const data = Array.from({ length: 100 }, (_, k) => (k === 30 ? 1 : 0.1));
  const barsOf = (r: ReactTestRenderer) => byId(r, 'curve-bar').map((b) => flat(b.props['style']));
  it('50 bars; each min + (height − min) × v tall; the hot bucket is the tallest', () => {
    const r = render(createElement(Curve, { data, height: 24 }));
    const b = barsOf(r);
    expect(b).toHaveLength(50);
    expect(Math.max(...b.map((x) => Number(x['height'])))).toBe(24);
    expect(Math.min(...b.map((x) => Number(x['height'])))).toBe(Math.round(3 + 21 * 0.1));
  });
  it('unplayed bars are barIdle; played ones run hot to violet', () => {
    const r = render(createElement(Curve, { data, played: 0.2 }));
    const b = barsOf(r);
    expect(b[10]!['backgroundColor']).toBe(colour.barIdle);
    expect(b[0]!['backgroundColor']).toBe(playedColour(0, 10));
    expect(b[9]!['backgroundColor']).toBe(playedColour(9, 10));
    expect(b[0]!['backgroundColor']).not.toBe(b[9]!['backgroundColor']);
  });
  it('hotRange lights a run of bars hot with a glow; glow adds it to played bars', () => {
    const r = render(createElement(Curve, { data, hotRange: [20, 24] }));
    const b = barsOf(r);
    expect([19, 20, 24, 25].map((i) => b[i]!['backgroundColor'])).toEqual([colour.barIdle, colour.hot, colour.hot, colour.barIdle]);
    expect(b[20]!['shadowColor']).toBe(colour.hot);
    expect(b[19]!['shadowColor']).toBeUndefined();
    const g = barsOf(render(createElement(Curve, { data, played: 0.5, glow: true })));
    expect(g[0]!['shadowColor']).toBe(colour.hot);
    expect(g[40]!['shadowColor']).toBeUndefined();
  });
  it('flat: every bar the same height in the line colour (the empty state)', () => {
    const b = barsOf(render(createElement(Curve, { data: [], count: 40, height: 20, min: 20, flat: true })));
    expect(b).toHaveLength(40);
    expect(new Set(b.map((x) => x['height']))).toEqual(new Set([20]));
    expect(new Set(b.map((x) => x['backgroundColor']))).toEqual(new Set([colour.line]));
  });
  it('described it is an image, seekable it is adjustable, plain it is hidden from a screen reader', () => {
    expect(hosts(render(createElement(Curve, { data, accessibilityLabel: 'Where people reacted' })), (n) => n.props['accessibilityRole'] === 'image')).toHaveLength(1);
    expect(hosts(render(createElement(Curve, { data, accessibilityLabel: 'Seek', onSeek: jest.fn() })), (n) => n.props['accessibilityRole'] === 'adjustable')).toHaveLength(1);
    const plain = render(createElement(Curve, { data }));
    expect(hosts(plain, (n) => n.props['importantForAccessibility'] === 'no-hide-descendants').length).toBeGreaterThan(0);
  });
});

describe('ring', () => {
  const heat = Array.from({ length: 100 }, (_, k) => (k % 10) / 10);
  const lines = (r: ReactTestRenderer) => r.root.findAll((n) => String(n.type) === 'RNSVGLine');
  it('100 spokes; the played ones are graded hot to violet, the rest barIdle', () => {
    const r = render(createElement(Ring, { heat, progress: 0.26, size: 330 }));
    const l = lines(r);
    expect(l).toHaveLength(100);
    const stroke = (i: number) => l[i]!.props['stroke'];
    expect(stroke(60)).toBeDefined();
    expect(JSON.stringify(l[0]!.props)).not.toContain('NaN');
    expect(new Set(l.map((x) => JSON.stringify(x.props['stroke']))).size).toBeGreaterThan(5); // a gradient, not one colour
  });
  it('the knob sits where the progress is; a quarter in is at 3 o\'clock', () => {
    const r = render(createElement(Ring, { heat, progress: 0.25, size: 330 }));
    const knob = byId(r, 'ring-knob')[0]!;
    const s = flat(knob.props['style']);
    // centre of the knob + halo = the point on the ring a quarter round, to the right of the middle
    expect(Number(s['left']) + Number(s['width']) / 2).toBeGreaterThan(165);
    expect(Number(s['top']) + Number(s['height']) / 2).toBeCloseTo(165, 0);
    expect(byId(render(createElement(Ring, { heat, progress: 0.25, knob: false })), 'ring-knob')).toHaveLength(0);
  });
  it('pins are 18 pt avatar discs on the rim; with a press they are 44 pt buttons', () => {
    const onPress = jest.fn();
    const r = render(createElement(Ring, { heat, progress: 0, pins: [{ at: 0.15 }, { at: 0.3, colour: colour.violet, onPress, label: 'Comment at 4:20' }] }));
    const pins = byId(r, 'ring-pin');
    expect(pins).toHaveLength(2);
    expect(flat(pins[0]!.props['style'])).toMatchObject({ width: 18, height: 18, borderWidth: 2, borderColor: colour.void });
    act(() => { press(r, 'Comment at 4:20').props['onPress'](); });
    expect(onPress).toHaveBeenCalled();
  });
  it('seek by drag: a touch reports the fraction round the ring; releasing reports the end', () => {
    const onSeek = jest.fn(); const onSeekEnd = jest.fn();
    const r = render(createElement(Ring, { heat, progress: 0, size: 300, onSeek, onSeekEnd }));
    const ring = byId(r, 'ring')[0]!;
    // A one-finger touch as React Native's responder system hands it over.
    const touch = (x: number, y: number, t: number) => {
      const p = { touchActive: true, startPageX: 290, startPageY: 150, startTimeStamp: 0, currentPageX: x, currentPageY: y, currentTimeStamp: t, previousPageX: x, previousPageY: y, previousTimeStamp: t };
      return { nativeEvent: { locationX: x, locationY: y, pageX: x, pageY: y, identifier: 1, timestamp: t, touches: [{ identifier: 1, pageX: x, pageY: y, locationX: x, locationY: y, timestamp: t }], changedTouches: [{ identifier: 1, pageX: x, pageY: y, locationX: x, locationY: y, timestamp: t }] }, touchHistory: { touchBank: [p], numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: t } };
    };
    act(() => { ring.props['onResponderGrant'](touch(290, 150, 1)); });
    expect(onSeek).toHaveBeenLastCalledWith(expect.closeTo(0.25, 3)); // 3 o'clock
    act(() => { ring.props['onResponderMove'](touch(150, 290, 2)); });
    expect(onSeek).toHaveBeenLastCalledWith(expect.closeTo(0.5, 3)); // 6 o'clock
    act(() => { ring.props['onResponderRelease'](touch(10, 150, 3)); });
    expect(onSeekEnd).toHaveBeenLastCalledWith(expect.closeTo(0.75, 3));
  });
  it('adjustable for a screen reader: up/down is one step; not seekable, it is not a control', () => {
    const onStep = jest.fn();
    const r = render(createElement(Ring, { heat, progress: 0.1, onSeek: jest.fn(), onStep, label: 'Seek', valueText: '12:32 of 48:10' }));
    const ring = byId(r, 'ring')[0]!;
    expect(ring.props['accessibilityRole']).toBe('adjustable');
    expect(ring.props['accessibilityValue']).toEqual({ text: '12:32 of 48:10' });
    act(() => { ring.props['onAccessibilityAction']({ nativeEvent: { actionName: 'increment' } }); });
    act(() => { ring.props['onAccessibilityAction']({ nativeEvent: { actionName: 'decrement' } }); });
    expect(onStep.mock.calls).toEqual([[1], [-1]]);
    expect(byId(render(createElement(Ring, { heat, progress: 0.1 })), 'ring')[0]!.props['accessible']).toBe(false);
  });
  it('the cover goes in the middle, round, 62 % of the ring', () => {
    const r = render(createElement(Ring, { heat, progress: 0, size: 330 }, createElement(Type, { step: 'body', className: 'text-text' }, 'COVER')));
    const cover = hosts(r, (n) => flat(n.props['style'])['width'] === 330 * 0.62)[0]!;
    expect(classOf(cover)).toContain('rounded-pill');
    expect(words(cover)).toEqual(['COVER']);
  });
});

describe('action sheet, dialog, toast', () => {
  it('sheet: raise2, 32 corners, a grabber, a title with a close circle; the scrim and Close close it', () => {
    const onClose = jest.fn();
    const r = render(createElement(ActionSheet, { open: true, onClose, label: 'More', title: 'More' }, createElement(Type, { step: 'body', className: 'text-text' }, 'Share')));
    const sheet = byId(r, 'action-sheet')[0]!;
    expect(flat(sheet.props['style'])).toMatchObject({ backgroundColor: colour.raise2, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: 20 });
    expect(sheet.props['accessibilityViewIsModal']).toBe(true);
    expect(flat(byId(r, 'action-sheet-grab')[0]!.props['style'])).toMatchObject({ width: 36, height: 5 });
    expect(words(r)).toEqual(['More', 'Share']);
    const closers = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Close' && typeof n.props['onPress'] === 'function');
    expect(closers.length).toBeGreaterThanOrEqual(2); // the scrim and the circle
    act(() => { closers[0]!.props['onPress'](); });
    expect(onClose).toHaveBeenCalled();
  });
  /** M31 S-C (design-pulse2 `pending-deletion--sheet`: "no close, no backdrop tap"). Break: ignore `locked` in the scrim's `onPress`. */
  it('a locked sheet has no way out of its own: the scrim does nothing, Back does nothing, the grabber takes no drag, there is no close circle', () => {
    const onClose = jest.fn();
    const r = render(createElement(ActionSheet, { open: true, onClose, label: 'Keep', locked: true }, createElement(Type, { step: 'body', className: 'text-text' }, 'Keep it?')));
    const scrim = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Close')[0]!;
    expect(scrim.props['onPress']).toBeUndefined();
    expect(scrim.props['accessibilityElementsHidden']).toBe(true);
    const modal = r.root.findAll((n) => typeof n.props['onRequestClose'] === 'function')[0]!;
    act(() => { modal.props['onRequestClose'](); });
    expect(onClose).not.toHaveBeenCalled();
    const sheet = byId(r, 'action-sheet')[0]!;
    expect(sheet.props['onAccessibilityEscape']).toBeUndefined();
    const grab = byId(r, 'action-sheet-grab-zone')[0]!;
    expect(grab.props['onStartShouldSetResponder']?.()).toBeFalsy();
  });
  it('closed it draws nothing; a drag down far or fast enough closes it', () => {
    expect(render(createElement(ActionSheet, { open: false, onClose: jest.fn(), label: 'x' })).root.findAll((n) => n.props['testID'] === 'action-sheet')).toHaveLength(0);
    expect(closesOnRelease(120, 0)).toBe(true);
    expect(closesOnRelease(10, 0.9)).toBe(true);
    expect(closesOnRelease(30, 0.1)).toBe(false);
  });
  it('dialog: a title, a line, two buttons side by side; three stack; closed it draws nothing', () => {
    const cancel = jest.fn(); const ok = jest.fn();
    const r = render(createElement(Dialog, { open: true, title: 'Delete this voice status?', body: 'It is removed for everyone now.', onClose: cancel, buttons: [{ label: 'Cancel', onPress: cancel }, { label: 'Delete', kind: 'hot', onPress: ok }] }));
    expect(words(r)).toEqual(['Delete this voice status?', 'It is removed for everyone now.', 'Cancel', 'Delete']);
    const box = byId(r, 'dialog')[0]!;
    expect(flat(box.props['style'])).toMatchObject({ marginHorizontal: 28, padding: 22, borderRadius: 28, backgroundColor: colour.raise2 });
    expect(classOf(press(r, 'Delete'))).toContain('bg-hot');
    expect(classOf(press(r, 'Cancel'))).toContain('bg-raise');
    act(() => { press(r, 'Delete').props['onPress'](); });
    expect(ok).toHaveBeenCalled();
    expect(render(createElement(Dialog, { open: false, title: 'x', onClose: cancel, buttons: [] })).toJSON()).toBeNull();
  });
  it('toast: 50 tall, 14 from the sides, the light fill with void words; the action is a button', () => {
    const onAction = jest.fn();
    const r = render(createElement(Toast, { text: 'Added to queue', action: 'Undo', onAction, bottom: 176 }));
    const t = byId(r, 'toast')[0]!;
    expect(flat(t.props['style'])).toMatchObject({ left: 14, right: 14, bottom: 176, height: 50, borderRadius: 16 });
    expect(classOf(t)).toContain('bg-text');
    expect(t.props['accessibilityLiveRegion']).toBe('polite');
    expect(classOf(r.root.findAll((n) => String(n.type) === 'Text' && n.props['children'] === 'Added to queue')[0]!)).toContain('text-void');
    act(() => { press(r, 'Undo').props['onPress'](); });
    expect(onAction).toHaveBeenCalled();
    expect(render(createElement(Toast, { text: 'Saved', bottom: 100 })).root.findAll((n) => n.props['accessibilityRole'] === 'button')).toHaveLength(0);
  });
});

describe('empty state (the shared block)', () => {
  it('a page empty is a flat curve, a title, a line and one light button', () => {
    const r = render(createElement(EmptyState, { surface: 'library', page: true }));
    expect(byId(r, 'curve-bar')).toHaveLength(40);
    expect(words(r)).toEqual(['No subscriptions yet.', 'Pick something to listen to.', 'Discover']);
    expect(classOf(press(r, 'Discover'))).toContain('bg-text');
  });
  it('splitSentence takes the first sentence as the title', () => {
    expect(splitSentence('No subscriptions yet. Pick something to listen to.')).toEqual({ title: 'No subscriptions yet.', line: 'Pick something to listen to.' });
    expect(splitSentence('Nothing matches')).toEqual({ title: 'Nothing matches', line: '' });
  });
  it('offline, whole page: the statement sentence and Retry as the light pill', () => {
    const r = render(createElement(EmptyState, { surface: 'feed', page: true, offline: true, onRetry: jest.fn() }));
    expect(words(r)).toContain("You're offline and nothing is saved here yet.");
    expect(classOf(press(r, 'Retry'))).toContain('bg-text');
  });
});
