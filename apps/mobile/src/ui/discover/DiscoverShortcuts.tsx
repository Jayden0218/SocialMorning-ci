// The round shortcut tiles under Discover's search box, in the order, names and set the admin chose.
/**
 * Moved out of app/(tabs)/index.tsx in M25 (lane AC, A7) so the admin can order, rename and hide
 * them (`app_config` key `shortcuts`, Admin › App settings). With nothing saved — and offline before
 * the first fetch — the tiles are exactly the eight of before, in the same order:
 * Categories, Queue, Issues, Friends listening, Academy, Premium, Plaza, Talked about.
 *
 * History kept from index.tsx: owner 2026-10-04, no Inbox tile (it showed what Updates shows);
 * 2026-10-05, no Downloads tile (Downloads stays in Settings); M12 FR-101/102 Issues and Friends
 * listening; M21 T082 (FR-061) Academy, Premium (the "Premium picks" section) and the Plaza;
 * 2026-10-07 "Talked about" makes two even rows of four.
 */
import { useRouter } from 'expo-router';
import { orderedVisible, SHORTCUT_IDS, SHORTCUT_LABELS, type ShortcutId } from '@socialmorning/social-core';
import type { IconName } from '@/ui/kit/Icon';
import { useAppConfig } from '@/config/store';
import { Shortcuts } from './sections';

export const SHORTCUT_ICONS: Readonly<Record<ShortcutId, IconName>> = {
  categories: 'grid-outline', queue: 'list-outline', issues: 'newspaper-outline', friends: 'people-outline',
  academy: 'school-outline', premium: 'diamond-outline', plaza: 'apps-outline', talked: 'trending-up-outline',
};

/** The tiles to draw: the admin's order and names over today's eight; hidden ones left out. */
export function shortcutTiles(saved: readonly { id: ShortcutId; label?: string; hidden?: boolean }[]): { id: ShortcutId; label: string; icon: IconName }[] {
  return orderedVisible(SHORTCUT_IDS, saved).map((x) => ({ id: x.id, label: x.row?.label ?? SHORTCUT_LABELS[x.id], icon: SHORTCUT_ICONS[x.id] }));
}

export function DiscoverShortcuts(props: { onCategories: () => void; onPremium: () => void }): React.ReactElement | null {
  const router = useRouter();
  const config = useAppConfig();
  const go: Record<ShortcutId, () => void> = {
    categories: props.onCategories,
    queue: () => router.push("/queue"),
    issues: () => router.push("/issues"),
    friends: () => router.push("/friends-listening"),
    academy: () => router.push("/academy"),
    premium: props.onPremium,
    plaza: () => router.push("/plaza"),
    talked: () => router.push("/chart"),
  };
  const tiles = shortcutTiles(config.shortcuts);
  if (tiles.length === 0) return null;
  return <Shortcuts items={tiles.map((t) => ({ label: t.label, icon: t.icon, onPress: go[t.id] }))} />;
}
