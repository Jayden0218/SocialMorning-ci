/**
 * Guard G4 — the tab bar was allowed to move things closer, never further away.
 *
 * The contract is counted against the source, so "Account is two taps" is a fact the
 * build checks rather than a claim in a plan. A destination is N taps from a cold start
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
import { TABS, TAB_HREF } from '../src/ui/tabs';

const read = (f: string) => readFileSync(join(__dirname, '..', 'app', '(tabs)', f), 'utf8');
const SCREEN: Record<string, string> = { '/': read('index.tsx'), '/library': read('library.tsx'), '/me': read('me.tsx') };
/** Does this screen's source open `href` — a Link, a MenuRow, or a router.push? */
const links = (src: string, href: string): boolean => {
  const h = href.replace(/[/]/g, '\\/');
  // Owner, 2026-10-01: Search is pushed with params (`{ pathname: '/search', params }`) so its box can move up.
  // M17: from Discover, Search opens in place (`search.open(...)` from useSearchOverlay) — still one tap.
  if (href === '/search' && /useSearchOverlay\(\)/.test(src) && /search\.open\(/.test(src)) return true;
  return new RegExp(`href="${h}"|push\\('${h}'\\)|pathname: '${h}'`).test(src);
};

/** Destination → taps from a cold start, before this change (Discover · Library · Following) and after. */
const CONTRACT = [
  { name: 'Discover', href: '/', before: 0, after: 0 },
  { name: 'Updates', href: '/library', before: 1, after: 1 },
  { name: 'Me', href: '/me', before: 1, after: 1 }, // new; counted as the tab it replaced
  { name: 'Search', href: '/search', before: 1, after: 1 },
  { name: 'Inbox', href: '/inbox', before: 1, after: 1 },
  { name: 'Queue', href: '/queue', before: 1, after: 1 },
  { name: 'Downloads', href: '/downloads', before: 1, after: 1 },
  { name: 'Account', href: '/account', before: 2, after: 2 },
  { name: 'Following feed', href: '/notifications', before: 1, after: 2, owner: '2026-09-27' },
  { name: 'Show list', href: '/subscriptions', before: 1, after: 2, owner: '2026-09-27' },
] as const;

it('G4: nothing got further away except the owner\'s two named moves', () => {
  for (const row of CONTRACT) if (!('owner' in row)) expect(row.after).toBeLessThanOrEqual(row.before);
  expect(CONTRACT.filter((r) => 'owner' in r).map((r) => r.name)).toEqual(['Following feed', 'Show list']);
});

it('the tabs are Discover · Updates · Me, at their paths', () => {
  expect(TABS.map((t) => t.label)).toEqual(['Discover', 'Updates', 'Me']);
  expect(TABS.map((t) => TAB_HREF[t.key])).toEqual(['/', '/library', '/me']);
});

it('every 1-tap destination is a tab or a link on Discover', () => {
  const tabs = new Set(TABS.map((t) => TAB_HREF[t.key]));
  const missing = CONTRACT.filter((r) => r.after === 1 && !tabs.has(r.href as never) && !links(SCREEN['/']!, r.href)).map((r) => r.name);
  expect(missing).toEqual([]);
});

it('every 2-tap destination is a link on a tab screen', () => {
  const missing = CONTRACT.filter((r) => r.after === 2 && !Object.values(SCREEN).some((src) => links(src, r.href))).map((r) => r.name);
  expect(missing).toEqual([]);
});
