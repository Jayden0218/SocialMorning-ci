/**
 * M17 guard G-S2 — a page opened from Search is an ordinary push, so the edge swipe closes it.
 *
 * Phone walk 2026-10-02 (docs/gate-logs/M16a-GATE-LOG.md, Tier B A): an episode opened from Search could not
 * be closed with the left-edge swipe, 0 of 5; ← worked. Cause: Search was
 * `presentation: 'transparentModal'` in app/_layout.tsx, and expo-router's native stack groups
 * every later route with a modal — `getModalRouteKeys` marks a route with no `presentation` after
 * a modal as a modal, and SceneView then presents it as `'modal'` (an iOS sheet, no edge swipe).
 * Search is now drawn in place over the tabs from Discover (src/ui/search/SearchOverlay.tsx), and
 * the `/search` route that remains is an ordinary page.
 *
 * This runs expo-router's OWN grouping rule over the root stack's real options, so it goes red on
 * any modal that pages are pushed from — not only on Search. Whether iOS then gives the swipe is the
 * phone's row (Tier B), not this test's.
 *
 * The break that turns it red: put `presentation: 'transparentModal'` back on the `search` screen
 * in app/_layout.tsx.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const APP = join(__dirname, '..', 'app');
const layout = readFileSync(join(APP, '_layout.tsx'), 'utf8');

// expo-router's own rule (build/react-navigation/native-stack/utils/getModalRoutesKeys.js).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getModalRouteKeys } = require(join(dirname(require.resolve('expo-router/package.json')), 'build', 'react-navigation', 'native-stack', 'utils', 'getModalRoutesKeys.js')) as {
  getModalRouteKeys: (routes: { key: string }[], descriptors: Record<string, { options: { presentation?: string } }>) => string[];
};

/** Each `<Stack.Screen name="…" options={{ … }} />` in the root layout → its `presentation`, if any. */
const screens = new Map<string, string | undefined>();
for (const m of layout.matchAll(/<Stack\.Screen\s+name="([^"]+)"\s+options=\{\{(.*?)\}\}\s*\/>/g)) {
  screens.set(m[1]!, /presentation:\s*'([^']+)'/.exec(m[2]!)?.[1]);
}
const descriptors = (names: string[]) => Object.fromEntries(names.map((n) => [n, { options: screens.get(n) === undefined ? {} : { presentation: screens.get(n)! } }]));

/** Modal pages that open nothing on top of themselves. Anything else must not be a modal. */
const LEAF_MODALS = ['voice/new'];

it('the scan found the root stack and its Search screen', () => {
  expect(screens.size).toBeGreaterThanOrEqual(40);
  expect(screens.has('search')).toBe(true);
});

it('the rule is live: a modal Search would make the episode pushed from it a modal too', () => {
  const routes = ['(tabs)', 'search', 'episode/[id]'].map((key) => ({ key }));
  const d = { '(tabs)': { options: {} }, search: { options: { presentation: 'transparentModal' } }, 'episode/[id]': { options: {} } };
  expect(getModalRouteKeys(routes, d)).toEqual(['search', 'episode/[id]']);
});

it('Search → episode → show → profile: no page is grouped with a modal', () => {
  const chain = ['(tabs)', 'search', 'episode/[id]', 'show/[feedUrl]', 'profile/[id]', 'comments/[episodeId]'];
  expect(getModalRouteKeys(chain.map((key) => ({ key })), descriptors(chain))).toEqual([]);
});

it('only leaf pages are modals in the root stack', () => {
  const modal = [...screens].filter(([, p]) => p !== undefined && p !== 'card').map(([n]) => n);
  expect(modal.filter((n) => !LEAF_MODALS.includes(n))).toEqual([]);
});

it('Discover opens Search in place, inside the tab screen, not as a route', () => {
  const discover = readFileSync(join(APP, '(tabs)', 'index.tsx'), 'utf8');
  expect(discover).toMatch(/search\.open\(/);
  expect(discover).not.toMatch(/pathname: '\/search'/);
  const tabs = readFileSync(join(APP, '(tabs)', '_layout.tsx'), 'utf8');
  expect(tabs).toMatch(/<SearchOverlayHost>[\s\S]*<Tabs[\s\S]*<\/Tabs>[\s\S]*<\/SearchOverlayHost>/);
});
