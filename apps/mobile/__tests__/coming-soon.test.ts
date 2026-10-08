// Checks that unreleased features show a "Coming soon" pop-up with no date or price.
/**
 * M17 guard G-E7 (FR-013, FR-014, FR-015): a feature that is not released yet says so with the
 * Coming soon pop-up — never the old "… is not set up yet." toast. Me's Wallet opens it while
 * purchases are off (with "Open Wallet", so the Wallet page stays reachable — FR-007). No date,
 * no price. M25 L3c: sign-in's not-ready methods are no longer drawn at all (App Review 2.1) —
 * see __tests__/m25-store.test.tsx — so sign-in opens no Coming soon.
 *
 * Rendered: the Coming soon sheet, the Me tab (app/(tabs)/me.tsx) with the store off and on, and
 * the sign-in page (app/auth/sign-in.tsx). One source rule stays: no file in app/ or src/ keeps
 * the old toast — a rule over every file.
 *
 * The break that turns it red: put `toast(\`${m.label} is not set up yet.\`)` back in
 * app/auth/sign-in.tsx.
 */
// The gluestack sheet animates from timers; fake ones keep them inside the test (see sheets.test.tsx).
jest.useFakeTimers();
afterAll(() => { jest.clearAllTimers(); });
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const mockPush = jest.fn();
let mockStoreReady = false;
// One object per run, as the real providers give: a new one per render re-runs Me's focus effect for ever.
const mockStores = {
  settings: { get: (k: string) => (k === 'store.ready' && mockStoreReady ? '1' : undefined), set: () => undefined },
  feedCache: {},
};
const mockSocial = { api: {}, listener: { listenerId: 'me', displayName: 'Ana', email: 'ana@example.com' } };
const mockProfileApi = { me: () => new Promise(() => undefined) };
const mockFeed = { unread: () => 0, cached: () => undefined };
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => false },
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }),
  Link: ({ children }: { children: unknown }) => children,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
  useScrollToTop: () => undefined,
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores }));
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/social/profile-api', () => ({ useProfileApi: () => mockProfileApi }));
jest.mock('@/me/my-avatar', () => ({ useMyAvatar: () => undefined }));
jest.mock('@/me/moments', () => ({ listMoments: () => [] }));
jest.mock('@/graph/feed', () => ({ createFeed: () => mockFeed }));
jest.mock('@/social/m19-api', () => ({ lastMonth: () => '2026-09', monthName: () => 'September' }));
// Sign-in's own side jobs (the notification ask, the moving tiles, the consent row) are not this guard.
jest.mock('@/notify/permission', () => ({ askForNotifications: () => Promise.resolve('known') }));
jest.mock('@/notify/expo', () => ({ expoNotify: {} }));
jest.mock('@/ui/auth/ArtWall', () => ({ ArtWall: () => null }));
jest.mock('@/ui/auth/Consent', () => ({ ConsentRow: () => null, ConsentDialog: () => null, useLegalOverlay: () => ({ open: () => undefined, overlay: null }) }));

import { GluestackUIProvider } from '@/ui/lib/gluestack-ui-provider';
import { Actionsheet, ActionsheetContent } from '@/ui/lib/actionsheet';
import { AlertDialog } from '@/ui/lib/alert-dialog';
import { ComingSoonDialog, type ComingSoonRequest } from '@/ui/kit/ComingSoon';
import { MenuRow } from '@/ui/me/parts';
import { OtherWays } from '@/ui/auth/OtherWays';
import MeScreen from '../app/(tabs)/me';
import SignInScreen from '../app/auth/sign-in';

const ROOT = join(__dirname, '..');
const files = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    if (statSync(p).isDirectory()) return f === 'node_modules' ? [] : files(p);
    return /\.(ts|tsx)$/.test(f) ? [p] : [];
  });

const rendered: ReactTestRenderer[] = [];
const render = (el: ReactElement): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(GluestackUIProvider, null, el)); });
  rendered.push(r);
  return r;
};
afterEach(() => { for (const r of rendered.splice(0)) act(() => r.unmount()); mockPush.mockClear(); mockStoreReady = false; });

/** The visible words under a node (host text only). */
const words = (n: ReactTestInstance): string =>
  n.findAll((x) => typeof x.type === 'string').flatMap((x) => x.children.filter((c): c is string => typeof c === 'string')).join(' ');
const press = (r: ReactTestRenderer, label: string) => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  act(() => { n.props['onPress'](); });
};

// Kept as a source rule: it spans every file in app/ and src/, which no single render reaches.
it('G-E7: no "not set up yet" toast is left', () => {
  const hits = [...files(join(ROOT, 'app')), ...files(join(ROOT, 'src'))].filter((f) => /is not set up yet|notReadyMessage\(/.test(readFileSync(f, 'utf8')));
  expect(hits.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
});

it('M25 L3c: sign-in draws no not-ready method, so it has no Coming soon of its own', () => {
  const r = render(createElement(SignInScreen));
  // The ways-in row is the OtherWays component (which draws only ready methods — m25-store).
  expect(r.root.findAllByType(OtherWays)).toHaveLength(1);
  // No Coming soon sheet is mounted on the page, and no button on it opens one.
  expect(r.root.findAllByType(ComingSoonDialog)).toHaveLength(0);
  const labels = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'button' && typeof n.props['accessibilityLabel'] === 'string').map((n) => n.props['accessibilityLabel'] as string);
  expect(labels).toContain('Continue with email');
  for (const label of labels) press(r, label);
  expect(words(r.root)).not.toMatch(/Coming soon|not set up yet/);
  expect(r.root.findAllByType(ComingSoonDialog)).toHaveLength(0);
});

describe('G-E7: Me opens Coming soon for Wallet while the store is off, and keeps the page one tap on', () => {
  const sheet = (r: ReactTestRenderer) => r.root.findByType(ComingSoonDialog);
  /** What the open sheet says — its content node, wherever the overlay mounts it. */
  const sheetWords = (r: ReactTestRenderer) => r.root.findAllByType(ActionsheetContent).map(words).join(' ');
  const sheetIcons = (r: ReactTestRenderer, name: string) => r.root.findAllByType(ActionsheetContent).flatMap((c) => c.findAll((n) => n.props['name'] === name));

  it('store off: Wallet opens the sheet with the wallet mark; "Open Wallet" goes to /wallet', () => {
    const r = render(createElement(MeScreen));
    const row = r.root.findAllByType(MenuRow).find((m) => m.props['label'] === 'Wallet');
    expect(row?.props['href']).toBe('/wallet');
    expect(sheet(r).props['request']).toBeUndefined();
    press(r, 'Wallet');
    const req = sheet(r).props['request'] as ComingSoonRequest;
    expect(req).toMatchObject({ feature: 'Wallet', mark: 'wallet-outline', second: { label: 'Open Wallet' } });
    expect(sheetWords(r)).toContain('Coming soon');
    expect(sheetIcons(r, 'wallet-outline').length).toBeGreaterThan(0);
    expect(mockPush).not.toHaveBeenCalled();
    press(r, 'Open Wallet');
    expect(mockPush).toHaveBeenCalledWith('/wallet');
    expect(sheet(r).props['request']).toBeUndefined();
  });

  it('store on: Wallet is a plain link to /wallet, no sheet', () => {
    mockStoreReady = true;
    const r = render(createElement(MeScreen));
    const row = r.root.findAllByType(MenuRow).find((m) => m.props['label'] === 'Wallet');
    expect(row?.props['onPress']).toBeUndefined();
    const links = r.root.findAll((n) => n.props['href'] === '/wallet' && n.findAll((x) => typeof x.type === 'string' && x.props['accessibilityLabel'] === 'Wallet' && x.props['accessibilityRole'] === 'link').length > 0);
    expect(links.length).toBeGreaterThan(0);
  });

  it('the pop-up names no date and no price', () => {
    const r = render(createElement(MeScreen));
    press(r, 'Wallet');
    const said = sheetWords(r);
    expect(said).toContain('Listening stays free');
    expect(said).not.toMatch(/\b(19|20)\d\d\b|January|February|March|April|May|June|July|August|September|October|November|December|Q[1-4]/);
    expect(said).not.toMatch(/[$£€¥]|RM ?\d|\d+\.\d\d/);
  });
});

it('G-E7: Coming soon is the B bottom sheet — a mark tile, never the old centred card', () => {
  const icon = render(createElement(ComingSoonDialog, { request: { feature: 'Wallet', mark: 'wallet-outline', line: 'One line.' }, onClose: () => undefined }));
  expect(icon.root.findAllByType(Actionsheet)).toHaveLength(1);
  expect(icon.root.findAllByType(AlertDialog)).toHaveLength(0);
  expect(icon.root.findAll((n) => n.props['name'] === 'wallet-outline').length).toBeGreaterThan(0);
  expect(words(icon.root)).toContain('Coming soon');
  // The tile also takes Google's own "G" picture.
  const google = render(createElement(ComingSoonDialog, { request: { feature: 'Google sign-in', mark: 'google', line: 'One line.' }, onClose: () => undefined }));
  expect(google.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityIgnoresInvertColors'] === true).length).toBeGreaterThan(0);
});
