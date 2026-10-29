// Tests that the Creator centre, Wallet, Tips, Gift and Redeem match their drawings in the numbers the owner compared.
/**
 * M31 W6-A (T070 part 1; owner: "the design I want completely the same, or you can explain why it is different"). Source of every number:
 * specs/033-m31-redesign/design-pulse2 `shell.html` entries creator--*, wallet--*, tips--screen, gift--*, redeem--*. The numbers below are the drawing's, written
 * out here (not read from the measures file), so a changed constant turns a test red. Each guard names the revert that turns it red (each was seen red once, then restored):
 *  - Wallet: the hero is 170 tall with "No purchases" and the tinted pill, the Redeem row 56, the store sentence is the title bar's subtitle (3 lines), a purchase is a 64 tile,
 *    the load error is a 48 mark tile; the PLUS card (stacked when Subscribe carries the price) and the PLUS edge label only where purchases are on: `WALLET.heroHeight`,
 *    `WALLET.rowMin`, `subtitleLines`, `play.ready ? <EdgeLabel` — red;
 *  - Tips: the wall of 60 bars, the 160 heart tile tilted -6, "No tips yet" with the not-available sentence, the title at 20: `TIPS.wallBars`, `TIPS.tile`, `titleSize` — red;
 *  - Gift: the cover 240 / radius 36 with the 56 hot badge, the words centred, the hot pill (Sign in to claim signed out), a dead link's 140 tile and no pill: `GIFT.cover`,
 *    `kind="hot"`, `open ?` — red;
 *  - Redeem: the 56 field in mono spaced 2.4, the error between field and button with a hot ring, the done tile: `REDEEM.field`, `ring`, `done ?` — red;
 *  - Creator: the stage (48 bars, "Claim the show you publish"), the deck cards 132, the waiting card (code in the gradient, the answer inside the card), Share code + Verify
 *    in the foot and Get my code when a feed address is typed, the proven card's numbers, signed out: `CREATOR.deckCard`, `active && !typing`, `claimId` — red.
 */
import { createElement } from 'react';
import { Linking, Platform, Share, StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { wallBar } from '@/ui/tips/parts';

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
import TipsScreen from '../app/tips';
import GiftScreen from '../app/gift/[code]';
import RedeemScreen from '../app/redeem';
import CreatorScreen from '../app/creator';

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
describe('Wallet (wallet--screen, wallet--plus, wallet--signed-out)', () => {
  it('an empty wallet: a 170 hero with "No purchases" and the tinted pill, the Redeem row 56, the store sentence under the title', async () => {
    const r = await render(createElement(WalletScreen));
    const hero = byId(r, 'wallet-hero')[0]!;
    expect(flat(hero)['height']).toBe(170);
    expect(flat(hero)['borderRadius']).toBe(22);
    expect(flat(hero)['padding']).toBe(18);
    expect(hero.props['accessibilityLabel']).toBe('No purchases. Purchases are not available yet.');
    expect(byId(r, 'corner-glow')).not.toHaveLength(0);
    expect(flat(byId(r, 'wallet-pill')[0])['height']).toBe(26);
    expect(words(r)).toEqual(expect.arrayContaining(['No purchases', 'Purchases are not available yet.', 'Redeem a code', 'Wallet']));
    const row = r.root.findAll((x) => x.props['accessibilityLabel'] === 'Redeem a code' && typeof x.props['onPress'] === 'function')[0]!;
    expect(flat(row)['minHeight']).toBe(56);
    expect(flat(row)['borderRadius']).toBe(18);
    // The store sentence is the title bar's subtitle, all three lines of it.
    const sub = r.root.findAll((x) => String(x.type) === 'Text' && say(x.props['children']).startsWith('Purchases are made through'))[0]!;
    expect(say(sub.props['children'])).toBe('Purchases are made through Google Play. SocialNet keeps no balance and never takes money itself. Listening stays free.');
    expect(sub.props['numberOfLines']).toBe(4);
    expect(has(r, 'Manage subscriptions in the store')).toBe(true);
    // No PLUS card here (purchases are off), so no PLUS label either.
    expect(r.root.findAll((x) => x.props['accessibilityRole'] === 'header' && x.props['accessibilityLabel'] === 'PLUS')).toHaveLength(0);
  });
  it('Redeem a code opens the Redeem page; Manage opens the store', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const r = await render(createElement(WalletScreen));
    await press(r, 'Redeem a code');
    expect(mockPush).toHaveBeenCalledWith('/redeem');
    await press(r, 'Manage subscriptions in the store');
    expect(open).toHaveBeenCalledTimes(1);
  });
  it('purchases are 64 tiles with the amount in mono and end with the end-of-list mark', async () => {
    mockPurchases = () => Promise.resolve({ items: [{ id: 'p1', productId: 'plus.monthly', store: 'google', status: 'active', amountMicros: 2_990_000, currency: 'USD', createdAt: '2026-10-12T00:00:00Z', expiresAt: '2026-11-12T00:00:00Z' }], storeReady: true });
    const r = await render(createElement(WalletScreen));
    const tile = byId(r, 'purchase-tile')[0]!;
    expect(flat(tile)['minHeight']).toBe(64);
    expect(flat(tile)['borderRadius']).toBe(18);
    expect(flat(tile)['marginLeft']).toBe(28);
    expect(byId(r, 'wallet-hero')).toHaveLength(0);
    expect(words(r)).toContain('plus.monthly');
    expect(words(r).some((w) => /THAT.S EVERYTHING/.test(w))).toBe(true);
  });
  it('a failed load is a 48 mark tile beside the line, and the page stays usable', async () => {
    mockPurchases = () => Promise.reject(new Error('offline'));
    const r = await render(createElement(WalletScreen));
    expect(words(r)).toContain("Couldn't load your purchases right now.");
    expect(words(r)).toContain('!');
    const mark = r.root.findAll((n) => typeof n.type === 'string' && flat(n)['width'] === 48 && flat(n)['height'] === 48)[0];
    expect(mark).toBeDefined();
    expect(has(r, 'Redeem a code')).toBe(true);
  });
  it('where purchases are on: the PLUS edge label, the card, Subscribe with the price stacked over Restore; PLUS held = no Subscribe', async () => {
    mockPurchases = () => Promise.resolve({ items: [], storeReady: true });
    mockPlay = { ...mockPlay, ready: true, price: () => 'US$2.99' };
    const r = await render(createElement(WalletScreen));
    expect(r.root.findAll((x) => x.props['accessibilityRole'] === 'header' && x.props['accessibilityLabel'] === 'PLUS').length).toBeGreaterThan(0);
    expect(words(r)).toContain('SocialNet PLUS');
    expect(has(r, 'Subscribe · US$2.99 a month')).toBe(true);
    expect(has(r, 'Restore purchases')).toBe(true);
    expect(flat(byId(r, 'plus-buttons')[0])['flexDirection']).toBe('column');
    expect(flat(byId(r, 'plus-card')[0])['borderRadius']).toBe(22);
    await press(r, 'Subscribe · US$2.99 a month');
    expect(mockBuy).toHaveBeenCalledTimes(1);
    await press(r, 'Restore purchases');
    expect(mockRestore).toHaveBeenCalledTimes(1);
  });
  it('You have PLUS: the card says so and offers Restore only', async () => {
    mockPurchases = () => Promise.resolve({ items: [], storeReady: true });
    mockPlay = { ...mockPlay, ready: true };
    mockMe = () => Promise.resolve({ plus: true });
    const r = await render(createElement(WalletScreen));
    expect(words(r)).toContain('You have PLUS');
    expect(has(r, 'Subscribe')).toBe(false);
    expect(has(r, 'Restore purchases')).toBe(true);
    expect(flat(byId(r, 'plus-buttons')[0])['flexDirection']).toBe('row');
  });
});

describe('Tips (tips--screen)', () => {
  it('empty: 60 faint bars, the 160 heart tile tilted 6 degrees left, "No tips yet" and the sentence, title at 20', async () => {
    const r = await render(createElement(TipsScreen));
    const wall = byId(r, 'tips-wall')[0]!;
    expect(wall.children).toHaveLength(60);
    expect(flat(wall)['height']).toBe(220);
    expect(flat(wall)['left']).toBe(20);
    const glow = hosts(r, (n) => n.props['testID'] === 'glow-tile')[0]!;
    expect(flat(glow)['width']).toBe(160);
    expect(flat(glow)['transform']).toEqual([{ rotate: '-6deg' }]);
    expect(words(r)).toEqual(expect.arrayContaining(['No tips yet', 'Tipping is not available yet. When it is, tips are paid through the App Store or Google Play.', 'Tips I gave']));
    expect(byId(r, 'tips-words')[0]!.props['accessibilityLabel']).toContain('No tips yet. Tipping is not available yet');
    const heading = r.root.findAll((n) => String(n.type) === 'Text' && say(n.props['children']) === 'Tips I gave')[0]!;
    expect(flat(heading)['fontSize']).toBe(20);
    const big = r.root.findAll((n) => String(n.type) === 'Text' && say(n.props['children']) === 'No tips yet')[0]!;
    expect(flat(big)['fontSize']).toBe(40);
  });
  it('the wall: each bar between 20 and 220 tall, white at 4 to 10 %', () => {
    for (let k = 0; k < 60; k++) {
      const b = wallBar(k);
      expect(b.height).toBeGreaterThanOrEqual(20);
      expect(b.height).toBeLessThanOrEqual(220);
      expect(b.opacity).toBeGreaterThanOrEqual(0.04);
      expect(b.opacity).toBeLessThanOrEqual(0.1);
    }
  });
  it('with tips: 64 tiles, the caption above while the store is off, the end mark; no stage', async () => {
    mockTips = () => Promise.resolve({ items: [{ id: 't1', showTitle: 'Morning Notes', feedUrl: 'https://a.test/feed.xml', amountMicros: 5_000_000, currency: 'USD', createdAt: '2026-10-01T00:00:00Z' }], storeReady: false });
    const r = await render(createElement(TipsScreen));
    expect(flat(byId(r, 'tip-tile')[0])['minHeight']).toBe(64);
    expect(byId(r, 'tips-wall')).toHaveLength(0);
    expect(words(r)).toEqual(expect.arrayContaining(['Morning Notes', 'No more to fetch', 'Tipping is not available yet. When it is, tips are paid through the App Store or Google Play.']));
  });
  it('a failed load says so; the page keeps its back', async () => {
    mockTips = () => Promise.reject(new Error('offline'));
    const r = await render(createElement(TipsScreen));
    expect(words(r)).toContain("Couldn't load your tips right now.");
  });
});

describe('Gift (gift--screen, gift--signed-out, gift--not-found, toast--gift)', () => {
  const offer = { show: { feedUrl: 'https://a.test/feed.xml', title: 'Slow Cities: the full season', artworkUrl: null }, claimed: false, cancelled: false, buyerName: 'Ana' };
  it('the offer: cover 240 / radius 36, the 56 hot badge, caps tag, 28 title, the sentence, one hot pill', async () => {
    mockGift = () => Promise.resolve(offer);
    const r = await render(createElement(GiftScreen));
    const cover = byId(r, 'gift-cover')[0]!;
    const inner = cover.findAll((n) => typeof n.type === 'string' && flat(n)['width'] === 240 && flat(n)['borderRadius'] === 36);
    expect(inner.length).toBeGreaterThan(0);
    const badge = byId(r, 'gift-badge')[0]!;
    expect(flat(badge)['width']).toBe(56);
    expect(flat(badge)['borderWidth']).toBe(4);
    expect(words(r)).toEqual(expect.arrayContaining(['A paid series', 'Slow Cities: the full season', 'Ana gave you this paid series. The first person to claim it gets every paid episode.', 'Claim the series']));
    const title28 = r.root.findAll((n) => String(n.type) === 'Text' && say(n.props['children']) === 'Slow Cities: the full season')[0]!;
    expect(flat(title28)['fontSize']).toBe(28);
    expect(flat(title28)['textAlign']).toBe('center');
    // The pill is the hot one: a hot fill.
    const pill = r.root.findAll((x) => x.props['accessibilityLabel'] === 'Claim the series' && typeof x.props['onPress'] === 'function')[0]!;
    expect(String(pill.props['className'])).toContain('bg-hot');
  });
  it('Claim the series: claimed -> toast and the show opens; an answer shows in hot-text and the pill stays', async () => {
    mockGift = () => Promise.resolve(offer);
    const r = await render(createElement(GiftScreen));
    await press(r, 'Claim the series');
    expect(mockToast).toHaveBeenCalledWith('The series is yours. Enjoy!');
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent('https://a.test/feed.xml') } });
    mockClaimGift = () => Promise.resolve('already_claimed');
    mockReplace.mockClear(); mockToast.mockClear();
    await press(r, 'Claim the series');
    expect(words(r)).toContain('Already claimed — someone opened this link first.');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(has(r, 'Claim the series')).toBe(true);
    mockClaimGift = () => Promise.reject(new Error('x'));
    await press(r, 'Claim the series');
    expect(words(r)).toContain("Couldn't reach the server. Try again.");
    mockClaimGift = () => Promise.resolve('claimed');
  });
  it('signed out: the pill reads "Sign in to claim" and opens sign-in', async () => {
    mockGift = () => Promise.resolve(offer);
    mockListener = undefined;
    const r = await render(createElement(GiftScreen));
    await press(r, 'Sign in to claim');
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
  });
  it('claimed and refunded gifts show their sentence and no pill', async () => {
    mockGift = () => Promise.resolve({ ...offer, claimed: true });
    let r = await render(createElement(GiftScreen));
    expect(words(r)).toContain('Already claimed — someone opened this link first.');
    expect(has(r, 'Claim the series')).toBe(false);
    mockGift = () => Promise.resolve({ ...offer, cancelled: true });
    r = await render(createElement(GiftScreen));
    expect(words(r)).toContain('This gift was refunded, so it can no longer be claimed.');
  });
  it('a link that does not work: a dim 140 tile (not hot), the sentence at 17, no pill', async () => {
    mockGift = () => Promise.reject(new Error('404'));
    const r = await render(createElement(GiftScreen));
    const tile = byId(r, 'gift-dead-tile')[0]!;
    const box = tile.findAll((n) => typeof n.type === 'string' && flat(n)['width'] === 140)[0]!;
    expect(flat(box)['transform']).toEqual([{ rotate: '-6deg' }]);
    expect(String(box.props['className'])).toContain('bg-raise2');
    const sentence = r.root.findAll((n) => String(n.type) === 'Text' && say(n.props['children']).startsWith('This gift link does not work'))[0]!;
    expect(flat(sentence)['fontSize']).toBe(17);
    expect(r.root.findAll((x) => typeof x.props['onPress'] === 'function' && String(x.props['accessibilityLabel']).startsWith('Claim')).length).toBe(0);
    expect(byId(r, 'gift-cover')).toHaveLength(0);
  });
});

describe('Redeem (redeem--screen, redeem--bad-code)', () => {
  it('the ticket tile 140 tilted 6 degrees right, "Have a code?" at 30, the explanation, the 56 field, Redeem dimmed until the code is complete', async () => {
    const r = await render(createElement(RedeemScreen));
    const tile = hosts(r, (n) => n.props['testID'] === 'glow-tile')[0]!;
    expect(flat(tile)['width']).toBe(140);
    expect(flat(tile)['transform']).toEqual([{ rotate: '6deg' }]);
    expect(words(r)).toEqual(expect.arrayContaining(['Have a code?', 'A code from SocialNet gives you PLUS days or a paid series, free. Each code works once per account.', 'Redeem a code']));
    const field = byId(r, 'redeem-field')[0]!;
    expect(flat(field)['height']).toBe(56);
    expect(flat(field)['borderRadius']).toBe(18);
    const input = control(r, 'Code');
    expect(input.props['placeholder']).toBe('XXXX-XXXX-XXXX');
    expect(flat(input)['fontSize']).toBe(20);
    expect(flat(input)['letterSpacing']).toBeCloseTo(2.4);
    const redeem = r.root.findAll((x) => x.props['accessibilityLabel'] === 'Redeem' && x.props['accessibilityRole'] === 'button')[0]!;
    expect(redeem.props['accessibilityState']).toMatchObject({ disabled: true });
    await type(r, 'Code', 'abcdabcdabcd');
    expect(control(r, 'Code').props['value']).toBe('ABCD-ABCD-ABCD');
    expect(r.root.findAll((x) => x.props['accessibilityLabel'] === 'Redeem' && x.props['accessibilityRole'] === 'button')[0]!.props['accessibilityState']).toMatchObject({ disabled: false });
  });
  it('an unknown code: the server\'s sentence sits between the field and Redeem and the field ring turns hot; typing clears it', async () => {
    mockRedeem = () => Promise.reject(new ApiError('not_found', 'That code doesn’t exist.', 404));
    const r = await render(createElement(RedeemScreen));
    await type(r, 'Code', 'AAAAAAAAAAAA');
    await press(r, 'Redeem');
    expect(words(r)).toContain('That code doesn’t exist.');
    expect(flat(byId(r, 'redeem-field')[0])['borderColor']).toBe('#ff4d6d');
    await type(r, 'Code', 'AAAA');
    expect(words(r)).not.toContain('That code doesn’t exist.');
    expect(flat(byId(r, 'redeem-field')[0])['borderColor']).toBe('#24242c');
  });
  it('something else went wrong: the fallback sentence', async () => {
    mockRedeem = () => Promise.reject(new Error('boom'));
    const r = await render(createElement(RedeemScreen));
    await type(r, 'Code', 'AAAAAAAAAAAA');
    await press(r, 'Redeem');
    expect(words(r)).toContain('Something went wrong. Try again.');
  });
  it('done: the explanation is replaced by a tinted tile with the grant line, announced; the field clears', async () => {
    mockRedeem = () => Promise.resolve({ kind: 'plus', days: 30, plusUntil: '2026-11-26T00:00:00Z' });
    const r = await render(createElement(RedeemScreen));
    await type(r, 'Code', 'AAAAAAAAAAAA');
    await press(r, 'Redeem');
    const done = byId(r, 'redeem-done')[0]!;
    expect(done.props['accessibilityLiveRegion']).toBe('polite');
    expect(String(done.props['accessibilityLabel']).length).toBeGreaterThan(0);
    expect(words(r)).not.toContain('A code from SocialNet gives you PLUS days or a paid series, free. Each code works once per account.');
    expect(control(r, 'Code').props['value']).toBe('');
  });
});

describe('Creator centre (creator--*)', () => {
  it('signed out: a 120 mic tile tilted 6 degrees left and "Sign in to claim your show" at 28; no foot buttons', async () => {
    mockListener = undefined;
    const r = await render(createElement(CreatorScreen));
    const tile = hosts(r, (n) => n.props['testID'] === 'glow-tile')[0]!;
    expect(flat(tile)['width']).toBe(120);
    expect(flat(tile)['transform']).toEqual([{ rotate: '-6deg' }]);
    const line = r.root.findAll((n) => String(n.type) === 'Text' && say(n.props['children']) === 'Sign in to claim your show')[0]!;
    expect(flat(line)['fontSize']).toBe(28);
    expect(has(r, 'Get my code')).toBe(false);
    expect(words(r)).toContain('Creator centre');
  });
  it('the stage: 48 bars, "Claim the show you publish" at 26, the explanation; the deck of subscribed shows with 132 cards; Claim asks for the code', async () => {
    mockSubs = ['https://a.test/feed.xml', 'https://b.test/feed.xml'];
    const r = await render(createElement(CreatorScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['Claim the show you publish', "We never host your audio — you keep your own feed. Once you prove it is yours, you see your show’s numbers and your comments carry a Host mark.", 'Creator academy', 'Claiming, numbers, comments, clips, the Studio']));
    const big = r.root.findAll((n) => String(n.type) === 'Text' && say(n.props['children']) === 'Claim the show you publish')[0]!;
    expect(flat(big)['fontSize']).toBe(26);
    expect(r.root.findAll((x) => x.props['accessibilityRole'] === 'header' && x.props['accessibilityLabel'] === 'Claim a show').length).toBeGreaterThan(0);
    const card = r.root.findAll((x) => x.props['accessibilityLabel'] === 'Claim Morning Notes' && typeof x.props['onPress'] === 'function')[0]!;
    expect(flat(card)['width']).toBe(132);
    // The foot: the field and the one light pill, dimmed until an address is typed.
    expect(control(r, 'Your feed address').props['placeholder']).toBe('Or paste your feed address (RSS)');
    const getCode = () => r.root.findAll((x) => x.props['accessibilityLabel'] === 'Get my code' && x.props['accessibilityRole'] === 'button')[0]!;
    expect(getCode().props['accessibilityState']).toMatchObject({ disabled: true });
    await type(r, 'Your feed address', 'https://c.test/feed.xml');
    expect(getCode().props['accessibilityState']).toMatchObject({ disabled: false });
    await press(r, 'Claim Morning Notes');
    // The card for the claim replaces the stage.
    expect(byId(r, 'claim-card-pending')).toHaveLength(1);
    expect(byId(r, 'creator-stage')).toHaveLength(0);
  });
  it('a bad feed address: the answer sits in hot-text in the foot, above the field', async () => {
    mockClaim = () => Promise.reject(new Error('400'));
    const r = await render(createElement(CreatorScreen));
    await type(r, 'Your feed address', 'https://c.test/feed.xml');
    await press(r, 'Get my code');
    expect(words(r)).toContain('That is not a feed address (it starts with https://).');
    const foot = byId(r, 'creator-foot')[0]!;
    expect(foot.findAll((n) => String(n.type) === 'Text' && say(n.props['children']).startsWith('That is not a feed address')).length).toBeGreaterThan(0);
  });
  it('a waiting code: the card (cap, 72 cover, steps, code in the gradient), Share code + Verify in the foot, the answer inside the card', async () => {
    mockClaims = () => Promise.resolve([{ id: 'c1', feedUrl: 'https://a.test/feed.xml', code: 'SN-7Q4K-2M', status: 'pending' }]);
    const r = await render(createElement(CreatorScreen));
    const card = byId(r, 'claim-card-pending')[0]!;
    expect(flat(card)['borderRadius']).toBe(22);
    expect(flat(card)['padding']).toBe(16);
    expect(flat(byId(r, 'claim-cover')[0])['width']).toBe(72);
    expect(flat(byId(r, 'claim-cover')[0])['borderRadius']).toBe(16);
    expect(words(r)).toEqual(expect.arrayContaining(['Pending · not proven yet', 'Morning Notes', '1. Copy this code. 2. Put it anywhere in your show description, in your hosting service. 3. Tap Verify.']));
    const code = byId(r, 'claim-code')[0]!;
    expect(code.props['accessibilityLabel']).toBe('Your code: SN-7Q4K-2M');
    expect(code.props['selectable']).toBe(true);
    expect(flat(code)['fontSize']).toBe(34);
    expect(has(r, 'Share code')).toBe(true);
    expect(has(r, 'Verify')).toBe(true);
    // Verify: not in the feed yet -> inside the card.
    await press(r, 'Verify');
    const said = 'The code is not in your feed yet. Feeds can take a few minutes to update — try again soon.';
    expect(byId(r, 'claim-card-pending')[0]!.findAll((n) => String(n.type) === 'Text' && say(n.props['children']) === said).length).toBeGreaterThan(0);
    expect(byId(r, 'creator-foot')[0]!.findAll((n) => String(n.type) === 'Text' && say(n.props['children']) === said)).toHaveLength(0);
    // Share code opens the share panel with the code and a More tile.
    await press(r, 'Share code');
    expect(mockShare).toHaveBeenCalledTimes(1);
    const req = mockShare.mock.calls[0]![0] as { heading: string; more: { detail: string; run: () => void } };
    expect(req.heading).toBe('Share your code');
    const send = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    req.more.run();
    expect(send).toHaveBeenCalledWith({ message: 'SN-7Q4K-2M' });
  });
  it('typing a feed address puts Get my code where Share code and Verify were', async () => {
    mockClaims = () => Promise.resolve([{ id: 'c1', feedUrl: 'https://a.test/feed.xml', code: 'SN-7Q4K-2M', status: 'pending' }]);
    const r = await render(createElement(CreatorScreen));
    expect(has(r, 'Get my code')).toBe(false);
    await type(r, 'Your feed address', 'https://c.test/feed.xml');
    expect(has(r, 'Get my code')).toBe(true);
    expect(has(r, 'Verify')).toBe(false);
    await type(r, 'Your feed address', '');
    expect(has(r, 'Verify')).toBe(true);
  });
  it('Verify answers: someone else has it; the feed cannot be reached; proven reloads', async () => {
    mockClaims = () => Promise.resolve([{ id: 'c1', feedUrl: 'https://a.test/feed.xml', code: 'SN-7Q4K-2M', status: 'pending' }]);
    mockVerify = () => Promise.resolve('taken');
    const r = await render(createElement(CreatorScreen));
    await press(r, 'Verify');
    expect(words(r)).toContain('Someone else has already proven this show.');
    mockVerify = () => Promise.reject(new Error('x'));
    await press(r, 'Verify');
    expect(words(r)).toContain("Couldn't reach your feed. Try again.");
    mockVerify = () => Promise.resolve({ status: 'proven' });
    mockClaims = () => Promise.resolve([{ id: 'c1', feedUrl: 'https://a.test/feed.xml', code: 'SN-7Q4K-2M', status: 'proven' }]);
    await press(r, 'Verify');
    expect(byId(r, 'claim-card-proven')).toHaveLength(1);
  });
  it('two waiting codes: the other card is tappable to choose which one Verify acts on', async () => {
    mockClaims = () => Promise.resolve([
      { id: 'c1', feedUrl: 'https://a.test/feed.xml', code: 'SN-AAAA-11', status: 'pending' },
      { id: 'c2', feedUrl: 'https://b.test/feed.xml', code: 'SN-BBBB-22', status: 'pending' },
    ]);
    let verified: string | undefined;
    mockVerify = () => { verified = 'x'; return Promise.resolve({ status: 'pending' }); };
    const r = await render(createElement(CreatorScreen));
    expect(has(r, 'Use the code for Night Shift Radio')).toBe(true);
    expect(has(r, 'Use the code for Morning Notes')).toBe(false);
    await press(r, 'Use the code for Night Shift Radio');
    expect(has(r, 'Use the code for Morning Notes')).toBe(true);
    await press(r, 'Verify');
    expect(verified).toBe('x');
  });
  it('proven: the cap, the name, the numbers, "Where people talk most" and a moment; loading says so first', async () => {
    mockClaims = () => Promise.resolve([{ id: 'c1', feedUrl: 'https://a.test/feed.xml', code: 'SN-7Q4K-2M', status: 'proven' }]);
    const r = await render(createElement(CreatorScreen));
    const card = byId(r, 'claim-card-proven')[0]!;
    expect(flat(byId(r, 'claim-cover')[0])['width']).toBe(88);
    expect(flat(byId(r, 'claim-cover')[0])['borderRadius']).toBe(18);
    expect(flat(card)['borderRadius']).toBe(22);
    expect(words(r)).toEqual(expect.arrayContaining(['Proven — you are the host', '120 listened · 14 comments · 32 episodes', 'Where people talk most', 'Why mornings matter']));
    expect(byId(r, 'proven-moment')[0]!.props['accessibilityLabel']).toBe('14:32 · Why mornings matter · 6');
    // The foot keeps the field and Get my code (nothing is waiting).
    expect(r.root.findAll((x) => x.props['accessibilityLabel'] === 'Get my code' && x.props['accessibilityRole'] === 'button')).not.toHaveLength(0);
    expect(has(r, 'Share code')).toBe(false);
  });
  it('proven numbers still loading: "Proven — loading your numbers…"', async () => {
    mockClaims = () => Promise.resolve([{ id: 'c1', feedUrl: 'https://a.test/feed.xml', code: 'SN-7Q4K-2M', status: 'proven' }]);
    mockStats = () => new Promise(() => undefined);
    const r = await render(createElement(CreatorScreen));
    expect(words(r)).toContain('Proven — loading your numbers…');
  });
  it('a failed list says so above the field', async () => {
    mockClaims = () => Promise.reject(new Error('x'));
    const r = await render(createElement(CreatorScreen));
    expect(byId(r, 'creator-foot')[0]!.findAll((n) => String(n.type) === 'Text' && say(n.props['children']) === "Couldn't load your shows").length).toBeGreaterThan(0);
  });
  it('the Creator academy card is light, 62 tall, radius 20, and links to /academy', async () => {
    const r = await render(createElement(CreatorScreen));
    const link = byId(r, 'creator-academy')[0] ?? r.root.findAll((x) => x.props['testID'] === 'creator-academy')[0]!;
    expect(flat(link)['minHeight']).toBe(62);
    expect(flat(link)['borderRadius']).toBe(20);
    expect(String(link.props['className'])).toContain('bg-text');
    expect(link.props['accessibilityLabel']).toBe('Creator academy: how claiming, numbers, comments, clips and the Studio work');
  });
});

