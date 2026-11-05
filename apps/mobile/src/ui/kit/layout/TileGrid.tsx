// Tiles in two equal columns, 12 apart.
/** Spec 039 (D3): rows of two flex-1 cells; an odd last tile gets an empty cell so it keeps the same width as the others. */
import { Children } from 'react';
import { Box } from '@/ui/lib/box';
import { spacing } from '@/design';

const GAP = { gap: spacing.row };
const ROW = { flexDirection: 'row', gap: spacing.row } as const;
const CELL = { flex: 1 };

export function TileGrid(props: { children?: React.ReactNode }): React.ReactElement {
  const tiles = Children.toArray(props.children);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push([tiles[i], tiles[i + 1]]);
  return (
    <Box testID="tile-grid" style={GAP}>
      {rows.map((pair, r) => (
        <Box key={r} testID="tile-row" style={ROW}>
          {pair.map((tile, c) => <Box key={c} testID="tile-cell" style={CELL}>{tile}</Box>)}
        </Box>
      ))}
    </Box>
  );
}
