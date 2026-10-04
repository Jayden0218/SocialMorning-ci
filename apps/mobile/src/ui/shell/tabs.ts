// The list of bottom tabs (Discover, Updates, Chat, Me) as data.
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
/**
 * M10, second step (owner, 2026-09-27: "Discover · Updates · Me", like the reference):
 * the Library became **Updates** (same path, `/library`), and **Me** (`/me`) replaced
 * Following — whose feed now lives in Me → Notifications; `/following` redirects there.
 */
/**
 * Owner, 2026-10-04: new icons for every tab (compass, headset, chat bubbles, person in a circle),
 * and a fourth tab, **Chat** (`/chat`), third — one-to-one messages with people who follow you back.
 */
export const TABS: readonly TabItem[] = [
  { key: 'index', label: 'Discover', icon: { idle: 'compass-outline', active: 'compass' } },
  { key: 'library', label: 'Updates', icon: { idle: 'headset-outline', active: 'headset' } },
  { key: 'chat', label: 'Chat', icon: { idle: 'chatbubbles-outline', active: 'chatbubbles' } },
  { key: 'me', label: 'Me', icon: { idle: 'person-circle-outline', active: 'person-circle' } },
];

/**
 * Route name → the path the app has always answered on. Navigating by **path** rather
 * than by the navigator's own `navigate(name)` is deliberate: it is the same string a
 * `socialmorning://…` link carries, so a tab and a deep link cannot drift apart (G3).
 */
export const TAB_HREF: Record<string, '/' | '/library' | '/chat' | '/me'> = {
  index: '/',
  library: '/library',
  chat: '/chat',
  me: '/me',
};
