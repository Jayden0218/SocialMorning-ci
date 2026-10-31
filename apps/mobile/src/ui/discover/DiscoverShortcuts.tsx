// The shortcut tiles of Discover's mosaic, in the order, names and set the admin chose.
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
 *
 * M31 L7 (owner: "the design I want completely same"): untouched, the eight now run in the order the drawing
 * has them — Friends listening, Categories, Queue, Issues, Premium, Academy, Plaza, Talked about (the first
 * two sit beside Hot now). "Untouched" is what the phone holds before the owner has saved anything in the
 * admin: the default list, no renamed tile, none hidden. Any order the admin has saved is kept as saved.
 * Queue carries how many episodes it holds (read when Home comes into view).
 *
 * M31 T025: the eight are 1 x 1 tiles of the Discover mosaic now (`DiscoverMosaic`), Premium tinted
 * (design-pulse2 `discover--screen`); `useShortcutTiles` hands the mosaic its tiles, each with the
 * same name and the same destination as before.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { orderedVisible, SHORTCUT_IDS, SHORTCUT_LABELS, type ShortcutId } from '@socialmorning/social-core';
import type { IconName } from '@/ui/kit/Icon';
import { useAppConfig } from '@/config/store';
import { useStores } from '@/ui/shell/providers';
import type { ShortcutTile } from './DiscoverMosaic';

export const SHORTCUT_ICONS: Readonly<Record<ShortcutId, IconName>> = {
  categories: 'grid-outline', queue: 'list-outline', issues: 'newspaper-outline', friends: 'people-outline',
  academy: 'school-outline', premium: 'diamond-outline', plaza: 'apps-outline', talked: 'trending-up-outline',
};

/** The order of the drawing (`discover--screen`): the first two sit beside Hot now. */
export const DRAWN_ORDER: readonly ShortcutId[] = ['friends', 'categories', 'queue', 'issues', 'premium', 'academy', 'plaza', 'talked'];

/** True when nothing has been saved: the default list as it ships, no new name, none hidden. */
export function untouched(saved: readonly { id: ShortcutId; label?: string; hidden?: boolean }[]): boolean {
  return saved.every((r, i) => r.id === SHORTCUT_IDS[i] && r.label === undefined && r.hidden !== true);
}

/** The tiles to draw: the admin's order and names over today's eight; hidden ones left out. Untouched, the drawn order. */
export function shortcutTiles(saved: readonly { id: ShortcutId; label?: string; hidden?: boolean }[]): { id: ShortcutId; label: string; icon: IconName }[] {
  return orderedVisible(untouched(saved) ? DRAWN_ORDER : SHORTCUT_IDS, untouched(saved) ? [] : saved).map((x) => ({ id: x.id, label: x.row?.label ?? SHORTCUT_LABELS[x.id], icon: SHORTCUT_ICONS[x.id] }));
}

export function useShortcutTiles(props: { onCategories: () => void; onPremium: () => void }): ShortcutTile[] {
  const router = useRouter();
  const config = useAppConfig();
  const stores = useStores();
  const [queued, setQueued] = useState<number>(() => stores.queue.list().length);
  useFocusEffect(useCallback(() => { setQueued(stores.queue.list().length); }, [stores]));
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
  return shortcutTiles(config.shortcuts).map((t) => ({ label: t.label, icon: t.icon, onPress: go[t.id], ...(t.id === 'premium' ? { tinted: true } : {}), ...(t.id === 'queue' && queued > 0 ? { count: queued } : {}) }));
}
