// Tests F14 (phase 1, red first): Stickers, signed out - the "Decorate my profile" button must not cover the sign-in caption.
/**
 * M31 F14 defect 2 (contact/wave-7/README.md "Real defects"). In the hero the caption "Sign in to count your listening time." flows
 * under the two-line figure while the button sits in an `absolute` box at the hero's bottom-left, so on the signed-out hero (178 tall) they
 * overlap. jest has no layout engine, so the requirement is asserted on the structure that makes overlap impossible: the caption and the
 * button are both in normal flow (no `absolute` from either up to the hero), in one column (their nearest shared parent is not a row),
 * the caption first, with at least 8 between them (the parent's `gap`, or the caption wrapper's marginBottom + the button wrapper's marginTop).
 * Break: put the button's box back to `className="absolute"` with `bottom` - red.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockStores = { positions: { all: () => [] }, feeds: { getEpisode: () => undefined }, settings: { get: () => undefined, set: () => undefined }, auth: { get: () => undefined, set: () => undefined } };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePathname: () => '/stickers',
  useLocalSearchParams: () => ({}),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => jest.fn() }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: { profile: () => Promise.resolve({}) }, listener: undefined, refreshListener: jest.fn() }) }));
jest.mock('@/me/listening-api', () => ({ useListeningApi: () => ({ listening: () => Promise.resolve({ earned: {} }) }) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import StickersScreen from '../app/stickers';

let r: ReactTestRenderer;
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => r?.unmount()); setReducedMotionForTest(undefined); });
const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const hostsOf = (n: ReactTestInstance): ReactTestInstance[] => { const out: ReactTestInstance[] = []; for (let p: ReactTestInstance | null = n; p; p = p.parent) if (typeof p.type === 'string') out.push(p); return out; };
const isAbsolute = (n: ReactTestInstance): boolean => flat(n)['position'] === 'absolute' || /(^|\s)absolute(\s|$)/.test(String(n.props['className'] ?? ''));

it('signed out: the caption and the Decorate button are in one column, in flow, 8 or more apart', async () => {
  await act(async () => { r = create(createElement(StickersScreen)); for (let i = 0; i < 6; i++) await Promise.resolve(); });
  const hero = r.root.findAll((n) => n.props['testID'] === 'stickers-hero' && typeof n.type === 'string')[0]!;
  const caption = r.root.findAll((n) => typeof n.type === 'string' && String(n.type) === 'Text' && say(n.props['children']) === 'Sign in to count your listening time.')[0]!;
  const button = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLabel'] === 'Decorate my profile with stickers')[0]!;
  expect(caption === undefined).toBe(false);
  expect(button === undefined).toBe(false);
  const cUp = hostsOf(caption);
  const bUp = hostsOf(button);
  const hi = (up: ReactTestInstance[]): number => up.indexOf(hero);
  expect(hi(cUp)).toBeGreaterThan(-1);
  expect(hi(bUp)).toBeGreaterThan(-1);
  // Neither is absolutely placed on its way up to the hero (the hero's own children included, the hero itself excluded).
  expect(cUp.slice(0, hi(cUp)).filter(isAbsolute).length).toBe(0);
  expect(bUp.slice(0, hi(bUp)).filter(isAbsolute).length).toBe(0);
  // The nearest shared parent is a column.
  const common = cUp.find((n) => bUp.includes(n))!;
  expect(common === undefined).toBe(false);
  expect(flat(common)['flexDirection'] === 'row' || /(^|\s)flex-row(\s|$)/.test(String(common.props['className'] ?? ''))).toBe(false);
  // Caption first, then the button.
  const cBranch = cUp[cUp.indexOf(common) - 1]!;
  const bBranch = bUp[bUp.indexOf(common) - 1]!;
  const order = r.root.findAll(() => true);
  expect(order.indexOf(caption)).toBeLessThan(order.indexOf(button));
  // Gap of 8 or more between them.
  const cs = flat(common);
  const gap = Math.max(num(cs['gap']), num(cs['rowGap'])) + num(flat(cBranch)['marginBottom']) + num(flat(bBranch)['marginTop']);
  expect(gap).toBeGreaterThanOrEqual(8);
});
