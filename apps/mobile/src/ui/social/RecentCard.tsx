// One of a person's recent public actions on their profile: a raise card with the show's cover.
/**
 * M24 US20 (`Profile-B`): someone else's "Recent" rows are white cards (16 pt corners, 12 pt
 * padding): the 52 pt show cover, a small muted line "Mira commented at 42:15 · Oct 1", the
 * episode's title in the serif and the show's name. The tap and the spoken sentence are the ones
 * `FeedItem` had (`describe`), so a screen reader hears the same thing as before.
 *
 * M31 W4-A (T050; design-pulse2 social.html `profile--screen`: "Recent (a Thread of what they did)"): the raise thread card (radius 18, padding 12) —
 * the cover 44, the line "Mira commented at 42:15 · Oct 1" in mono 11 text3, the episode's title in Geist 600 14/18, the show in text2.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import type { FeedItem as Item } from '@/social/api';
import { Artwork } from '@/ui/kit/Artwork';
import { mmss } from '@/ui/kit/format';
import { hit } from '@/design';
import { Type } from '@/ui/kit/Type';
import { LIST, ThreadCard } from '@/ui/me/lists';
import { ME_TYPE } from '@/ui/me/measures';
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
      style={ROW}
    >
      <ThreadCard testID="recent-card">
        <Box className="flex-row items-center" style={{ gap: LIST.headGap }}>
          <Artwork url={item.episode.imageUrl} size={LIST.cover} name={item.episode.showTitle ?? undefined} />
          <Box className="flex-1 min-w-0">
            <Type step="tag" className="text-text3" style={ME_TYPE.mono11} numberOfLines={1}>{recentLine(item)}</Type>
            <Type step="compact" className="text-text" numberOfLines={2}>{item.episode.title}</Type>
            {item.episode.showTitle ? <Type step="caption" className="text-text2" style={ME_TYPE.show11} numberOfLines={1}>{item.episode.showTitle}</Type> : null}
          </Box>
        </Box>
      </ThreadCard>
    </Pressable>
  );
}
