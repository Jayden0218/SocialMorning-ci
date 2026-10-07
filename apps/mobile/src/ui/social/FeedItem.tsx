// One activity row: who commented, clipped or listened, and on which episode.
/**
 * One Following item (M4 FR-008): who, what, which episode, at which moment; tapping opens the moment.
 *
 * M17 (`Following-B`): the Editorial row — a round initial on the left; then "Name verb" in a
 * small muted line (the name bold, still its own link to the profile), the episode's title in
 * serif, and "Show · time" under it; the kind's icon (comment, clip, listen) in the accent on the
 * right. Rows sit inside a card on Notifications; `last` drops the hairline under the final one.
 * `describe` (the spoken sentence) is unchanged.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Link } from '@/design/tailwind';
import type { FeedItem as Item } from '@/social/api';
import { mmss } from '@/ui/kit/format';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { hit } from '@/design';

export function describe(item: Item): string {
  const ep = item.episode.showTitle ? `${item.episode.title} (${item.episode.showTitle})` : item.episode.title;
  switch (item.kind) {
    case 'listened': return `listened to ${ep}`;
    case 'clipped': return `clipped ${item.momentMs !== null ? `${mmss(item.momentMs)} of ` : ''}${ep}`;
    case 'commented': return `commented${item.momentMs !== null ? ` at ${mmss(item.momentMs)}` : ''} on ${ep}`;
  }
}

/** The words between the name and the episode's title (`Following-B`'s first line). */
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
  const c = useColours(useStores().settings);
  const when = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const name = item.actor.displayName ?? 'Deleted account';
  return (
    <Pressable className={`flex-row gap-row py-row ${props.last ? '' : 'border-b-hairline border-separator'}`} style={{ minHeight: hit.min }} onPress={() => props.onOpen(item)} accessibilityRole="button" accessibilityLabel={`${item.actor.displayName ?? 'Someone'} ${describe(item)}`}>
      <Artwork url={null} size={36} rounded="pill" name={name} />
      <Box className="flex-1 gap-0.5">
        <Box className="flex-row flex-wrap items-center">
          <Link href={{ pathname: '/profile/[id]', params: { id: item.actor.id } }} asChild>
            <Pressable accessibilityRole="link" hitSlop={NAME_SLOP} className="flex-shrink min-w-0">
              {/* A name is not an action (owner's K1 note, 2026-09-25): weight tells it apart. */}
              <Text className="text-text text-meta font-bold" numberOfLines={1}>{item.actor.displayName ?? 'Deleted account'}</Text>
            </Pressable>
          </Link>
          <Text className="text-muted text-meta">{` ${verb(item)}`}</Text>
        </Box>
        <Text className="text-text text-sm font-display-semibold" numberOfLines={3}>{item.episode.title}</Text>
        <Text className="text-muted text-xs" numberOfLines={1}>{item.episode.showTitle ? `${item.episode.showTitle} · ${when}` : when}</Text>
      </Box>
      <Box className="pt-0.5">
        <Icon name={KIND_ICON[item.kind]} size={18} color={c.accent} />
      </Box>
    </Pressable>
  );
}
