// One liked episode: who liked it, their note as a quote, and the episode row to open or play.
/**
 * M19 T031 (US3): a like as a white card. On the Likes timeline it heads with the person (photo
 * or letters, name, how long ago) — tapping it opens their profile; on a profile the person is
 * already known, so only the note and the episode show. The episode row is Discover's line.
 */
import { Link } from '@/design/tailwind';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import type { EpisodeCard } from '@/social/api';
import type { LikeItem } from '@/social/profile-api';
import { Avatar } from '@/ui/kit/Avatar';
import { Card } from '@/ui/kit/Card';
import { relativeTime } from '@/ui/kit/format';
import { EpisodeLine } from '@/ui/discover/parts';

const TAP = { minHeight: hit.min };

export function LikeCard(props: { item: LikeItem; onOpen: (card: EpisodeCard) => void; onPlay: (card: EpisodeCard) => void; now?: string }): React.ReactElement {
  const { item } = props;
  const who = item.listener;
  const when = relativeTime(item.createdAt, props.now ?? new Date().toISOString());
  return (
    <Card className="pt-row">
      {who ? (
        <Link href={{ pathname: '/profile/[id]', params: { id: who.id } }} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={`${who.displayName} liked this, ${when}`} className="flex-row items-center gap-row" style={TAP}>
            <Avatar size={36} url={who.avatarUrl} name={who.displayName} />
            <Text className="flex-1 text-text text-body font-bold" numberOfLines={1}>{who.displayName}</Text>
            <Text className="text-muted text-xs">{when}</Text>
          </Pressable>
        </Link>
      ) : (
        <Text className="text-muted text-xs">{`Liked ${when}`}</Text>
      )}
      {item.note ? <Text className="text-text text-base font-display mt-gap">{`“${item.note}”`}</Text> : null}
      <EpisodeLine card={item.episode} size={52} onOpen={() => props.onOpen(item.episode)} onPlay={() => props.onPlay(item.episode)} />
    </Card>
  );
}
