// Every Page wrapper draws a "Back" button in the pinned title row in every state: filled, loading, empty, error.
/**
 * Spec 039, fix lane 3 (simulator run 42210800998, r13/r14/r17): the flows missed "Back". The cause was a hub scrolled under its pinned title row, not a missing
 * button, but a wrapper that drops Back in one state would look the same on a device, so this renders FeedPage, FeedScroll, DetailPage, DetailList and FormPage in each
 * state and asks for one button named "Back" (and none when the page says `back={false}` / `onBack={null}`). Break to watch red: remove `leading` from `useFrame` in
 * src/ui/feed/FeedPage.tsx, or the `BackCircle` in src/ui/detail/DetailPage.tsx.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  usePathname: () => '/x',
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined, set: () => undefined } }), useToast: () => jest.fn() }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import { Text } from 'react-native';
import { FeedPage, FeedScroll, FeedLoading, FeedEmpty } from '@/ui/feed/FeedPage';
import { DetailPage, DetailList } from '@/ui/detail/DetailPage';
import { FormPage } from '@/ui/form/FormPage';
import { InlineNotice } from '@/ui/kit/layout';

beforeEach(() => setReducedMotionForTest(true));
afterEach(() => setReducedMotionForTest(undefined));

const row = (t: string) => createElement(Text, null, t);
const list = { keyExtractor: (x: string) => x, renderItem: ({ item }: { item: string }) => row(item) };
const states: Record<string, unknown> = { filled: ['a', 'b'], loading: [], empty: [], error: [] };
const emptyFor = (s: string) => s === 'loading' ? createElement(FeedLoading) : s === 'empty' ? createElement(FeedEmpty, { title: 'Nothing here' }) : s === 'error' ? createElement(InlineNotice, { text: "Couldn't load this.", action: { label: 'Retry', onPress: () => undefined } } as never) : undefined;

const pages: Record<string, (s: string) => React.ReactElement> = {
  FeedPage: (s) => createElement(FeedPage as never, { title: 'T', data: states[s], ...list, ListEmptyComponent: emptyFor(s) }),
  FeedScroll: (s) => createElement(FeedScroll as never, { title: 'T' }, s === 'filled' ? row('body') : emptyFor(s)),
  DetailPage: (s) => createElement(DetailPage, { title: 'T' }, s === 'filled' ? row('body') : emptyFor(s)),
  DetailList: (s) => createElement(DetailList as never, { title: 'T', data: states[s], ...list, ListEmptyComponent: emptyFor(s) }),
  FormPage: (s) => createElement(FormPage, { title: 'T' }, s === 'filled' ? row('body') : emptyFor(s)),
};

const backs = (r: ReactTestRenderer) => r.root.findAll((n) => n.props['accessibilityLabel'] === 'Back' && typeof n.props['onPress'] === 'function');

describe.each(Object.keys(pages))('%s', (name) => {
  it.each(Object.keys(states))('draws one Back button when %s', async (s) => {
    let r!: ReactTestRenderer;
    await act(async () => { r = create(pages[name]!(s)); await Promise.resolve(); });
    expect(backs(r).length).toBeGreaterThanOrEqual(1);
    act(() => r.unmount());
  });
});

it('a page that asks for no Back draws none', async () => {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(DetailPage, { title: 'T', back: false }, row('x'))); });
  expect(backs(r)).toHaveLength(0);
  await act(async () => { r = create(createElement(FormPage, { title: 'T', onBack: null }, row('x'))); });
  expect(backs(r)).toHaveLength(0);
});
