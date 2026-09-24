/**
 * Guard G4 — the tab bar was allowed to move things closer, never further away.
 *
 * FR-010 froze behaviour; the owner's clarification then relaxed it **for navigation
 * only**, which is a documented decision and not a licence to bury a screen. The
 * contract from research R5 is counted here against the source, so "Account is still
 * two taps" is a fact the build checks rather than a claim in a plan.
 *
 * The break that turns it red: delete the Account link from the Library.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TABS } from '../src/ui/tabs';

const library = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'index.tsx'), 'utf8');
const linkedFromLibrary = (href: string): boolean =>
  new RegExp(`<NavLink[^>]*href="${href.replace('/', '\\/')}"`).test(library);

/** Destination → taps from a cold start, before M7 and after. */
const CONTRACT = [
  { name: 'Discover', href: '/discover', before: 2, after: 1 },
  { name: 'Following', href: '/following', before: 2, after: 1 },
  { name: 'Search', href: '/search', before: 2, after: 2 },
  { name: 'Inbox', href: '/inbox', before: 2, after: 2 },
  { name: 'Queue', href: '/queue', before: 2, after: 2 },
  { name: 'Downloads', href: '/downloads', before: 2, after: 2 },
  { name: 'Account', href: '/account', before: 2, after: 2 },
] as const;

it('G4: nothing got further away', () => {
  for (const row of CONTRACT) expect(row.after).toBeLessThanOrEqual(row.before);
});

it('the 1-tap destinations are tabs, and only those', () => {
  const tabHrefs = TABS.map((t) => (t.key === 'index' ? '/' : `/${t.key}`));
  expect(tabHrefs).toEqual(['/', '/discover', '/following']);
  for (const row of CONTRACT) {
    expect(tabHrefs.includes(row.href)).toBe(row.after === 1);
  }
});

it('every 2-tap destination is still one link away on the Library', () => {
  const missing = CONTRACT.filter((r) => r.after === 2 && !linkedFromLibrary(r.href)).map((r) => r.name);
  expect(missing).toEqual([]);
});

it('the two that became tabs no longer duplicate as links — one route, one way in', () => {
  expect(linkedFromLibrary('/discover')).toBe(false);
  expect(linkedFromLibrary('/following')).toBe(false);
});
