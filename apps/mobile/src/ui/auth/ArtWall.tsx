// The wall of drawn tiles behind the sign-in page.
/**
 * M31 S-C (T061; design-pulse2 `settings.html` `signInPage`, entry `auth-sign-in--screen`, layout Stage): the top 430 of the page is a wall
 * of twelve tiles, three columns wide, rows of 96 and 8 between, each 18 round; every fifth tile (the first, sixth, eleventh)
 * spans two rows. It sits 12 from each side, 6 under the status bar, at 90 %, and fades to the page colour from 250 to 490
 * under the status bar. It was a row of words-only tiles that moved (owner, 2026-10-04: no show covers — there is no permission
 * to show other people's artwork); it still shows none: the tiles are painted here, two colours and a disc or two, and the wall
 * is still. Nothing loads, so the page is whole at once (`onReady` fires once, straight away).
 *
 * Not as drawn: CSS repeating, edge-centred and conic gradients have no React Native equivalent, so a tile is the nearest
 * two-stop gradient plus its discs, in the drawing's colours (`WALL_PAINTS`).
 */
import { useContext, useEffect, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Box } from '@/ui/lib/box';
import { LinearGradient } from '@/design/tailwind';
import { WALL_ORDER, WALL_PAINTS, colour, type WallPaint } from '@/design/tokens';
import { AUTH } from './measures';

export type WallTile = { key: keyof typeof WALL_PAINTS; column: number; row: number; rows: number };

/** Pure: where each tile of `order` goes — row-major, first free cell, every fifth tile two rows tall (CSS `grid-row: span 2`). */
export function wallLayout(order: readonly (keyof typeof WALL_PAINTS)[] = WALL_ORDER, columns: number = AUTH.wall.columns): WallTile[] {
  const taken = new Set<string>();
  return order.map((key, i) => {
    const rows = i % 5 === 0 ? 2 : 1;
    for (let r = 0; ; r++) {
      for (let c = 0; c < columns; c++) {
        const free = Array.from({ length: rows }, (_, k) => !taken.has(`${r + k},${c}`)).every(Boolean);
        if (!free) continue;
        for (let k = 0; k < rows; k++) taken.add(`${r + k},${c}`);
        return { key, column: c, row: r, rows };
      }
    }
  });
}

/** Pure: the gradient's start and end (0 to 1 across the tile) for a CSS angle, 180 being top to bottom. */
export function paintPoints(angle: number): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const a = (angle * Math.PI) / 180;
  const dx = Math.sin(a) / 2;
  const dy = -Math.cos(a) / 2;
  return { start: { x: 0.5 - dx, y: 0.5 - dy }, end: { x: 0.5 + dx, y: 0.5 + dy } };
}

function Tile(props: { paint: WallPaint; width: number; height: number; left: number; top: number }): React.ReactElement {
  const { paint: p } = props;
  const { start, end } = paintPoints(p.angle);
  return (
    <Box testID="wall-tile" className="absolute overflow-hidden" style={{ left: props.left, top: props.top, width: props.width, height: props.height, borderRadius: AUTH.wall.radius }}>
      <LinearGradient colors={[p.from, p.to]} start={start} end={end} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      {p.discs.map((d, i) => (
        <Box key={i} className="absolute" style={{ left: d.x * props.width - d.r * props.width, top: d.y * props.height - d.r * props.width, width: d.r * 2 * props.width, height: d.r * 2 * props.width, borderRadius: d.r * props.width, backgroundColor: d.colour }} />
      ))}
    </Box>
  );
}

/** `onReady` fires once, as soon as the wall is drawn, so the page appears whole (owner, 2026-09-27). */
export function ArtWall(props: { onReady?: () => void }): React.ReactElement {
  const { width } = useWindowDimensions();
  const top = (useContext(SafeAreaInsetsContext)?.top ?? 0) + AUTH.wall.below;
  const ready = useRef(props.onReady);
  ready.current = props.onReady;
  const fired = useRef(false);
  useEffect(() => { if (!fired.current) { fired.current = true; ready.current?.(); } }, []);
  const column = (width - AUTH.wall.side * 2 - AUTH.wall.gap * (AUTH.wall.columns - 1)) / AUTH.wall.columns;
  const tiles = wallLayout();
  return (
    <Box
      testID="art-wall"
      className="absolute overflow-hidden"
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ left: AUTH.wall.side, right: AUTH.wall.side, top, height: AUTH.wall.height, opacity: AUTH.wall.opacity }}
    >
      {tiles.map((t, i) => (
        <Tile
          key={i}
          paint={WALL_PAINTS[t.key]}
          width={column}
          height={t.rows * AUTH.wall.row + (t.rows - 1) * AUTH.wall.gap}
          left={t.column * (column + AUTH.wall.gap)}
          top={t.row * (AUTH.wall.row + AUTH.wall.gap)}
        />
      ))}
    </Box>
  );
}

/** The fade over the wall's foot: transparent to the page colour at 70 %, 240 tall, from 250 under the status bar. */
export function WallFade(): React.ReactElement {
  const top = (useContext(SafeAreaInsetsContext)?.top ?? 0) + AUTH.wallFade.belowStatus;
  return (
    <LinearGradient
      testID="wall-fade"
      colors={[colour.clear, colour.void, colour.void]}
      locations={[0, 0.7, 1]}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: 0, right: 0, top, height: AUTH.wallFade.height }}
    />
  );
}
