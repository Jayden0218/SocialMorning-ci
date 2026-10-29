// One liked episode: who liked it, their note as a quote, and the episode row to open or play.
/**
 * M19 T031 (US3): a like as a card. On the Likes timeline it heads with the person (photo or letters, name, how long
 * ago) — tapping it opens their profile; on a profile the person is already known, so only the episode and the note show.
 *
 * M31 W4-A (T050; design-pulse2 social.html `likeCard`, `profile-likes--screen`): a raise card (radius 18, padding 12, 8 between parts):
 * the episode as a row — cover 44, title Geist 600 14/18, the show in mono 11 text3, a light Play circle 36 — then the note in
 * quotes (14/20 text2) and, last, "liked this, 2d" in hot-text 12 with a filled heart 14. The row opens the episode, the circle
 * plays it. With a person (the timeline) their avatar 24 and name head the card in place of "liked this".
 */
import { Link } from '@/design/tailwind';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import type { EpisodeCard } from '@/social/api';
import type { LikeItem } from '@/social/profile-api';
import { Artwork } from '@/ui/kit/Artwork';
import { Avatar } from '@/ui/kit/Avatar';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { NameText } from '@/ui/profile/parts';
import { LIST, PlayDot, ThreadCard, ageLabel } from '@/ui/me/lists';
import { ME_TYPE } from '@/ui/me/measures';

const HEART = 14;
const PERSON = 24;

export function LikeCard(props: { item: LikeItem; onOpen: (card: EpisodeCard) => void; onPlay: (card: EpisodeCard) => void; now?: string }): React.ReactElement {
  const { item } = props;
  const who = item.listener;
  const when = ageLabel(Date.parse(item.createdAt), props.now ? Date.parse(props.now) : Date.now());
  return (
    <ThreadCard testID="like-card">
      {who ? (
        <Link href={{ pathname: '/profile/[id]', params: { id: who.id } }} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={`${who.displayName} liked this, ${when}`} className="flex-row items-center" style={{ gap: LIST.headGap }} hitSlop={{ top: 12, bottom: 12 }}>
            <Avatar size={PERSON} url={who.avatarUrl} name={who.displayName} />
            <NameText step="compact" layout="flex-1" numberOfLines={1}>{who.displayName}</NameText>
            <Type step="tag" className="text-text3" style={ME_TYPE.mono11}>{when}</Type>
          </Pressable>
        </Link>
      ) : null}
      <Box className="flex-row items-center" style={{ gap: LIST.headGap }}>
        <Pressable onPress={() => props.onOpen(item.episode)} accessibilityRole="button" accessibilityLabel={`${item.episode.title}, ${item.episode.showTitle}`} className="flex-1 flex-row items-center" style={{ gap: LIST.headGap }}>
          <Artwork url={item.episode.imageUrl} size={LIST.cover} name={item.episode.showTitle} />
          <Box className="flex-1 min-w-0">
            <Type step="compact" className="text-text" numberOfLines={2}>{item.episode.title}</Type>
            <Type step="tag" className="text-text3" style={ME_TYPE.mono11} numberOfLines={1}>{item.episode.showTitle}</Type>
          </Box>
        </Pressable>
        <Pressable onPress={() => props.onPlay(item.episode)} accessibilityRole="button" accessibilityLabel={`Play ${item.episode.title}`} hitSlop={7}>
          <PlayDot size={36} />
        </Pressable>
      </Box>
      {item.note ? <Type step="quote" className="text-text2">{`“${item.note}”`}</Type> : null}
      {who ? null : (
        <Box className="flex-row items-center" style={{ gap: 6 }} accessible accessibilityLabel={`Liked this, ${when}`}>
          <Icon name="heart" size={HEART} color={colour.hotText} />
          <Type step="chip" className="text-hotText font-medium">{`liked this, ${when}`}</Type>
        </Box>
      )}
    </ThreadCard>
  );
}
