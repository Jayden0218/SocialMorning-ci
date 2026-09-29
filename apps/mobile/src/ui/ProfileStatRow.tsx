/**
 * A profile's numbers in one row (M12 FR-064): following, followers, subscriptions (your own
 * profile only — nobody else's subscriptions are ever sent, M8 FR-004) and listening time.
 * Each cell is the same width; a cell with `href` is a link, the others are plain text.
 */
import { Link } from '../design/tailwind';
import { Pressable } from './lib/pressable';
import { Text } from './lib/text';
import { Box } from './lib/box';

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
    <Box className="flex-row mt-section">
      {props.cells.map((cell) => {
        const body = (
          <>
            <Text className="text-text text-lg font-bold" numberOfLines={1}>{cell.value}</Text>
            <Text className="text-muted text-xs" numberOfLines={1}>{cell.label}</Text>
          </>
        );
        return cell.href ? (
          <Link key={cell.key} href={cell.href as never} asChild>
            <Pressable accessibilityRole="link" accessibilityLabel={cell.spoken} className="flex-1 items-center justify-center min-h-12">{body}</Pressable>
          </Link>
        ) : (
          <Box key={cell.key} className="flex-1 items-center justify-center min-h-12" accessible accessibilityLabel={cell.spoken}>{body}</Box>
        );
      })}
    </Box>
  );
}
