// "Their likes" on Discover: recent likes with notes from people you follow, each opening its like post.
/**
 * M21 US7 (T084, FR-061). The newest likes from people the listener follows (the M19 timeline:
 * public likes only, no blocks, no hidden shows), as swipeable cards: the face, the note, the
 * episode. A card opens the like post (`/like/[owner]/[episode]`, OUR OWN DESIGN, owner
 * 2026-10-06). Signed out, or nothing liked → no section.
 *
 * M31 D-C (design-pulse2 `home--fold-a`, "Their likes"): a Deck under the edge label "Their likes" (the owner's rename of the section
 * is the label), cards 230 x 150 — a face 26 and "Rui liked" (Geist 600 13), the note in Unbounded 15 / 21 (the `UNBOUNDED[15]` step,
 * quoted), and at the foot the cover 34 (radius 8) with the episode in text2 13 / 500. "All likes" was the section title's link; it is
 * the deck's last card as drawn ("Card · last card of the deck 'All likes'"). Not as drawn: a like with no note shows the episode only
 * (the drawing's two cards both carry a note); the title's one-line cut is two lines here so a long title is not lost.
 */
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, spacing } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Avatar } from '@/ui/kit/Avatar';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { ME_TYPE } from '@/ui/me/measures';
import { useProfileApi, type LikeItem } from '@/social/profile-api';
import { DECK, UNBOUNDED, Deck, DeckCard, DeckSection, useEdge } from './Deck';

/** Drawn: cards 230 x 150, the face 26, the cover 34 (radius 8). */
export const LIKE_CARD = { width: 230, height: 150, face: 26, cover: 34, coverRadius: 8 } as const;
/** At most this many cards on Discover; "All likes" opens the full timeline. */
const SHOWN = 8;
const BODY_GAP = 8;

export function openLikePost(item: LikeItem): void {
  if (!item.listener) return;
  router.push({ pathname: '/like/[owner]/[episode]', params: { owner: item.listener.id, episode: item.episode.id } });
}

export function TheirLikes(props: { signedIn: boolean }): React.ReactElement | null {
  const api = useProfileApi();
  const edge = useEdge('Their likes', 'Their likes');
  const [items, setItems] = useState<LikeItem[]>([]);
  // Signing out clears the cards at once.
  if (!props.signedIn && items.length > 0) setItems([]);
  useEffect(() => {
    if (!props.signedIn) return;
    // A8: a late answer must not land after sign-out, a change of user or unmount.
    let live = true;
    api.likesTimeline().then((p) => { if (live) setItems(p.items.slice(0, SHOWN)); }, () => { /* no section */ });
    return () => { live = false; };
  }, [api, props.signedIn]);
  if (items.length === 0) return null;
  const shown = items.filter((it): it is LikeItem & { listener: NonNullable<LikeItem['listener']> } => it.listener !== undefined);
  return (
    <DeckSection label={edge.label} spoken={edge.spoken}>
      <Deck width={LIKE_CARD.width} height={LIKE_CARD.height}>
        {[
          ...shown.map((it) => {
            return (
              <DeckCard key={`${it.listener.id}|${it.episode.id}|${it.createdAt}`}>
                <Pressable onPress={() => openLikePost(it)} accessibilityRole="button" accessibilityLabel={`${it.listener.displayName} liked ${it.episode.title}${it.note ? `: ${it.note}` : ''}`} className="flex-1" style={{ padding: DECK.pad, gap: BODY_GAP }}>
                  <Box className="flex-row items-center" style={{ gap: spacing.gap }}>
                    <Avatar size={LIKE_CARD.face} url={it.listener.avatarUrl} name={it.listener.displayName} />
                    <Type step="compact" className="flex-1 text-text" style={ME_TYPE.name13} numberOfLines={1}>{`${it.listener.displayName} liked`}</Type>
                  </Box>
                  {it.note ? <Type step="lede" className="text-text font-bold" style={UNBOUNDED[15]} numberOfLines={3}>{`“${it.note}”`}</Type> : null}
                  <Box className="flex-row items-center mt-auto" style={{ gap: DECK.gap }}>
                    <Box testID="like-card-cover" style={{ width: LIKE_CARD.cover, height: LIKE_CARD.cover, borderRadius: LIKE_CARD.coverRadius, overflow: 'hidden' }}>
                      <Artwork url={it.episode.imageUrl} size={LIKE_CARD.cover} name={it.episode.showTitle} />
                    </Box>
                    <Type step="caption" className="flex-1 text-text2 font-medium" numberOfLines={2}>{it.episode.title}</Type>
                  </Box>
                </Pressable>
              </DeckCard>
            );
          }),
          <DeckCard key="all-likes">
            <Pressable onPress={() => router.push('/likes')} accessibilityRole="link" accessibilityLabel="All likes" className="flex-1 items-center justify-center" style={{ padding: DECK.pad, gap: spacing.row }}>
              <Icon name="heart" size={24} color={colour.hotText} />
              <Type step="lede" className="text-text font-bold" style={UNBOUNDED[15]}>All likes ›</Type>
            </Pressable>
          </DeckCard>,
        ]}
      </Deck>
    </DeckSection>
  );
}
