// The 84-high tile measures Search still draws (`MOSAIC`) and the shape of a Discover shortcut tile.
/**
 * Spec 039 (verifier fix): the Discover mosaic component (today's pick, Hot now, the shortcut tiles, its 28 lane) is gone: Discover is a `Page` of
 * sections (`DiscoverPage`), and no page imports the tiles. What stays is what other files read: `MOSAIC` (row 84, gap 10, radius, padding: Search's
 * result tiles) and `ShortcutTile` (the shape `useShortcutTiles` returns).
 */
import { radius } from '@/design';
import type { IconName } from '@/ui/kit/Icon';

/** Row height, gap and tile radius of the 84-high tile grid. */
export const MOSAIC = { row: 84, gap: 10, radius: radius.card - 2, pad: 14 } as const;

export type ShortcutTile = { label: string; icon: IconName; onPress: () => void; /** Premium is drawn in its own solid violet-brown. */ tinted?: boolean; /** Queue: how many are in it, drawn after the label in mono. */ count?: number };
