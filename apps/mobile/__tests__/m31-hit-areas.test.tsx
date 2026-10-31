// Checks, on the rendered tree, that every small round or pill control is 44 pt or more to touch.
/**
 * M31 T103 (converge round 1, G14 / US5-1 / FR-030). `a11y-audit.mjs` reads the source; this reads
 * what is RENDERED: for the Ring (the drag surface and the avatar pins; the knob is not a target, the
 * whole ring is), the tab bar items, the now bar's buttons, the title bar's back and action circles, the
 * icon button (default 44, and the 36 sheet-close circle), and the Chip. Each tappable's own width and
 * height from its style, plus `hitSlop` on both sides, must reach 44.
 *
 * The break that turns it red: shrink one (the now bar's play circle has no `hitSlop`; set `bars.circle`
 * under 44; take the Chip's `hitSlop` away; give the ring pin `hitSlop={4}`).
 */
jest.useFakeTimers();
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { Ring } from '@/ui/kit/RingScrubber';
import { TabBar, type TabItem } from '@/ui/shell/TabBar';
import { NowBar } from '@/ui/kit/NowBar';
import { TitleBar } from '@/ui/kit/TitleBar';
import { IconButton } from '@/ui/kit/PulseButton';
import { Chip } from '@/ui/kit/Chip';
import { bars } from '@/design';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 320, height: 640, scale: 2, fontScale: 1 })) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, usePathname: () => '/x' }));
jest.mock('@/ui/kit/haptics', () => ({ tick: jest.fn() }));

const MIN = 44;
const mounted: ReactTestRenderer[] = [];
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
function render(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } }, el)); });
  mounted.push(r);
  return r;
}
const hosts = (r: ReactTestRenderer, f: (n: ReactTestInstance) => boolean): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && f(n));
const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const found = r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function'); // the outermost node carries the props the caller wrote (style, hitSlop)
  if (found.length === 0) throw new Error(`no pressable named "${label}"`);
  return found[0]!;
};
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;
const slop = (n: ReactTestInstance): { x: number; y: number } => {
  const h = n.props['hitSlop'] as number | { top?: number; bottom?: number; left?: number; right?: number } | undefined;
  if (h === undefined) return { x: 0, y: 0 };
  if (typeof h === 'number') return { x: h * 2, y: h * 2 };
  return { x: (h.left ?? 0) + (h.right ?? 0), y: (h.top ?? 0) + (h.bottom ?? 0) };
};
/** What a finger can land on: the node's own width and height (its style) plus the slop on both sides. `own` supplies a size the style leaves to the layout. */
function reach(n: ReactTestInstance, own: { w?: number; h?: number } = {}): { w: number; h: number } {
  const s = flat(n);
  const w = Number(s['width'] ?? s['minWidth'] ?? own.w);
  const h = Number(s['height'] ?? s['minHeight'] ?? own.h);
  if (!Number.isFinite(w) || !Number.isFinite(h)) throw new Error(`size of "${String(n.props['accessibilityLabel'] ?? n.props['testID'])}" is not in its style: ${JSON.stringify(s)}`);
  return { w: w + slop(n).x, h: h + slop(n).y };
}
const big = (n: ReactTestInstance, own?: { w?: number; h?: number }): void => {
  const r = reach(n, own);
  expect({ name: n.props['accessibilityLabel'] ?? n.props['testID'], w: r.w >= MIN, h: r.h >= MIN }).toEqual({ name: n.props['accessibilityLabel'] ?? n.props['testID'], w: true, h: true });
};

describe('Ring', () => {
  const ring = (size: number, withPin = true) => render(createElement(Ring, { heat: [], progress: 0.3, size, onSeek: () => undefined, pins: withPin ? [{ at: 0.5, onPress: () => undefined, label: 'Comment at 5:00' }] : [] }));
  it('the drag surface is the whole ring: at the smallest ring the app draws it is far over 44, and the knob is only a mark', () => {
    for (const size of [120, 220, 330]) {
      const r = ring(size, false);
      const surface = hosts(r, (n) => n.props['testID'] === 'ring')[0]!;
      expect(reach(surface).w).toBeGreaterThanOrEqual(MIN);
      expect(reach(surface).h).toBeGreaterThanOrEqual(MIN);
      const knob = hosts(r, (n) => n.props['testID'] === 'ring-knob')[0]!;
      expect(knob.props['pointerEvents']).toBe('none');
    }
  });
  it('an avatar pin is 18 wide and gets its 44 from hitSlop', () => {
    const pin = ring(220).root.findAll((n) => n.props['testID'] === 'ring-pin')[0]!;
    big(pin);
  });
});

describe('TabBar', () => {
  const ITEMS: TabItem[] = ['index', 'library', 'chat', 'me'].map((key) => ({ key, label: key, icon: { idle: 'compass-outline', active: 'compass' } }));
  it('each tab is at least 44 tall and, on the narrowest phone (320), 80 wide', () => {
    const r = render(createElement(TabBar, { items: ITEMS, activeKey: 'index', onSelect: jest.fn() }));
    const tabs = hosts(r, (n) => n.props['accessibilityRole'] === 'tab');
    expect(tabs).toHaveLength(4);
    for (const t of tabs) {
      expect(Number(flat(t)['minHeight'])).toBeGreaterThanOrEqual(MIN);
      expect(320 / tabs.length).toBeGreaterThanOrEqual(MIN); // flex-1 slots of a 320 pt bar
    }
  });
});

describe('NowBar', () => {
  const bar = () => render(createElement(NowBar, { mode: 'bar', title: 'Why mornings matter', playing: false, positionMs: 1000, durationMs: 600000, bottom: 100, onToggle: jest.fn(), onOpen: jest.fn(), onQueue: jest.fn() }));
  it('Play / Pause and Playlist: a 40 circle plus slop reaches 44', () => {
    const r = bar();
    big(byLabel(r, 'Play'));
    big(byLabel(r, 'Playlist'));
  });
  it('the open area is the 42 cover tall, wide as the title, and reaches 44 tall with slop', () => {
    const open = bar();
    big(byLabel(open, 'Now playing: Why mornings matter. Open the player.'), { w: 200, h: bars.cover });
  });
  it('the circle form (while a list scrolls) is a 52 circle', () => {
    const r = render(createElement(NowBar, { mode: 'circle', title: 'T', playing: true, positionMs: 0, bottom: 100, onToggle: jest.fn(), onOpen: jest.fn(), onQueue: jest.fn() }));
    big(byLabel(r, 'Now playing: T. Open the player.'));
  });
});

describe('TitleBar', () => {
  it('the back circle and each action circle reach 44', () => {
    const r = render(createElement(TitleBar, { title: 'Queue', bottom: 40, onBack: () => undefined, actions: [{ icon: 'grid-outline', label: 'Show as a grid', onPress: () => undefined }, { icon: 'share-outline', label: 'Share my list', onPress: () => undefined }] }));
    big(byLabel(r, 'Back'));
    big(byLabel(r, 'Show as a grid'));
    big(byLabel(r, 'Share my list'));
  });
});

describe('PulseButton icon variant (IconButton)', () => {
  const icon = (extra: object = {}) => render(createElement(IconButton, { icon: 'close', label: 'Close', onPress: () => undefined, ...extra }));
  it('the default circle, the 36 sheet-close circle and a 40 circle all reach 44', () => {
    big(byLabel(icon(), 'Close'));
    big(byLabel(icon({ diameter: bars.sheetClose }), 'Close'));
    big(byLabel(icon({ diameter: 40 }), 'Close'));
  });
});

describe('Chip', () => {
  it('a chip is drawn 36 tall; hitSlop makes it 44 (plain, compact and with an icon)', () => {
    for (const extra of [{}, { compact: true }, { icon: 'add' as const }]) {
      const r = render(createElement(Chip, { label: 'Added', onPress: () => undefined, ...extra }));
      big(byLabel(r, 'Added'), { w: 80 });
    }
  });
});
