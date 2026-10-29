// Wave-5 capture defects that need a render: Downloads layout, Unmute, pending deletion, edge labels, the legal document, the 30-day total.
/**
 * M31 F8 (specs/033-m31-redesign/contact/wave-5/README.md, "Defects to route"). Written BEFORE the fixes; the pure parts (toast spots,
 * decimal sizes, the due date) are in `m31-f8-wave5-pure.test.ts`.
 *
 *  4. Unmute: the unmuted row leaves the list, and the "No muted threads" note shows only when the list is empty. (Already true in the
 *     source since 04f0177d; this pins it and is expected to PASS.)
 *  5. Pending deletion: the sign-in answer sets the store BEFORE the listener is attached; the sheet must still open once it is.
 *     Break: bring back `if (!listener && pending) pendingDeletionStore.set(null)` in PendingDeletion.tsx.
 *  6. Downloads: "Manage downloads ›" must not run off the right edge: its row wraps, or the link shrinks and wraps its words.
 *  7. Edge labels: a section shorter than its rotated label still reserves the label's length (Settings > More: YOUR SHOWS / PLAYBACK / FOR YOU).
 *  8. Legal document: no "0 Introduction" contents row (the drawing's contents are 1..8), and the text clears the status bar.
 *  9. Listening data: the 30-day total is minutes ("612 min", me-listening--30-days); All time keeps "94 h 12 min".
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.useFakeTimers();
afterAll(() => { jest.clearAllTimers(); });

const mockPush = jest.fn();
const mockToast = jest.fn();
const mockMemory = new Map<string, string>();
let mockListener: { listenerId: string; displayName: string } | undefined;
const mockAuth = { signOut: jest.fn(() => Promise.resolve()) };
const mockM22 = { cancelDeletion: jest.fn(() => Promise.resolve()) };
const mockMuted = jest.fn();
const mockUnmute = jest.fn(() => Promise.resolve());
let mockListening: (range: string) => Promise<unknown> = () => Promise.resolve({});
let mockUsed = 14 * 88_000_000;
let mockBudget = 2_000_000_000;

const mockDownloads = {
  subscribe: () => () => undefined, usedBytes: () => mockUsed, budgetBytes: () => mockBudget, allowMobile: () => false, setAllowMobile: jest.fn(),
  deleteAfterPlay: () => false, setDeleteAfterPlay: jest.fn(), evictOldest: () => false, setEvictOldest: jest.fn(), remove: jest.fn(() => Promise.resolve()),
};
const mockStores = {
  settings: { get: (k: string) => mockMemory.get(k), set: (k: string, v: string) => { mockMemory.set(k, v); } },
  downloads: { list: () => Array.from({ length: 14 }, (_, i) => ({ episodeId: `e${i}`, state: 'complete' })) },
};
jest.mock('expo-router', () => ({
  Link: ({ children, asChild: _a, href, ...rest }: { children: React.ReactElement<Record<string, unknown>>; asChild?: boolean; href?: unknown }) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').cloneElement(children, { ...rest, ...children.props, onPress: children.props.onPress ?? (() => mockPush(href)) }),
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }),
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePathname: () => '/settings/downloads',
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast, useDownloads: () => mockDownloads, useCovered: () => false }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ auth: mockAuth, listener: mockListener, api: {} }) }));
jest.mock('@/social/api-m22-server', () => ({ ...(jest.requireActual('@/social/api-m22-server') as Record<string, unknown>), useM22Api: () => mockM22 }));
const mockSocialApi = { mutedThreads: () => mockMuted(), unmuteThread: (...a: unknown[]) => mockUnmute(...(a as [])) };
jest.mock('@/social/api-m22-social', () => ({ useM22SocialApi: () => mockSocialApi }));
const mockListeningApi = { listening: (range: string) => mockListening(range) };
jest.mock('@/me/listening-api', () => ({ useListeningApi: () => mockListeningApi }));
jest.mock('@/storage/clear-cache', () => ({
  ...(jest.requireActual('@/storage/clear-cache') as Record<string, unknown>),
  phoneCacheEntries: () => [], cacheBytes: () => 0, clearCache: () => 0,
}));
jest.mock('@/ui/lib/modal', () => {
  const pass = (p: { children?: unknown; isOpen?: boolean }) => (p.isOpen === false ? null : (p.children ?? null));
  return { Modal: pass, ModalBackdrop: () => null, ModalContent: pass };
});
jest.mock('@/config/store', () => ({ useSectionTitle: (t: string) => t }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import Downloads from '../app/settings/downloads';
import ListeningDataScreen from '../app/me/listening';
import { MutedThreads } from '@/ui/social/MutedThreads';
import { PendingDeletionSheet } from '@/ui/auth/PendingDeletion';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { pendingDeletionStore } from '@/social/api-m22-server';
import { Sec } from '@/ui/settings/hub-parts';
import { Section } from '@/ui/settings/panel';
import { SET } from '@/ui/settings/hub-measures';
import { LegalDoc } from '@/ui/shell/LegalDoc';
import { LEGAL_TEXT } from '@/legal/texts';

const INSETS = { top: 50, bottom: 34, left: 0, right: 0 };
const mounted: ReactTestRenderer[] = [];
async function render(el: React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: INSETS }, el)); for (let i = 0; i < 4; i++) await Promise.resolve(); });
  mounted.push(r);
  return r;
}
beforeEach(() => {
  setReducedMotionForTest(true);
  mockMemory.clear(); mockToast.mockClear(); mockPush.mockClear(); mockUnmute.mockClear();
  mockListener = undefined; mockUsed = 14 * 88_000_000; mockBudget = 2_000_000_000;
});
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); pendingDeletionStore.set(null); }); setReducedMotionForTest(undefined); });

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
const press = async (r: ReactTestRenderer, label: string): Promise<void> => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  await act(async () => { n.props['onPress'](); for (let i = 0; i < 4; i++) await Promise.resolve(); });
};

describe('F8-4 Muted threads: after Unmute the row leaves and the note shows only for an empty list', () => {
  const two = [{ threadKind: 'comment', threadKey: 'k1', title: 'Bea replied' }, { threadKind: 'like', threadKey: 'k2', title: 'Rui liked' }];
  it('unmuting one of two removes that row, keeps the other, and shows no note', async () => {
    mockMuted.mockReturnValue(Promise.resolve(two));
    const r = await render(createElement(MutedThreads));
    expect(byId(r, 'muted-thread-row')).toHaveLength(2);
    await press(r, 'Unmute Bea replied');
    expect(byId(r, 'muted-thread-row')).toHaveLength(1);
    expect(words(r)).toContain('Rui liked');
    expect(words(r)).not.toContain('Bea replied');
    expect(words(r).some((w) => w.startsWith('No muted threads'))).toBe(false);
  });
  it('unmuting the last one leaves no row and shows the note', async () => {
    mockMuted.mockReturnValue(Promise.resolve([two[0]]));
    const r = await render(createElement(MutedThreads));
    await press(r, 'Unmute Bea replied');
    expect(byId(r, 'muted-thread-row')).toHaveLength(0);
    expect(words(r).some((w) => w.startsWith('No muted threads'))).toBe(true);
    expect(mockToast).toHaveBeenCalledWith('Unmuted. New notices from it will show again.');
  });
});

describe('F8-5 Pending deletion: the answer arrives before the listener does', () => {
  it('the store is set while no listener is attached; once the listener is attached the sheet opens', async () => {
    const tree = (): React.ReactElement => createElement(SafeAreaInsetsContext.Provider, { value: INSETS }, createElement(PendingDeletionSheet));
    let r!: ReactTestRenderer;
    mockListener = undefined;
    await act(async () => { r = create(tree()); });
    mounted.push(r);
    const open = (): unknown => r.root.findAll((n) => n.type === ActionSheet)[0]!.props['open'];
    // `onAccepted` runs inside `accept`, before the context's setListener(r).
    await act(async () => { pendingDeletionStore.set({ dueAt: '2026-11-11T12:00:00.000Z' }); });
    expect(open()).toBe(false);
    mockListener = { listenerId: 'me', displayName: 'Me' };
    await act(async () => { r.update(tree()); });
    expect(pendingDeletionStore.get()).not.toBeNull();
    expect(open()).toBe(true);
  });
});

describe('F8-6 Downloads: "Manage downloads ›" stays on the screen', () => {
  it('with a long size label the link can shrink and its words wrap (or its row wraps); it never sits in a no-shrink no-wrap row', async () => {
    mockUsed = 1_999_999_999; mockBudget = 2_000_000_000;
    const r = await render(createElement(Downloads));
    const link = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Manage downloads and storage limit' && n.props['style'] !== undefined)[0];
    expect(link).toBeDefined();
    // The row that holds both buttons.
    let row: ReactTestInstance | null = link!.parent;
    while (row && !String(row.props['className'] ?? '').includes('flex-row') && flat(row)['flexDirection'] !== 'row') row = row.parent;
    expect(row).not.toBeNull();
    const rowWraps = flat(row!)['flexWrap'] === 'wrap' || String(row!.props['className'] ?? '').includes('flex-wrap');
    const linkShrinks = Number(flat(link)['flexShrink'] ?? 0) >= 1 || String(link!.props['className'] ?? '').includes('shrink');
    const label = link!.findAll((n) => String(n.type) === 'Text')[0]!;
    const labelWraps = label.props['numberOfLines'] !== 1;
    expect(rowWraps || (linkShrinks && labelWraps)).toBe(true);
  });
});

describe('F8-7 Edge labels: a short section still holds its rotated label', () => {
  const LABEL_LEN = 91;
  async function withLabel(el: React.ReactElement): Promise<ReactTestRenderer> {
    const r = await render(el);
    const copy = byId(r, 'edge-measure')[0]!;
    const measured = copy.findAll((n) => String(n.type) === 'Text')[0]!;
    act(() => { measured.props['onLayout']({ nativeEvent: { layout: { width: LABEL_LEN - 0.4, height: 14, x: 0, y: 0 } } }); });
    return r;
  }
  const short = createElement('View');
const sec = (C: typeof Sec | typeof Section, label: string): React.ReactElement => createElement(C as typeof Sec, { label, testID: 'sec', children: short });
  it.each(['Your shows', 'Playback', 'For You'])('Settings Sec "%s" (hub-parts, what Settings > More uses): minHeight >= label length', async (label) => {
    const r = await withLabel(sec(Sec, label));
    expect(Number(flat(byId(r, 'sec')[0])['minHeight'] ?? 0)).toBeGreaterThanOrEqual(LABEL_LEN + SET.edgeTop);
  });
  it.each(['Your shows', 'Playback', 'For You'])('panel Section "%s": minHeight >= label length', async (label) => {
    const r = await withLabel(sec(Section, label));
    expect(Number(flat(byId(r, 'sec')[0])['minHeight'] ?? 0)).toBeGreaterThanOrEqual(LABEL_LEN + 2);
  });
});

describe('F8-8 the legal document', () => {
  it('lists no "0 Introduction" row for the lead-in text; every contents row is a numbered part', async () => {
    const r = await render(createElement(LegalDoc, { text: LEGAL_TEXT.agreement, name: 'Service Agreement', onClose: jest.fn() }));
    const rows = r.root.findAll((n) => typeof n.props['accessibilityLabel'] === 'string' && String(n.props['accessibilityLabel']).startsWith('Go to ') && typeof n.props['onPress'] === 'function');
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.map((n) => n.props['accessibilityLabel'])).not.toContain('Go to Introduction');
    expect(words(r)).not.toContain('0'); // the hot number column of the dropped row
  });
  it('the text starts below the status bar (top padding >= the top inset)', async () => {
    const r = await render(createElement(LegalDoc, { text: LEGAL_TEXT.agreement, name: 'Service Agreement', onClose: jest.fn() }));
    const scroll = r.root.findAll((n) => n.props['contentContainerStyle'] !== undefined)[0]!;
    expect(Number((StyleSheet.flatten(scroll.props['contentContainerStyle']) as Record<string, unknown>)['paddingTop'])).toBeGreaterThanOrEqual(INSETS.top);
  });
});

describe('F8-9 Listening data: the total is minutes on 30 days', () => {
  const days = Array.from({ length: 30 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, minutes: 20 }));
  it('30 days: 612 minutes reads "612 min" (me-listening--30-days)', async () => {
    mockListener = { listenerId: 'me', displayName: 'Me' };
    mockListening = () => Promise.resolve({ range: '30d', days, totalMinutes: 612, topShows: [] });
    const r = await render(createElement(ListeningDataScreen));
    expect(words(r)).toContain('612 min');
    expect(words(r)).not.toContain('10 h 12 min');
  });
  it('All time keeps hours: 5652 minutes reads "94 h 12 min"', async () => {
    mockListener = { listenerId: 'me', displayName: 'Me' };
    mockListening = (range) => Promise.resolve({ range, days, totalMinutes: 5652, topShows: [] });
    const r = await render(createElement(ListeningDataScreen));
    await press(r, 'All time');
    expect(words(r)).toContain('94 h 12 min');
  });
});
