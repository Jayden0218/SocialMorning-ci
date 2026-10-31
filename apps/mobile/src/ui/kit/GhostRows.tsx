// Grey placeholder rows that breathe where a page's rows will be.
/**
 * M31 W6-C (design-pulse2 kit.js `PK.ghost`, `states--loading-page`): rows in the `raise2` colour, 12 apart —
 * every third one a 64 tall tile (radius 18), the others 14 tall lines (radius 7) at 100 / 70 / 88 / 100 / 60 %
 * of the width — at 55 % strength, breathing. Shown behind the page loader after the first second.
 */
import { Box } from '@/ui/lib/box';
import { Breathe } from './Breathe';

const WIDTHS = ['100%', '70%', '88%', '100%', '60%'] as const;
const TILE = { height: 64, borderRadius: 18 };
const LINE = { height: 14, borderRadius: 7 };

export function GhostRows(props: { rows?: number; className?: string }): React.ReactElement {
  const n = props.rows ?? 5;
  return (
    <Breathe className={props.className}>
      <Box testID="ghost-rows" className="gap-row" style={{ opacity: 0.55 }} accessible={false} importantForAccessibility="no-hide-descendants">
        {Array.from({ length: n }, (_, k) => (
          <Box key={k} testID="ghost-row" className="bg-raise2" style={[k % 3 === 0 ? TILE : LINE, { width: WIDTHS[k % WIDTHS.length] }]} />
        ))}
      </Box>
    </Breathe>
  );
}
