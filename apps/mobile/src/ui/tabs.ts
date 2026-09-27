/**
 * The three tabs, as data (M7 T012/T024).
 *
 * They live here rather than in `app/(tabs)/_layout.tsx` so that the tap-count guard can
 * read them without importing a screen — importing the layout drags in the whole app,
 * and with it `expo-audio`, which does not exist in Node.
 */
import type { TabItem } from './TabBar';

/**
 * M10 (owner, 2026-09-27): **Discover is the first tab** and the screen the app opens on,
 * like the reference the owner chose. So Discover answers `/` (`app/(tabs)/index.tsx`)
 * and the Library moved to `/library`. `/discover` still resolves — it redirects to `/`,
 * because links carrying it already exist (G3).
 */
export const TABS: readonly TabItem[] = [
  { key: 'index', label: 'Discover' },
  { key: 'library', label: 'Library' },
  { key: 'following', label: 'Following' },
];

/**
 * Route name → the path the app has always answered on. Navigating by **path** rather
 * than by the navigator's own `navigate(name)` is deliberate: it is the same string a
 * `socialmorning://…` link carries, so a tab and a deep link cannot drift apart (G3).
 */
export const TAB_HREF: Record<string, '/' | '/library' | '/following'> = {
  index: '/',
  library: '/library',
  following: '/following',
};
