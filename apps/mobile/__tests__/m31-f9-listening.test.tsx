// Listening data, All time, as the shell drawing has it: one-line total, the switch at the foot, top shows as cards, the read-out line.
/**
 * M31 F9 (specs/033-m31-redesign/contact/wave-6/README.md defect 5; row me-listening--all-time). Written BEFORE the fixes: every test here is red on the code as it stands.
 * Drawing: design-pulse2 shell.html `me-listening--all-time` (markup and notes):
 *  - the total is ONE line ("312 h 40 min", `white-space:nowrap`, Unbounded 38);
 *  - "Bottom zone: back, 'Listening data', and the range switch '30 days | All time'" — `low({ title:'Listening data', size:26, below: seg(...) })`, so the switch is in the
 *    title bar's `below` slot (PushedPage `below`), not at the top of the scroll; the notes say the same for the 30-day view;
 *  - "Top shows become a Deck of 150 cards" (cover 130, rank, name, minutes), 10 apart: a snap of 160, not the 250 x 84 rows;
 *  - the line above the chart reads "Oct 2026: 41 h 10 min" — the last bar is the selected one on arrival ("Tap a bar to see its minutes." until a bar is picked is the
 *    30-day view's line; the all-time drawing shows the last month's read-out).
 * NOT tested (kept as documented): the bars' colour (the 3:1 barIdle white, not the drawn gradient).
 * Conflict noted for the coordinator: discover.html `me-listening--screen` (the older entry) draws the switch at the top and the total at 52 — the shell entry is the newer
 * one and its notes cover both ranges, so the switch test runs for 30 days too; the 52 / 250 x 84 numbers in m31-w3c-pages.test.tsx then need updating (phase 2).
 */
import { createElement } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.useFakeTimers();
afterAll(() => { jest.clearAllTimers(); });

let mockListening: (range: string) => Promise<unknown> = () => Promise.resolve({});
const mockStores = { settings: { get: () => undefined, set: () => undefined }, feeds: { getShow: () => undefined } };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/me/listening',
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => jest.fn() }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
const mockSocial = { listener: { listenerId: 'me', displayName: 'Me' }, api: {} };
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
const mockListeningApi = { listening: (range: string) => mockListening(range) };
jest.mock('@/me/listening-api', () => ({ useListeningApi: () => mockListeningApi }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import ListeningDataScreen from '../app/me/listening';

const mounted: ReactTestRenderer[] = [];
async function render(): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 50, bottom: 34, left: 0, right: 0 } }, createElement(ListeningDataScreen))); for (let i = 0; i < 6; i++) await Promise.resolve(); });
  mounted.push(r);
  return r;
}
beforeEach(() => { setReducedMotionForTest(true); });
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });

const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const texts = (r: ReactTestRenderer): ReactTestInstance[] => r.root.findAll((x) => String(x.type) === 'Text');
const words = (r: ReactTestRenderer): string[] => texts(r).map((x) => say(x.props['children']));
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === id);
const inside = (n: ReactTestInstance, id: string): boolean => { for (let p: ReactTestInstance | null = n; p; p = p.parent) if (p.props['testID'] === id) return true; return false; };
const press = async (r: ReactTestRenderer, label: string): Promise<void> => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  await act(async () => { n.props['onPress'](); for (let i = 0; i < 6; i++) await Promise.resolve(); });
};

const months = Array.from({ length: 14 }, (_, i) => ({ day: `${i < 4 ? 2025 : 2026}-${String(((i + 8) % 12) + 1).padStart(2, '0')}`, minutes: i === 13 ? 2470 : 600 + i * 40 }));
const days = Array.from({ length: 30 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, minutes: 20 }));
const tops = [{ feedUrl: 'f1', title: 'Morning Notes', minutes: 5280 }, { feedUrl: 'f2', title: 'Night Shift Radio', minutes: 3660 }, { feedUrl: 'f3', title: 'Field Recordings', minutes: 2400 }];
const data = (range: string) => (range === 'all'
  ? { range, days: months, totalMinutes: 18760, topShows: tops }
  : { range, days, totalMinutes: 612, topShows: tops });

describe('F9-5 Listening data, All time (me-listening--all-time)', () => {
  beforeEach(() => { mockListening = (range) => Promise.resolve(data(range)); });

  it('the total is one line: numberOfLines 1 (it never wraps "312 h 40 / min")', async () => {
    const r = await render();
    await press(r, 'All time');
    const total = texts(r).find((x) => say(x.props['children']) === '312 h 40 min')!;
    expect(total).toBeDefined();
    expect(total.props['numberOfLines']).toBe(1);
  });

  it.each(['30d', 'all'])('the range switch sits in the title bar\'s foot (pushed-below), not at the top of the scroll — %s', async (range) => {
    const r = await render();
    if (range === 'all') await press(r, 'All time');
    const sw = byId(r, 'segment-switch');
    expect(sw).toHaveLength(1);
    expect(inside(sw[0]!, 'pushed-below')).toBe(true);
  });

  it('top shows are a deck of 150-wide cards (snap 160) with a 130 cover, not 250 x 84 rows', async () => {
    const r = await render();
    await press(r, 'All time');
    const deck = byId(r, 'deck')[0]!;
    expect(deck.props['snapToInterval']).toBe(160);
    expect(r.root.findAll((n) => n.props['size'] === 130).length).toBeGreaterThan(0);
  });

  it('the last month is read out on arrival: "Oct 2026: 41 h 10 min", and the "Tap a bar" hint is not shown', async () => {
    const r = await render();
    await press(r, 'All time');
    expect(words(r)).toContain('Oct 2026: 41 h 10 min');
    expect(words(r)).not.toContain('Tap a bar to see its minutes.');
  });

  it('the 30-day view keeps its hint until a bar is picked (me-listening--30-days)', async () => {
    const r = await render();
    expect(words(r)).toContain('Tap a bar to see its minutes.');
  });
});
