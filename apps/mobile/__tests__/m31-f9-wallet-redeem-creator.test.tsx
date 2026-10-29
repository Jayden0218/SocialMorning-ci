// Wallet rows as the drawing prints them, the Creator academy card, the curly apostrophe.
/**
 * M31 F9 (specs/033-m31-redesign/contact/wave-6/README.md defects 2, 6, 7, 8; design-pulse2 shell.html). Written BEFORE the fixes: every test marked RED fails today.
 *  - wallet--plus: the purchase row is "Google Play · active · 12 Oct · until 12 Nov" with "US$2.99" and the list ends "— THAT’S EVERYTHING —" (RED: the raw
 *    google_play · 2026-10-12 and "$2.99", "No more to fetch"). The row is the wallet's own, so the shared kit EndOfList ("No more to fetch": chat, hosts,
 *    not-interested, pinned by other m31 tests) is NOT asked to change: the wallet passes its own words. "Purchases are not available yet." is the empty hero's pill
 *    (wallet--screen); with purchases on the list it is gone (RED).
 *  - NOT tested, on purpose: the PLUS card on an iPhone. The drawing shows it on the empty wallet, but Subscribe / Restore only exist on Android (the store flow is
 *    verified there; constitution 2.1.0: paid extras only through the store's in-app purchase, each verified by the server). app/wallet.tsx documents it as "not as drawn".
 *  - Dropped on purpose: "Redeem / Get my code enabled while empty". The drawings' pictures show the pill lit, but their NOTES say "disabled until the code is complete" /
 *    "Disabled until the field holds an http(s) address"; the notes win (no API call on an empty field). The wave-6 README lists it as a known difference.
 *  - creator--screen: the academy card is light (bg-text); a proven show's scroll keeps the foot's whole height under the last card.
 *  - "your show’s numbers" is written with U+2019 in the drawing (RED).
 */
import { createElement } from 'react';
import { Linking, Platform, Share, StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockToast = jest.fn();
const mockShare = jest.fn();
const mockBuy = jest.fn();
const mockRestore = jest.fn();
const mockMap = new Map<string, string>();
let mockParams: Record<string, string> = { code: 'g1' };
let mockListener: unknown = { listenerId: 'me', displayName: 'Mei' };
let mockPurchases: () => Promise<unknown> = () => Promise.resolve({ items: [], storeReady: false });
let mockTips: () => Promise<unknown> = () => Promise.resolve({ items: [], storeReady: false });
let mockPlay: Record<string, unknown> = { ready: false, granted: 0, error: undefined, price: () => undefined };
let mockMe: () => Promise<unknown> = () => Promise.resolve({ plus: false });
let mockGift: () => Promise<unknown> = () => Promise.resolve({});
let mockClaimGift: () => Promise<string> = () => Promise.resolve('claimed');
let mockRedeem: (c: string) => Promise<unknown> = () => Promise.resolve({});
let mockClaims: () => Promise<unknown[]> = () => Promise.resolve([]);
let mockVerify: () => Promise<unknown> = () => Promise.resolve({ status: 'pending' });
let mockClaim: (u: string) => Promise<unknown> = () => Promise.resolve({});
let mockStats: () => Promise<unknown> = () => Promise.resolve({});
let mockSubs: string[] = [];
const SHOWS: Record<string, { feedUrl: string; title: string; imageUrl?: string }> = {
  'https://a.test/feed.xml': { feedUrl: 'https://a.test/feed.xml', title: 'Morning Notes' },
  'https://b.test/feed.xml': { feedUrl: 'https://b.test/feed.xml', title: 'Night Shift Radio' },
};
const mockStores = {
  settings: { get: (k: string) => mockMap.get(k), set: (k: string, v: string) => { mockMap.set(k, v); }, delete: (k: string) => { mockMap.delete(k); } },
  subscriptions: { list: () => mockSubs.map((feedUrl) => ({ feedUrl })) },
  feeds: { getShow: (u: string) => SHOWS[u], getEpisode: () => undefined },
};
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: (...a: unknown[]) => mockReplace(...a), canGoBack: () => true },
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }),
  usePathname: () => '/wallet',
  useLocalSearchParams: () => mockParams,
  Link: ({ children }: { children: unknown }) => children,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/design/tailwind', () => ({ ...jest.requireActual('@/design/tailwind'), Link: ({ children }: { children: unknown }) => children }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
const mockM12 = { purchases: () => mockPurchases(), tips: () => mockTips() };
jest.mock('@/social/m12-api', () => ({ useM12Api: () => mockM12 }));
jest.mock('@/billing/play', () => ({ usePlayStore: () => mockPlay }));
jest.mock('@/billing/purchase-api', () => ({ usePurchaseApi: () => ({}) }));
const mockApi = {
  me: () => mockMe(),
  creatorClaims: () => mockClaims(),
  creatorClaim: (u: string) => mockClaim(u),
  creatorVerify: () => mockVerify(),
  creatorStats: () => mockStats(),
};
const mockSocial = (): { api: typeof mockApi; listener: unknown } => ({ api: mockApi, listener: mockListener });
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial() }));
const mockM22 = { gift: () => mockGift(), claimGift: () => mockClaimGift() };
jest.mock('@/social/api-m22-server', () => ({ useM22Api: () => mockM22 }));
const mockAccount = { redeem: (c: string) => mockRedeem(c) };
jest.mock('@/social/account-api', () => ({ ...(jest.requireActual('@/social/account-api') as Record<string, unknown>), useAccountApi: () => mockAccount }));
jest.mock('@/ui/clips/ShareChooser', () => ({ useSharePanel: () => [(...a: unknown[]) => mockShare(...a), null] }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import { ApiError } from '@/social/api';
import { GluestackUIProvider } from '@/ui/lib/gluestack-ui-provider';
import WalletScreen from '../app/wallet';
import RedeemScreen from '../app/redeem';
import CreatorScreen from '../app/creator';
import { moneyLabel } from '@/me/money';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => {
  setReducedMotionForTest(true);
  mockMap.clear();
  [mockPush, mockReplace, mockToast, mockShare, mockBuy, mockRestore].forEach((m) => m.mockClear());
  mockParams = { code: 'g1' };
  mockListener = { listenerId: 'me', displayName: 'Mei' };
  mockPurchases = () => Promise.resolve({ items: [], storeReady: false });
  mockTips = () => Promise.resolve({ items: [], storeReady: false });
  mockPlay = { ready: false, granted: 0, error: undefined, price: () => undefined, buy: mockBuy, restore: mockRestore };
  mockMe = () => Promise.resolve({ plus: false });
  mockClaims = () => Promise.resolve([]);
  mockVerify = () => Promise.resolve({ status: 'pending' });
  mockClaim = () => Promise.resolve({ id: 'c9', feedUrl: 'https://a.test/feed.xml', code: 'SN-7Q4K-2M', status: 'pending' });
  mockStats = () => Promise.resolve({ listeners: 120, comments: 14, episodes: 32, topMoments: [{ episodeId: 'e1', title: 'Why mornings matter', offsetMs: 872000, comments: 6 }] });
  mockSubs = [];
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); jest.restoreAllMocks(); });
async function render(el: React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(GluestackUIProvider, null, el)); for (let i = 0; i < 8; i++) await Promise.resolve(); });
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
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));
const control = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && (typeof x.props['onPress'] === 'function' || typeof x.props['onChangeText'] === 'function'))[0];
  if (!n) throw new Error(`no control "${label}"`);
  return n;
};
const has = (r: ReactTestRenderer, label: string): boolean => r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function').length > 0;
const press = async (r: ReactTestRenderer, label: string): Promise<void> => {
  const n = control(r, label);
  await act(async () => { n.props['onPress'](); for (let i = 0; i < 8; i++) await Promise.resolve(); });
};
const type = async (r: ReactTestRenderer, label: string, text: string): Promise<void> => {
  const n = control(r, label);
  await act(async () => { n.props['onChangeText'](text); for (let i = 0; i < 4; i++) await Promise.resolve(); });
};

const GOOGLE = { id: 'p1', productId: 'plus.monthly', store: 'google_play', status: 'active', amountMicros: 2_990_000, currency: 'USD', createdAt: '2026-10-12T12:00:00Z', expiresAt: '2026-11-12T12:00:00Z' };

describe('F9-2 Wallet purchase rows (wallet--plus)', () => {
  it('the store reads "Google Play", the dates "12 Oct" / "12 Nov", the amount "US$2.99"', async () => {
    mockPurchases = () => Promise.resolve({ items: [GOOGLE], storeReady: false });
    const r = await render(createElement(WalletScreen));
    expect(words(r)).toContain('Google Play · active · 12 Oct · until 12 Nov');
    expect(words(r)).toContain('US$2.99');
    expect(words(r).join(' ')).not.toMatch(/google_play|2026-10-12/);
  });
  it('the list ends with the drawn mark, not "No more to fetch"', async () => {
    mockPurchases = () => Promise.resolve({ items: [GOOGLE], storeReady: false });
    const r = await render(createElement(WalletScreen));
    expect(words(r).some((w) => /THAT.S EVERYTHING/.test(w))).toBe(true);
    expect(words(r)).not.toContain('No more to fetch');
  });
  it('with purchases on the list there is no "Purchases are not available yet." pill', async () => {
    mockPurchases = () => Promise.resolve({ items: [GOOGLE], storeReady: false });
    const r = await render(createElement(WalletScreen));
    expect(words(r)).not.toContain('Purchases are not available yet.');
  });
  it('moneyLabel writes US dollars as US$2.99 whatever the phone\'s locale; no currency keeps the bare number', () => {
    expect(moneyLabel(2_990_000, 'USD')).toBe('US$2.99');
    expect(moneyLabel(2_990_000, null)).toBe('2.99');
    expect(moneyLabel(null, 'USD')).toBe('');
  });
});

describe('F9-6 Creator (creator--screen, creator--host-proven)', () => {
  beforeEach(() => { mockSubs = ['https://a.test/feed.xml', 'https://b.test/feed.xml']; });
  // Dropped (coordinator decision): Get my code enabled while empty. The drawing's picture shows it lit, its NOTES say "Disabled until the field holds an http(s) address"; the notes win.
  it('the academy card is flat light: class bg-text, no opacity on the card', async () => {
    const r = await render(createElement(CreatorScreen));
    const link = r.root.findAll((x) => x.props['testID'] === 'creator-academy')[0]!;
    expect(String(link.props['className'])).toContain('bg-text');
    expect(flat(link)['opacity'] ?? 1).toBe(1);
  });
  it('a proven show: the scroll keeps the foot\'s whole height (and the title row) under the last card', async () => {
    mockClaims = () => Promise.resolve([{ id: 'c1', feedUrl: 'https://a.test/feed.xml', code: 'SN-7Q4K-2M', status: 'proven' }]);
    const r = await render(createElement(CreatorScreen));
    const foot = byId(r, 'creator-foot')[0]!;
    act(() => { foot.props['onLayout']({ nativeEvent: { layout: { width: 350, height: 160, x: 0, y: 0 } } }); });
    const scroll = byId(r, 'creator-scroll')[0]!;
    expect(Number((StyleSheet.flatten(scroll.props['contentContainerStyle']) as Record<string, unknown>)['paddingBottom'])).toBeGreaterThanOrEqual(160 + 44);
  });
  it('the explanation says your show’s numbers with a curly apostrophe', async () => {
    const r = await render(createElement(CreatorScreen));
    expect(words(r)).toContain('We never host your audio — you keep your own feed. Once you prove it is yours, you see your show’s numbers and your comments carry a Host mark.');
  });
});
