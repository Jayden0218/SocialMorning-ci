// Tests the show's "Support" tile and its sheet: paid episodes as a deck of 220 wide cards, Buy all, Gift, and the tip chips.
/**
 * M31 W3-A (T040; design-pulse2 `show--paid-episodes-and-tips`, not capturable: Google Play billing only). In Jest only; NOT VERIFIED on a phone.
 *   - the show page gets one Panel tile, "Support {show}"; nothing when there is nothing to support (no paid episodes, tips off);
 *   - the tile opens the sheet; a card is 220 wide, radius 20, its cover 90; a locked card has a lock and — where the creator set a
 *     free preview — a Preview pill that plays the range; once bought a card says Play and plays;
 *   - Buy all paid episodes · price (light), Gift this series · price (quiet), three tip chips 36 tall with the price, and the free line.
 * The break that turns it red: in src/ui/show/ShowSales.tsx make a card `width: 200`, or render the sheet content without opening it.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const mockBuy = jest.fn();
const mockToast = jest.fn();
const mockPreviewStart = jest.fn();
const mockLoad = jest.fn();
let mockPaid: Record<string, unknown> | undefined;
const mockApi = {
  paid: () => (mockPaid ? Promise.resolve(mockPaid) : Promise.reject(new Error('none'))),
  access: () => Promise.resolve({ url: 'https://a/paid.mp3' }),
  preview: () => Promise.resolve({ url: 'https://a/preview.mp3', startMs: 1000, endMs: 31000 }),
};
const mockStore = { ready: true, granted: 0, error: undefined as string | undefined, gift: undefined as { url: string } | undefined, price: (id: string) => ({ shows_all: 'RM 19.90', gift_tier_1: 'RM 19.90', tip_small: 'RM 2', tip_medium: 'RM 5', tip_large: 'RM 10' } as Record<string, string>)[id], buy: (...a: unknown[]) => mockBuy(...a) };

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), router: { push: jest.fn() }, usePathname: () => '/show/x' }));
jest.mock('@/ui/shell/providers', () => {
  const stores = { settings: { get: () => undefined, set: () => undefined } };
  return { useStores: () => stores, useToast: () => mockToast };
});
jest.mock('@/playback/store', () => ({ usePlayer: () => ({ load: (...a: unknown[]) => mockLoad(...a) }) }));
jest.mock('@/playback/preview', () => ({ startPreview: (...a: unknown[]) => mockPreviewStart(...a) }));
jest.mock('@/billing/purchase-api', () => ({ usePurchaseApi: () => mockApi }));
jest.mock('@/billing/play', () => ({ usePlayStore: () => mockStore }));
jest.mock('@/billing/products', () => ({ giftProductFor: (id: string) => (id === 'shows_all' ? 'gift_tier_1' : undefined), TIP_LABELS: { tip_small: 'Small tip', tip_medium: 'Tip', tip_large: 'Big tip' }, TIPS: ['tip_small', 'tip_medium', 'tip_large'] }));
jest.mock('@/social/store-ready', () => ({ readStoreReady: () => true }));

import { ShowSales } from '@/ui/show/ShowSales';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const rendered: ReactTestRenderer[] = [];
async function mount(props: { tipsEnabled: boolean }): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } }, createElement(ShowSales, { feedUrl: 'https://f/x.xml', showTitle: 'Morning Notes', ...props })));
  });
  rendered.push(r);
  return r;
}
const style = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const labels = (r: ReactTestRenderer): string[] => r.root.findAll((n) => typeof n.type === 'string' && typeof n.props['accessibilityLabel'] === 'string').map((n) => n.props['accessibilityLabel'] as string);
const text = (r: ReactTestRenderer): string => JSON.stringify(r.toJSON());
const inner = (r: ReactTestRenderer, label: string): ReactTestInstance => { const all = r.root.findAll((n) => n.props['accessibilityLabel'] === label); return all[all.length - 1]!; };
const press = async (r: ReactTestRenderer, label: string) => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}" in: ${labels(r).join(' | ')}`);
  await act(async () => { n.props['onPress'](); });
};

const item = (n: number, over: Record<string, unknown> = {}) => ({ id: `h${n}`, episodeId: `e${n}`, title: `Bonus ${n}`, description: '', durationMs: 600_000, publishedAt: '2026-10-01', coverUrl: null, ...over });

beforeEach(() => {
  jest.useFakeTimers();
  setReducedMotionForTest(true);
  for (const m of [mockBuy, mockToast, mockPreviewStart, mockLoad]) m.mockClear();
  mockPaid = { forSale: true, productId: 'shows_all', bought: false, items: [item(1, { preview: { startMs: 1000, endMs: 31000 } }), item(2)] };
});
afterEach(() => {
  for (const r of rendered.splice(0)) act(() => { r.unmount(); });
  act(() => { for (let i = 0; i < 50 && jest.getTimerCount() > 0; i++) jest.runOnlyPendingTimers(); });
  jest.clearAllTimers();
  jest.useRealTimers();
  setReducedMotionForTest(undefined);
});

describe('the Support tile', () => {
  it('is one Panel tile named for the show, and the sheet is closed until it is tapped', async () => {
    const r = await mount({ tipsEnabled: true });
    expect(labels(r)).toContain('Support Morning Notes');
    expect(text(r)).toContain('Paid episodes · Tip the host');
    expect(labels(r)).not.toContain('Buy all paid episodes · RM 19.90');
    await press(r, 'Support Morning Notes');
    expect(labels(r)).toContain('Buy all paid episodes · RM 19.90');
  });

  it('is not drawn when there is nothing to support', async () => {
    mockPaid = undefined;
    const r = await mount({ tipsEnabled: false });
    expect(r.toJSON()).toBeNull();
  });
});

describe('the sheet', () => {
  it('a deck of 220 wide cards (radius 20, cover 90); locked ones have a Preview pill only where the creator set one', async () => {
    const r = await mount({ tipsEnabled: true });
    await press(r, 'Support Morning Notes');
    const one = inner(r, 'Bonus 1, paid episode');
    expect(style(one)).toMatchObject({ width: 220, borderRadius: 20 });
    expect(labels(r)).toContain('Play the free preview of Bonus 1');
    expect(labels(r)).not.toContain('Play the free preview of Bonus 2');
    expect(r.root.findAll((n) => typeof n.type === 'string' && style(n)['height'] === 90).length).toBeGreaterThan(0);
    // The pill is 36 tall with a 48 reach.
    const pill = inner(r, 'Play the free preview of Bonus 1');
    expect((style(pill)['height'] as number) + 2 * (pill.props['hitSlop'] as number)).toBeGreaterThanOrEqual(48);
    await press(r, 'Play the free preview of Bonus 1');
    expect(mockPreviewStart).toHaveBeenCalledTimes(1);
    expect(mockPreviewStart.mock.calls[0]![2]).toEqual({ startMs: 1000, endMs: 31000 });
  });

  it('Buy all and Gift carry their price; Gift is the quiet one with its old name; the tip chips are 36 tall with prices and the free line', async () => {
    const r = await mount({ tipsEnabled: true });
    await press(r, 'Support Morning Notes');
    await press(r, 'Buy all paid episodes · RM 19.90');
    expect(mockBuy).toHaveBeenCalledWith('shows_all', { feedUrl: 'https://f/x.xml' });
    await press(r, 'Gift this series to someone');
    expect(mockBuy).toHaveBeenLastCalledWith('gift_tier_1', { feedUrl: 'https://f/x.xml' });
    expect(text(r)).toContain('Gift this series · RM 19.90');
    for (const l of ['Small tip, RM 2', 'Tip, RM 5', 'Big tip, RM 10']) expect(style(inner(r, l))['height']).toBe(36);
    await press(r, 'Tip, RM 5');
    expect(mockBuy.mock.calls.at(-1)![0]).toBe('tip_medium');
    expect(text(r)).toContain('Through Google Play. The show stays free for everyone.');
  });

  it('once bought a card says Play and plays; there is no Buy and no Preview', async () => {
    mockPaid = { forSale: true, productId: 'shows_all', bought: true, items: [item(1, { preview: { startMs: 0, endMs: 1000 } })] };
    const r = await mount({ tipsEnabled: false });
    await press(r, 'Support Morning Notes');
    expect(text(r)).toContain('PAID EPISODES — YOURS');
    expect(labels(r)).not.toContain('Buy all paid episodes · RM 19.90');
    expect(labels(r).some((l) => l.startsWith('Play the free preview'))).toBe(false);
    await press(r, 'Play Bonus 1');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });
});
