// Tests F14 (phase 1, red first): "Share some shows" - the Share-a-link button must clear the now bar when the mini player shows.
/**
 * M31 F14 defect 3 (contact/wave-7/README.md "Real defects"). With something playing the now bar floats over the page's foot; the page's
 * own footer (the "Share a link to the picked shows" button, outside any scroll) sat under it. The page must leave the now bar's room:
 * `layout.reserve` (usePushedLayout / PushedPage) is the helper other pages use for the scroll content; a fixed footer needs the same
 * number as its bottom clearance. jest has no layout engine, so the clearance is measured as the sum of numeric bottom padding / margin /
 * `bottom` on the button's ancestors (or the largest `contentContainerStyle.paddingBottom` of the scroll it sits in) and must be at least the
 * now bar's occupied height on a pushed page: `nowBarBottom(0) + bars.now` (6 + 58 = 64). Class names (`pb-section`) do not count - the number
 * has to be written. With nothing loaded there is no such requirement (second test: the page still renders and the button is there).
 * Break: drop the reserve from the page's foot - red.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { bars, nowBarBottom } from '@/design';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

let mockNow = true;
const mockStores = {
  settings: { get: () => undefined, set: () => undefined },
  subscriptions: { list: () => [{ feedUrl: 'https://a.example/feed.xml' }, { feedUrl: 'https://b.example/feed.xml' }] },
  feeds: { getShow: (u: string) => ({ title: u.includes('//a.') ? 'Alpha Hour' : 'Beta Radio', imageUrl: undefined }) },
  auth: { get: () => undefined },
};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePathname: () => '/lists/new',
  useLocalSearchParams: () => ({}),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => jest.fn() }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: mockNow, player: false }) }));
jest.mock('@/playback/store', () => ({
  usePlayerSelector: (f: (s: unknown) => unknown) => f({ kind: mockNow ? 'ready' : 'idle' }),
  selectIdle: (s: { kind: string }) => s.kind === 'idle',
}));
jest.mock('@/social/context', () => ({ useSocial: () => ({ listener: { listenerId: 'me', displayName: 'Mei Lin' } }) }));
jest.mock('@/social/api-m22-discover', () => ({ useM22DiscoverApi: () => ({ shareList: () => Promise.resolve({ url: 'https://x.example/l/1' }) }) }));
jest.mock('@/ui/kit/useColours', () => ({ useColours: () => require('@/design').colour }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import NewSharedList from '../app/lists/new';

let r: ReactTestRenderer;
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => r?.unmount()); setReducedMotionForTest(undefined); });
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const LABEL = 'Share a link to the picked shows';
const mount = async (): Promise<ReactTestInstance> => {
  await act(async () => { r = create(createElement(NewSharedList)); for (let i = 0; i < 6; i++) await Promise.resolve(); });
  const button = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLabel'] === LABEL)[0];
  expect(button === undefined).toBe(false);
  return button!;
};
/** Numeric room below the button: bottom padding / margin / bottom offset up the host chain, or the scroll's content padding. */
function clearance(button: ReactTestInstance): number {
  let sum = 0;
  let scroll = 0;
  for (let p: ReactTestInstance | null = button; p; p = p.parent) {
    const cc = p.props['contentContainerStyle'] as unknown;
    if (cc !== undefined) scroll = Math.max(scroll, num((StyleSheet.flatten(cc as never) as Record<string, unknown> | undefined)?.['paddingBottom']));
    if (typeof p.type !== 'string' || p === button) continue;
    const s = flat(p);
    sum += num(s['paddingBottom'] ?? s['paddingVertical']) + num(s['marginBottom'] ?? s['marginVertical']) + (s['position'] === 'absolute' ? num(s['bottom']) : 0);
  }
  return Math.max(sum, scroll);
}

it('mini player showing: the Share-a-link button has at least the now bar\'s height (64) under it', async () => {
  mockNow = true;
  const button = await mount();
  expect(clearance(button)).toBeGreaterThanOrEqual(nowBarBottom(0) + bars.now);
});

it('nothing playing: the page renders with its button (no now bar to clear)', async () => {
  mockNow = false;
  const button = await mount();
  expect(button === undefined).toBe(false);
});
