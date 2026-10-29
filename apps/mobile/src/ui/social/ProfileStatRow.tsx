// A profile's numbers in one row: following, followers, shows, listening time.
/**
 * A profile's numbers in one row (M12 FR-064): following, followers, subscriptions (your own
 * profile only — nobody else's subscriptions are ever sent, M8 FR-004) and listening time.
 * Each cell is the same width; a cell with `href` is a link, the others are plain text.
 *
 * M17 (`Profile-B`): each number is its own white card with a thin border, the value a 24 pt
 * serif, 8 pt apart. Links, names and the cells themselves are unchanged.
 *
 * M31 W4-A (T050; design-pulse2 social.html `statTile`, `profile--screen` "Numbers"): the cells are 1 x 1 mosaic tiles, two to a row, 10
 * apart — raise, radius 22, padding 14, at least 84 tall; the value in Unbounded 800 24, the label 12 in text2 at the foot, and a "›" at the
 * foot's end when the cell opens a list. A cell with no link (Listened on someone else's profile) is plain text with no arrow.
 */
import { Link } from '@/design/tailwind';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Type } from '@/ui/kit/Type';
import { ME_MOSAIC, HALF } from '@/ui/me/mosaic';
import { ME_TYPE } from '@/ui/me/measures';

const TILE = { minHeight: ME_MOSAIC.row, padding: ME_MOSAIC.pad, borderRadius: ME_MOSAIC.radius } as const;

export type StatCell = { key: string; value: string; label: string; spoken: string; href?: string | { pathname: string; params: Record<string, string> } };

/** "12 h", "45 min", or "—" when the listening is private. */
export function listenedLabel(ms: number | undefined): { value: string; spoken: string } {
  if (ms === undefined) return { value: '—', spoken: 'Listening time is private' };
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return { value: `${h} h`, spoken: `${h} ${h === 1 ? 'hour' : 'hours'} listened` };
  const m = Math.floor(ms / 60_000);
  return { value: `${m} min`, spoken: `${m} ${m === 1 ? 'minute' : 'minutes'} listened` };
}

export function ProfileStatRow(props: { cells: StatCell[] }): React.ReactElement {
  const rows: StatCell[][] = [];
  for (let i = 0; i < props.cells.length; i += 2) rows.push(props.cells.slice(i, i + 2));
  return (
    <Box style={{ gap: ME_MOSAIC.gap }} testID="stat-tiles">
      {rows.map((row) => (
        <Box key={row.map((c) => c.key).join('+')} className="flex-row" style={{ gap: ME_MOSAIC.gap }}>
          {row.map((cell) => {
            const body = (
              <Box className="bg-raise justify-between" style={{ ...TILE, flex: 1 }} testID="stat-tile">
                <Type step="figure" className="text-text" style={ME_TYPE.rank24} numberOfLines={1}>{cell.value}</Type>
                <Box className="flex-row items-center justify-between">
                  <Type step="caption" className="text-text2" numberOfLines={1}>{cell.label}</Type>
                  {cell.href ? <Type step="caption" className="text-text2" accessible={false}>›</Type> : null}
                </Box>
              </Box>
            );
            return cell.href ? (
              <Link key={cell.key} href={cell.href as never} asChild>
                <Pressable accessibilityRole="link" accessibilityLabel={cell.spoken} style={HALF}>{body}</Pressable>
              </Link>
            ) : (
              <Box key={cell.key} accessible accessibilityLabel={cell.spoken} style={HALF}>{body}</Box>
            );
          })}
          {row.length === 1 ? <Box style={HALF} accessible={false} /> : null}
        </Box>
      ))}
    </Box>
  );
}
