// Checks that no destination needs more taps than it did before the tab bar.
/**
 * Guard G4 — the tab bar was allowed to move things closer, never further away.
 *
 * The contract is counted against what the screens draw, so "Account is two taps" is a fact the
 * build checks rather than a claim in a plan. The Me tab (app/(tabs)/me.tsx) and Discover's
 * shortcut tiles (src/ui/discover/DiscoverShortcuts.tsx) are rendered: Me's links are read off the
 * drawn tree, every tile is pressed and where it goes is recorded. Discover's page and the Updates
 * tab stay counted against their source (kept: app/(tabs)/index.tsx has ~42 imports, library.tsx
 * ~35 — feeds, polls, overlays, sync — each would need mocking). A destination is N taps from a cold start
 * when the screen at N−1 links to it: the app opens on Discover (`/`), the tabs are one
 * tap, and a tab screen's links are two.
 *
 * M10 (owner, 2026-09-27) changed the tabs to Discover · Updates · Me. Two things went
 * one tap further, by the owner's decision, and are named here as such (`owner`):
 * the Following feed (a tab → Me → Notifications) and the show list (the Library tab →
 * Updates → My subscriptions).
 *
 * The break that turns it red: delete the Account row from `app/(tabs)/me.tsx`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TABS, TAB_HREF } from '@/ui/shell/tabs';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  // A Link is drawn as a `link` node carrying its href, so the drawn tree says where it goes.
  Link: ({ href, children }: { href: unknown; children?: React.ReactNode }) => require('react').createElement('link', { href }, children),
  router: { push: (...a: unknown[]) => mockPush(...a) },
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }),
  useFocusEffect: () => undefined,
  useScrollToTop: () => undefined,
}));
jest.mock('@/ui/lib/safe-area-view', () => ({ SafeAreaView: ({ children }: { children?: React.ReactNode }) => children }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined }, feedCache: {} }), useToast: () => () => undefined }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: {}, listener: undefined }) }));
jest.mock('@/graph/feed', () => ({ createFeed: () => ({ unread: () => 0, cached: () => undefined }) }));
jest.mock('@/me/moments', () => ({ listMoments: () => [] }));
jest.mock('@/ui/kit/ComingSoon', () => ({ useComingSoon: () => [() => undefined, null] }));
jest.mock('@/social/store-ready', () => ({ readStoreReady: () => false }));
jest.mock('@/social/m19-api', () => ({ lastMonth: () => '2026-09', monthName: () => 'September' }));
jest.mock('@/ui/kit/Avatar', () => ({ Avatar: () => null }));
jest.mock('@/me/my-avatar', () => ({ useMyAvatar: () => undefined }));
jest.mock('@/social/profile-api', () => ({ useProfileApi: () => ({ me: () => Promise.resolve(undefined) }) }));

import MeScreen from '../app/(tabs)/me';
import { DiscoverShortcuts } from '@/ui/discover/DiscoverShortcuts';

const draw = (el: React.ReactElement): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  return r;
};
/** Rendered: every href the Me tab draws a link to (signed out — what everyone sees). */
let ME_LINKS: ReadonlySet<string> = new Set();
/** Rendered: where each of Discover's shortcut tiles goes when pressed. */
let DISCOVER_TILES: ReadonlySet<string> = new Set();
beforeAll(() => {
  const me = draw(createElement(MeScreen));
  ME_LINKS = new Set(me.root.findAll((n) => n.type === 'link').map((n) => String(n.props['href'])));
  act(() => { me.unmount(); });
  mockPush.mockClear();
  const d = draw(createElement(DiscoverShortcuts, { onCategories: () => undefined, onPremium: () => undefined }));
  const tiles = d.root.findAll((n) => n.props['accessibilityRole'] === 'button' && typeof n.props['onPress'] === 'function');
  for (const t of tiles) act(() => { t.props['onPress'](); });
  DISCOVER_TILES = new Set(mockPush.mock.calls.map((c) => String(c[0])));
  act(() => { d.unmount(); });
});

const read = (f: string) => readFileSync(join(__dirname, '..', 'app', '(tabs)', f), 'utf8');
/** Kept as source: the two tab pages too heavy to render here (see the header). */
const SCREEN: Record<string, string> = { '/': read('index.tsx'), '/library': read('library.tsx') };
/** Does this screen's source open `href` — a Link, a MenuRow, or a router.push? */
const links = (src: string, href: string): boolean => {
  const h = href.replace(/[/]/g, '\\/');
  // Owner, 2026-10-01: Search is pushed with params (`{ pathname: '/search', params }`) so its box can move up.
  // M17: from Discover, Search opens in place (`search.open(...)` from useSearchOverlay) — still one tap.
  if (href === '/search' && /useSearchOverlay\(\)/.test(src) && /search\.open\(/.test(src)) return true;
  // Either quote: a formatter pass (owner, 2026-10-04) writes push("/queue").
  return new RegExp(`href="${h}"|push\\(['"]${h}['"]\\)|pathname: ['"]${h}['"]`).test(src);
};

/** Destination → taps from a cold start, before this change (Discover · Library · Following) and after. */
const CONTRACT = [
  { name: 'Discover', href: '/', before: 0, after: 0 },
  { name: 'Updates', href: '/library', before: 1, after: 1 },
  { name: 'Me', href: '/me', before: 1, after: 1 }, // new; counted as the tab it replaced
  { name: 'Chat', href: '/chat', before: 1, after: 1 }, // new (owner, 2026-10-04); a tab from the start
  { name: 'Search', href: '/search', before: 1, after: 1 },
  // Owner, 2026-10-04: the Inbox page is gone; what it listed is the Updates tab (one tap).
  { name: 'Inbox', href: '/library', before: 1, after: 1 },
  { name: 'Queue', href: '/queue', before: 1, after: 1 },
  // Owner, 2026-10-05: no Downloads tile on Discover — it stays on Me (two taps).
  { name: 'Downloads', href: '/downloads', before: 1, after: 2, owner: '2026-10-05' },
  { name: 'Account', href: '/account', before: 2, after: 2 },
  { name: 'Following feed', href: '/notifications', before: 1, after: 2, owner: '2026-09-27' },
  { name: 'Show list', href: '/subscriptions', before: 1, after: 2, owner: '2026-09-27' },
] as const;

it('G4: nothing got further away except the owner\'s named moves', () => {
  for (const row of CONTRACT) if (!('owner' in row)) expect(row.after).toBeLessThanOrEqual(row.before);
  expect(CONTRACT.filter((r) => 'owner' in r).map((r) => r.name)).toEqual(['Downloads', 'Following feed', 'Show list']);
});

it('the tabs are Discover · Updates · Chat · Me, at their paths', () => {
  expect(TABS.map((t) => t.label)).toEqual(['Discover', 'Updates', 'Chat', 'Me']);
  expect(TABS.map((t) => TAB_HREF[t.key])).toEqual(['/', '/library', '/chat', '/me']);
});

it('the rendered screens draw what they should: Me its links, Discover its eight tiles', () => {
  expect(ME_LINKS.size).toBeGreaterThanOrEqual(8);
  expect([...DISCOVER_TILES]).toEqual(expect.arrayContaining(['/queue', '/issues', '/chart']));
  // Kept as source (index.tsx is not rendered): the tiles are on Discover.
  expect(SCREEN['/']).toMatch(/<DiscoverShortcuts\b/);
});

it('every 1-tap destination is a tab or a link on Discover', () => {
  const tabs = new Set(TABS.map((t) => TAB_HREF[t.key]));
  const missing = CONTRACT.filter((r) => r.after === 1 && !tabs.has(r.href as never) && !DISCOVER_TILES.has(r.href) && !links(SCREEN['/']!, r.href)).map((r) => r.name);
  expect(missing).toEqual([]);
});

it('every 2-tap destination is a link on a tab screen', () => {
  const missing = CONTRACT.filter((r) => r.after === 2 && !ME_LINKS.has(r.href) && !DISCOVER_TILES.has(r.href) && !Object.values(SCREEN).some((src) => links(src, r.href))).map((r) => r.name);
  expect(missing).toEqual([]);
});

it('the break named above: Account is a link the Me tab draws', () => {
  expect(ME_LINKS.has('/account')).toBe(true);
});
