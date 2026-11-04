// 037 M2 (spec 037 FR-001/FR-002): TitleBar at the top — Back and actions in one row, the title and subtitle under it.
/**
 * Written BEFORE the change: red today (TitleBar takes `bottom` and draws Back, title and subtitle in one low row).
 * Asks: the root has `top` and no `bottom`; Back comes before the title in reading order; when the page has scrolled (`shrunk`)
 * the title is INSIDE the top row (testID `title-bar-row`), and when it has not, it is under the row.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { TitleBar } from '@/ui/kit/TitleBar';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, usePathname: () => '/notifications' }));

const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
const bar = (extra: Record<string, unknown> = {}): ReactTestRenderer => {
  setReducedMotionForTest(true);
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(TitleBar, { title: 'Notifications', subtitle: 'New activity from people you follow', top: 53, onBack: () => undefined, actions: [{ icon: 'settings-outline', label: 'Settings', onPress: () => undefined }], ...extra } as never)); });
  mounted.push(r);
  return r;
};
const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const header = (r: ReactTestRenderer): ReactTestInstance => r.root.findAll((n) => n.props['accessibilityRole'] === 'header' && typeof n.props['numberOfLines'] === 'number')[0]!;
const row = (r: ReactTestRenderer): ReactTestInstance => r.root.findAll((n) => n.props['testID'] === 'title-bar-row')[0]!;
const rootBox = (r: ReactTestRenderer): ReactTestInstance => r.root.findAll((n) => n.props['testID'] === 'title-bar')[0]!;

describe('037 M2 TitleBar at the top', () => {
  it('the root is placed by `top` and has no `bottom`', () => {
    const s = flat(rootBox(bar()));
    expect(s['top']).toBe(53);
    expect(s['bottom']).toBeUndefined();
  });

  it('Back comes before the title in reading order, and the subtitle after the title', () => {
    const r = bar();
    const all = r.root.findAll(() => true);
    const at = (n: ReactTestInstance | undefined): number => all.indexOf(n!);
    const back = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Back')[0];
    const sub = r.root.findAll((n) => n.props['children'] === 'New activity from people you follow')[0];
    expect(back).toBeDefined();
    expect(at(back)).toBeGreaterThanOrEqual(0);
    expect(at(back)).toBeLessThan(at(header(r)));
    expect(at(header(r))).toBeLessThan(at(sub));
  });

  it('not scrolled: Back and the action are in the top row, the title is NOT (it is under it)', () => {
    const r = bar();
    expect(row(r).findAll((n) => n.props['accessibilityLabel'] === 'Back').length).toBeGreaterThan(0);
    expect(row(r).findAll((n) => n.props['accessibilityLabel'] === 'Settings').length).toBeGreaterThan(0);
    expect(row(r).findAll((n) => n === header(r)).length).toBe(0);
  });

  it('scrolled (`shrunk`): the title is inside the top row and the subtitle is gone', () => {
    const r = bar({ shrunk: true });
    expect(row(r).findAll((n) => n.props['accessibilityRole'] === 'header').length).toBeGreaterThan(0);
    expect(r.root.findAll((n) => n.props['children'] === 'New activity from people you follow').length).toBe(0);
  });

  it('`extra` is drawn under the title, not above the row', () => {
    const r = bar({ extra: createElement('Marker' as never, { testID: 'x' }) });
    const all = r.root.findAll(() => true);
    const x = r.root.findAll((n) => n.props['testID'] === 'x')[0];
    expect(all.indexOf(x!)).toBeGreaterThan(all.indexOf(header(r)));
  });
});
