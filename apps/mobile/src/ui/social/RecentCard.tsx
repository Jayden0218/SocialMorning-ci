// One of a person's recent public actions on their profile: a white card with the show's cover.
/**
 * M24 US20 (`Profile-B`): someone else's "Recent" rows are white cards (16 pt corners, 12 pt
 * padding): the 52 pt show cover, a small muted line "Mira commented at 42:15 · Oct 1", the
 * episode's title in the serif and the show's name. The tap and the spoken sentence are the ones
 * `FeedItem` had (`describe`), so a screen reader hears the same thing as before.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import type { FeedItem as Item } from '@/social/api';
import { Artwork } from '@/ui/kit/Artwork';
import { mmss } from '@/ui/kit/format';
import { hit } from '@/design';
import { describe } from './FeedItem';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ROW = { minHeight: hit.min };

/** "Oct 1" from an ISO time; anything unreadable gives "". */
export function monthDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Mira commented at 42:15 · Oct 1" — who, what, where in the episode, and the day. */
export function recentLine(item: Item): string {
  const name = item.actor.displayName ?? 'Deleted account';
  const at = item.momentMs !== null ? ` at ${mmss(item.momentMs)}` : '';
  const what = item.kind === 'listened' ? 'listened' : item.kind === 'clipped' ? `clipped${at}` : `commented${at}`;
  const day = monthDay(item.createdAt);
  return `${name} ${what}${day ? ` · ${day}` : ''}`;
}

export function RecentCard(props: { item: Item; onOpen: (item: Item) => void }): React.ReactElement {
  const { item } = props;
  return (
    <Pressable
      onPress={() => props.onOpen(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.actor.displayName ?? 'Someone'} ${describe(item)}`}
      className="flex-row gap-row items-center bg-surface border border-border rounded-row p-row"
      style={ROW}
    >
      <Artwork url={item.episode.imageUrl} size={52} name={item.episode.showTitle ?? undefined} />
      <Box className="flex-1 gap-0.5 min-w-0">
        <Text className="text-muted text-xs" numberOfLines={1}>{recentLine(item)}</Text>
        <Text className="text-text text-sm font-display" numberOfLines={2}>{item.episode.title}</Text>
        {item.episode.showTitle ? <Text className="text-muted text-xs" numberOfLines={1}>{item.episode.showTitle}</Text> : null}
      </Box>
    </Pressable>
  );
}
