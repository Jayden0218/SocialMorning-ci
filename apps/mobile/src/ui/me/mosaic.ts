// The Me tab's grid and panel measures, from the drawing.
/**
 * M31 T033 (design-pulse2 `me--screen`, discover.html `mosaic`, `tile`): the same mosaic as Discover's —
 * two columns, rows 84, 10 between, tile radius 22, padding 14 — with a 28 lane on the left for the
 * edge label and 16 on the right. A tile is `minHeight` 84 (the drawing's row), so large text grows
 * it instead of cutting its words. The Panel under the mosaic is one rounded group (22) of 56 rows.
 */
import { radius, spacing } from '@/design';

export const ME_MOSAIC = { row: 84, gap: 10, radius: radius.artworkLarge, pad: 14, lane: 28, right: spacing.section, panelRow: 56, panelPad: spacing.section, rowGap: spacing.row } as const;

/** A tile that spans two rows: two 84 rows and the gap between. */
export const TALL_TILE = ME_MOSAIC.row * 2 + ME_MOSAIC.gap;

/** Two equal columns whatever the words inside want (`minWidth: 0`, as Discover's `HALF`). */
export const HALF = { flex: 1, minWidth: 0 } as const;
