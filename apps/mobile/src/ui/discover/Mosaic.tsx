// The Mosaic of the inner pages: tiles of 1 or 2 columns and any number of rows, packed the way the drawing's grid packs them.
/**
 * M31 W5-D (T064; design-pulse2 `discover.html` `mosaic`, `tile`; layout pattern Mosaic). Two columns in the Me tab's lane
 * (28 left, 16 right), rows of 84, 10 between, a tile is radius 22 with the cover, the words or a colour inside. The drawing is a CSS grid
 * (`grid-template-columns: repeat(2, 1fr); grid-auto-rows: 84px`) whose items span `w` columns and `h` rows and are placed in
 * order, never going back to fill a hole (the default sparse flow). `packTiles` does that placement, so the Categories wall
 * (sizes by position) reads as drawn; `MosaicGrid` draws each tile at its place and is as tall as the last row ends.
 *
 * `RetryTile` is the failed-load tile with Retry that every page of this group shows in place of its content (`errTile`).
 */
import type { ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { coverTone } from '@socialmorning/social-core';
import { ErrTile } from '@/ui/chat/blocks';
import { PulseButton } from '@/ui/kit/PulseButton';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { PAGE } from './measures';

export type TileSpec = { key: string; w: 1 | 2; h: number; fill?: 'raise' | 'light' | 'hot' | 'premium'; node: ReactNode };
export type Placed = { col: number; row: number };

/** CSS grid's sparse auto-placement for items of `w` columns and `h` rows in `cols` columns. */
export function packTiles(items: readonly { w: number; h: number }[], cols = 2): { places: Placed[]; rows: number } {
  const taken = new Set<string>();
  const fits = (c: number, r: number, w: number, h: number): boolean => {
    if (c + w > cols) return false;
    for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) if (taken.has(`${c + dc}:${r + dr}`)) return false;
    return true;
  };
  let cursor = { col: 0, row: 0 };
  let rows = 0;
  const places: Placed[] = [];
  for (const it of items) {
    let { col, row } = cursor;
    while (!fits(col, row, it.w, it.h)) { col += 1; if (col >= cols) { col = 0; row += 1; } }
    for (let dr = 0; dr < it.h; dr++) for (let dc = 0; dc < it.w; dc++) taken.add(`${col + dc}:${row + dr}`);
    places.push({ col, row });
    cursor = { col, row };
    rows = Math.max(rows, row + it.h);
  }
  return { places, rows };
}

/** The Categories wall's pattern: tile k spans two columns when k is a multiple of 5 and two rows when it is a multiple of 3. */
export function genreSpan(k: number): { w: 1 | 2; h: number } {
  return { w: k % 5 === 0 ? 2 : 1, h: k % 3 === 0 ? 2 : 1 };
}

/** The pixel size of a tile `w` columns by `h` rows, with columns `col` wide. */
export function tileSize(col: number, w: number, h: number): { width: number; height: number } {
  return { width: w * col + (w - 1) * PAGE.gap, height: h * PAGE.row + (h - 1) * PAGE.gap };
}

/** The width of one column in a window: between the 28 lane and the 16 margin, 10 apart. */
export function columnWidth(windowWidth: number): number {
  return Math.floor((windowWidth - ME_MOSAIC.lane - ME_MOSAIC.right - PAGE.gap) / 2);
}

const FILL: Record<NonNullable<TileSpec['fill']>, string> = { raise: 'bg-raise', light: 'bg-text', hot: 'bg-hot', premium: 'bg-premiumTint' };

export function MosaicGrid(props: { tiles: readonly TileSpec[]; testID?: string }): React.ReactElement {
  const { width } = useWindowDimensions();
  const col = columnWidth(width);
  const { places, rows } = packTiles(props.tiles);
  const height = rows === 0 ? 0 : rows * PAGE.row + (rows - 1) * PAGE.gap;
  return (
    <Box testID={props.testID ?? 'mosaic'} style={{ marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right, height }}>
      {props.tiles.map((t, i) => {
        const at = places[i]!;
        const size = tileSize(col, t.w, t.h);
        return (
          <Box
            key={t.key}
            testID="mosaic-tile"
            className={`absolute overflow-hidden ${FILL[t.fill ?? 'raise']}`}
            style={{ left: at.col * (col + PAGE.gap), top: at.row * (PAGE.row + PAGE.gap), width: size.width, height: size.height, borderRadius: PAGE.radius }}
          >
            {t.node}
          </Box>
        );
      })}
    </Box>
  );
}

/** The cover corner a genre's tile carries: a rounded square in the name's own cover colour, 75 %, tucked 10 past the corner. */
export function CornerSquare(props: { name: string; size: number }): React.ReactElement {
  const tone = coverTone(props.name);
  return (
    <Box
      testID="corner-square"
      className="absolute"
      style={{ right: -PAGE.gap, bottom: -PAGE.gap, width: props.size, height: props.size, borderRadius: PAGE.radius, backgroundColor: tone.fill, opacity: 0.75 }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    />
  );
}

/** The error tile with Retry (`errTile`): the sentence, and the quiet 40 Retry pill under it. */
export function RetryTile(props: { line: string; onRetry: () => void }): React.ReactElement {
  return (
    <ErrTile line={props.line}>
      <PulseButton label="Retry" accessibilityLabel="Retry" kind="quiet" icon="repeat-outline" onPress={props.onRetry} height={40} className="self-start border border-line" />
    </ErrTile>
  );
}
