// One activity row: who commented, clipped or listened, and on which episode.
/**
 * One Following item (M4 FR-008): who, what, which episode, at which moment; tapping opens the moment.
 *
 * M17 (`Following-B`): the Editorial row. `describe` (the spoken sentence) is unchanged.
 *
 * M31 W4-C (T052; design-pulse2 `social.html#notifications--people` `feedCard`): a card on the thread — raise, radius 18, padding 12,
 * 8 between its rows. Row 1: the person's avatar (28), "**Ana** commented at 14:32 on" in Geist 14 / 19 (the name is its own link to
 * the profile and stays bold), and the kind's mark (comment, clip, listen) in text3 at 16. Row 2: the episode's cover (28, radius 8),
 * its title in Geist 500 13 in text2, and the moment as a chip when there is one. `ThreadNode` (the page) hangs it on the spine with
 * the time as a tick. Not as drawn: the card carries no show name (the drawing has none either; the spoken name does).
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/kit/Text';
import { Link } from '@/design/tailwind';
import type { FeedItem as Item } from '@/social/api';
import { mmss } from '@/ui/kit/format';
import { Artwork } from '@/ui/kit/Artwork';
import { Avatar } from '@/ui/kit/Avatar';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { colour, typeStyle } from '@/design';
import { NOTIF, NotifCard } from '@/ui/notifications/parts';

export function describe(item: Item): string {
  const ep = item.episode.showTitle ? `${item.episode.title} (${item.episode.showTitle})` : item.episode.title;
  switch (item.kind) {
    case 'listened': return `listened to ${ep}`;
    case 'clipped': return `clipped ${item.momentMs !== null ? `${mmss(item.momentMs)} of ` : ''}${ep}`;
    case 'commented': return `commented${item.momentMs !== null ? ` at ${mmss(item.momentMs)}` : ''} on ${ep}`;
  }
}

/** The words between the name and the episode's title (the first line). */
function verb(item: Item): string {
  switch (item.kind) {
    case 'listened': return 'listened to';
    case 'clipped': return `clipped ${item.momentMs !== null ? `${mmss(item.momentMs)} of` : ''}`.trim();
    case 'commented': return `commented${item.momentMs !== null ? ` at ${mmss(item.momentMs)}` : ''} on`;
  }
}

const KIND_ICON: Record<Item['kind'], IconName> = { listened: 'headset-outline', clipped: 'cut-outline', commented: 'chatbubble-outline' };
const NAME_SLOP = { top: 12, bottom: 12, left: 4, right: 4 };

export function FeedItem(props: { item: Item; onOpen: (item: Item) => void; last?: boolean }): React.ReactElement {
  const { item } = props;
  const name = item.actor.displayName ?? 'Deleted account';
  return (
    <Pressable onPress={() => props.onOpen(item)} accessibilityRole="button" accessibilityLabel={`${item.actor.displayName ?? 'Someone'} ${describe(item)}`}>
      <NotifCard testID="feed-card">
        <Box className="flex-row items-center" style={{ gap: 8 }}>
          <Avatar size={NOTIF.feedAvatar} name={name} />
          <Box className="flex-1 flex-row flex-wrap items-center">
            <Link href={{ pathname: '/profile/[id]', params: { id: item.actor.id } }} asChild>
              <Pressable accessibilityRole="link" hitSlop={NAME_SLOP} className="flex-shrink min-w-0">
                {/* A name is not an action (owner's K1 note, 2026-09-25): weight tells it apart. */}
                <Text className="text-text font-bold text-pulse-note" style={typeStyle('note')} numberOfLines={1}>{item.actor.displayName ?? 'Deleted account'}</Text>
              </Pressable>
            </Link>
            <Type step="note" className="text-text">{` ${verb(item)}`}</Type>
          </Box>
          <Icon name={KIND_ICON[item.kind]} size={NOTIF.feedIcon} color={colour.text3} />
        </Box>
        <Box className="flex-row items-center" style={{ gap: 8 }}>
          <Artwork url={item.episode.imageUrl} size={NOTIF.feedCover} name={item.episode.title} />
          <Type step="caption" className="text-text2 flex-1" numberOfLines={2}>{item.episode.title}</Type>
          {item.momentMs !== null ? <Box><TimestampChip text={mmss(item.momentMs)} /></Box> : null}
        </Box>
      </NotifCard>
    </Pressable>
  );
}
