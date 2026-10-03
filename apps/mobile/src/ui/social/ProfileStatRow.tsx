// A profile's numbers in one row: following, followers, shows, listening time.
/**
 * A profile's numbers in one row (M12 FR-064): following, followers, subscriptions (your own
 * profile only — nobody else's subscriptions are ever sent, M8 FR-004) and listening time.
 * Each cell is the same width; a cell with `href` is a link, the others are plain text.
 *
 * M17 (`Profile-B`): each number is its own white card with a thin border, the value a 24 pt
 * serif, 8 pt apart. Links, names and the cells themselves are unchanged.
 */
import { Link } from '@/design/tailwind';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { tabular } from '@/design';

const CELL = 'flex-1 items-center justify-center min-h-12 bg-surface border border-border rounded-row py-row px-1.5';

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
  return (
    <Box className="flex-row gap-gap">
      {props.cells.map((cell) => {
        const body = (
          <>
            <Text className="text-text text-lg font-display" style={tabular} numberOfLines={1}>{cell.value}</Text>
            <Text className="text-muted text-xs" numberOfLines={1}>{cell.label}</Text>
          </>
        );
        return cell.href ? (
          <Link key={cell.key} href={cell.href as never} asChild>
            <Pressable accessibilityRole="link" accessibilityLabel={cell.spoken} className={CELL}>{body}</Pressable>
          </Link>
        ) : (
          <Box key={cell.key} className={CELL} accessible accessibilityLabel={cell.spoken}>{body}</Box>
        );
      })}
    </Box>
  );
}
