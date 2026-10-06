// "Their likes" on Discover: recent likes with notes from people you follow, each opening its like post.
/**
 * M21 US7 (T084, FR-061). The newest likes from people the listener follows (the M19 timeline:
 * public likes only, no blocks, no hidden shows), as swipeable cards: the face, the note, the
 * episode. A card opens the like post (`/like/[owner]/[episode]`, OUR OWN DESIGN, owner
 * 2026-10-06). Signed out, or nothing liked → no section.
 */
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Avatar } from '@/ui/kit/Avatar';
import { Card } from '@/ui/kit/Card';
import { useProfileApi, type LikeItem } from '@/social/profile-api';
import { Pager, SectionTitle } from './parts';

const TAP = { minHeight: hit.min };
/** At most this many cards on Discover; "All likes" opens the full timeline. */
const SHOWN = 8;

export function openLikePost(item: LikeItem): void {
  if (!item.listener) return;
  router.push({ pathname: '/like/[owner]/[episode]', params: { owner: item.listener.id, episode: item.episode.id } });
}

export function TheirLikes(props: { signedIn: boolean }): React.ReactElement | null {
  const api = useProfileApi();
  const [items, setItems] = useState<LikeItem[]>([]);
  useEffect(() => {
    if (!props.signedIn) { setItems([]); return; }
    api.likesTimeline().then((p) => setItems(p.items.slice(0, SHOWN)), () => { /* no section */ });
  }, [api, props.signedIn]);
  if (items.length === 0) return null;
  return (
    <Box>
      <SectionTitle title="Their likes" action={{ label: 'All likes', onPress: () => router.push('/likes') }} />
      <Pager count={items.length}>
        {(i) => {
          const it = items[i];
          if (!it || !it.listener) return null;
          return (
            <Pressable onPress={() => openLikePost(it)} accessibilityRole="button" accessibilityLabel={`${it.listener.displayName} liked ${it.episode.title}${it.note ? `: ${it.note}` : ''}`} style={TAP}>
              <Card className="py-row">
                <Box className="flex-row items-center gap-row">
                  <Avatar size={32} url={it.listener.avatarUrl} name={it.listener.displayName} />
                  <Text className="flex-1 text-text text-meta font-bold" numberOfLines={1}>{`${it.listener.displayName} liked`}</Text>
                </Box>
                {it.note ? <Text className="text-text text-body font-display-semibold mt-gap" numberOfLines={3}>{`“${it.note}”`}</Text> : null}
                <Box className="flex-row items-center gap-row mt-row">
                  <Artwork url={it.episode.imageUrl} size={44} name={it.episode.showTitle} />
                  <Box className="flex-1">
                    <Text className="text-text text-meta font-bold" numberOfLines={2}>{it.episode.title}</Text>
                    <Text className="text-muted text-xs" numberOfLines={1}>{it.episode.showTitle}</Text>
                  </Box>
                </Box>
              </Card>
            </Pressable>
          );
        }}
      </Pager>
    </Box>
  );
}
