// The small parts the Discover inner pages share: the tile a page hands the Report, a genre's corner square, and the failed-load notice.
/**
 * M31 W5-D (T064; design-pulse2 `discover.html` `mosaic`, `tile`), restyled by spec 039 I2 (design B). The packed Mosaic (`packTiles`, `tileSize`, `columnWidth`,
 * `genreSpan`, `MosaicGrid`: two columns in the Me tab's 28 / 16 lane, rows of 84) had no page left drawing it once Categories, Charts and the Report moved onto
 * `TileGrid` and the page gutter, and is deleted with its tests. What stays:
 *
 *  - `TileSpec`: the shape a page hands to a tile list (the Report and the chart tiles type their tiles with it).
 *  - `CornerSquare`: the cover corner a genre's tile carries, a rounded square in the name's own cover colour, tucked past the corner.
 *  - `RetryTile`: the failed-load notice with Retry that a page shows in place of its content. It is the kit `InlineNotice` (raise, radius 16, a warn dot).
 */
import type { ReactNode } from 'react';
import { Box } from '@/ui/lib/box';
import { coverTone } from '@socialmorning/social-core';
import { radius, spacing } from '@/design';
import { InlineNotice } from '@/ui/kit/layout';

export type TileSpec = { key: string; w: 1 | 2; h: number; fill?: 'raise' | 'light' | 'hot' | 'premium'; node: ReactNode };

/** The cover corner a genre's tile carries: a rounded square in the name's own cover colour, 75 %, tucked 8 past the corner. */
export function CornerSquare(props: { name: string; size: number }): React.ReactElement {
  const tone = coverTone(props.name);
  return (
    <Box
      testID="corner-square"
      className="absolute"
      style={{ right: -spacing.gap, bottom: -spacing.gap, width: props.size, height: props.size, borderRadius: radius.row, backgroundColor: tone.fill, opacity: 0.75 }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    />
  );
}

/** The failed-load notice with Retry: the sentence and a 48 tall Retry (the kit `InlineNotice`). */
export function RetryTile(props: { line: string; onRetry: () => void }): React.ReactElement {
  return <InlineNotice text={props.line} actionLabel="Retry" onAction={props.onRetry} />;
}
