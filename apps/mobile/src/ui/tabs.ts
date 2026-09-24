/**
 * The three tabs, as data (M7 T012/T024).
 *
 * They live here rather than in `app/(tabs)/_layout.tsx` so that the tap-count guard can
 * read them without importing a screen — importing the layout drags in the whole app,
 * and with it `expo-audio`, which does not exist in Node.
 */
import type { TabItem } from './TabBar';

export const TABS: readonly TabItem[] = [
  { key: 'index', label: 'Library' },
  { key: 'discover', label: 'Discover' },
  { key: 'following', label: 'Following' },
];

/**
 * Route name → the path the app has always answered on. Navigating by **path** rather
 * than by the navigator's own `navigate(name)` is deliberate: it is the same string a
 * `socialmorning://…` link carries, so a tab and a deep link cannot drift apart (G3).
 */
export const TAB_HREF: Record<string, '/' | '/discover' | '/following'> = {
  index: '/',
  discover: '/discover',
  following: '/following',
};
