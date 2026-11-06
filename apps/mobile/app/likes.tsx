// Likes: episodes people you follow liked, newest first, one card each; tap a card to open the like, the circle to play.
/**
 * M19 T031 (US3, FR-021): the Likes timeline — likes from accounts you follow (only those whose
 * likes are public; never someone you blocked or a show you hid), 20 a page, newest first. From Me.
 *
 * Words as drawn (design-pulse2 `listen.html` `likes--screen`, `--signed-out`, `--empty`, `--loading`, `--error`): the friend's avatar with their name and "liked · when" (the
 * head opens their profile), over the episode (cover 52, title, show, a 34 play circle) and their note in italics. Tapping the card opens the like
 * (`/like/[owner]/[episode]`); the circle plays. Loading is breathing ghost rows; a failure is the grey-glow empty block with Retry; signed out, a light Sign in.
 *
 * Spec 039 (Feed lane, design B): a `FeedPage`; each like is ONE card (the friend's avatar, name and "liked · when" on the head row, which opens their
 * profile; the episode strip, which opens the like; the 34 play circle; their note). A failed load is an `InlineNotice` with Retry; signed out and
 * none yet are empty blocks.
 *
 * Not as drawn: the reaction and comment counts under a card are not here (`/v1/me/likes` sends none).
 */
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Link } from '@/design/tailwind';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { spacing } from '@/design';
import { useSocial } from '@/social/context';
import { useProfileApi, type LikeItem } from '@/social/profile-api';
import { useCardActions } from '@/discover/useDiscover';
import { Artwork } from '@/ui/kit/Artwork';
import { Avatar } from '@/ui/kit/Avatar';
import { EndOfList } from '@/ui/kit/EndOfList';
import { Loader } from '@/ui/kit/Loader';
import { Type } from '@/ui/kit/Type';
import { InlineNotice } from '@/ui/kit/layout';
import { ageLabel, LIST, PlayDot } from '@/ui/me/lists';
import { FeedEmpty, FeedLoading, FeedPage } from '@/ui/feed/FeedPage';
import { ItemCard } from '@/ui/notifications/cards';
import { nowMs as clockMs } from '@/ui/kit/clock';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: LikeItem[]; next?: string };

const AVATAR = 36;

export default function LikesScreen(): React.ReactElement {
  const { listener } = useSocial();
  const profileApi = useProfileApi();
  const { play } = useCardActions();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [paging, setPaging] = useState(false);
  const load = useCallback(() => {
    if (!listener) return;
    profileApi.likesTimeline().then((p) => setState({ kind: 'ok', items: p.items, ...(p.next ? { next: p.next } : {}) })).catch(() => setState((s) => (s.kind === 'ok' ? s : { kind: 'error' })));
  }, [listener, profileApi]);
  useFocusEffect(load);
  const more = () => {
    if (state.kind !== 'ok' || !state.next || paging) return;
    setPaging(true);
    profileApi.likesTimeline(state.next)
      .then((p) => setState({ kind: 'ok', items: [...state.items, ...p.items], ...(p.next ? { next: p.next } : {}) }))
      .catch(() => undefined)
      .finally(() => setPaging(false));
  };
  const nowMs = clockMs();
  const items = listener && state.kind === 'ok' ? state.items : [];
  return (
    <FeedPage
      title="Likes"
      subtitle="Episodes people you follow liked"
      data={items}
      keyExtractor={(l) => `${l.listener?.id ?? ''}|${l.episode.id}|${l.createdAt}`}
      contentStyle={{ flexGrow: 1 }}
      gap={spacing.row}
      ListHeaderComponent={listener && state.kind === 'error' ? (
        <InlineNotice text="Couldn't load likes right now." actionLabel="Retry" onAction={() => { setState({ kind: 'loading' }); load(); }} />
      ) : null}
      ListEmptyComponent={!listener
        ? <FeedEmpty title="Likes" line="Sign in to see what people you follow like." action={{ label: 'Sign in', onPress: () => router.push('/auth/sign-in') }} />
        : state.kind === 'loading' ? <FeedLoading testID="likes-loading" rows={6} />
        : state.kind === 'error' ? undefined
        : <FeedEmpty title="No likes yet" line="No likes yet from people you follow." />}
      ListFooterComponent={items.length > 0 ? (state.kind === 'ok' && state.next ? <Box className="items-center py-row"><Loader /></Box> : <EndOfList />) : undefined}
      onEndReached={more}
      renderItem={({ item }) => {
        const who = item.listener;
        const when = ageLabel(Date.parse(item.createdAt), nowMs);
        const head = (
          <Box className="flex-row items-center" style={{ gap: spacing.row - 2 }}>
            <Avatar size={AVATAR} url={who?.avatarUrl} name={who?.displayName} />
            <Type step="strong" className="text-text font-bold flex-shrink" numberOfLines={1}>{who?.displayName ?? 'Someone'}</Type>
            <Type step="strong" className="text-text2 font-normal flex-1" numberOfLines={1}>{`liked · ${when}`}</Type>
          </Box>
        );
        return (
          <ItemCard testID="like-card">
            {who ? (
              <Link href={{ pathname: '/profile/[id]', params: { id: who.id } }} asChild>
                <Pressable accessibilityRole="link" accessibilityLabel={`${who.displayName} liked this, ${when}`} hitSlop={{ top: 8, bottom: 8 }}>{head}</Pressable>
              </Link>
            ) : head}
            <Box className="flex-row items-center" style={{ gap: spacing.row - 2 }}>
              <Pressable
                onPress={() => (who ? router.push({ pathname: '/like/[owner]/[episode]', params: { owner: who.id, episode: item.episode.id } }) : undefined)}
                accessibilityRole="button"
                accessibilityLabel={`${item.episode.title}, ${item.episode.showTitle}`}
                className="flex-1 flex-row items-center"
                style={{ gap: spacing.row - 2 }}
              >
                <Artwork url={item.episode.imageUrl} size={LIST.likeCover} name={item.episode.showTitle} />
                <Box className="flex-1 min-w-0">
                  <Type step="compact" className="text-text" numberOfLines={2}>{item.episode.title}</Type>
                  <Type step="caption" className="text-text2" style={{ marginTop: spacing.hair }} numberOfLines={1}>{item.episode.showTitle}</Type>
                </Box>
              </Pressable>
              <Pressable onPress={() => void play(item.episode)} accessibilityRole="button" accessibilityLabel={`Play ${item.episode.title}`} hitSlop={7}>
                <PlayDot size={LIST.playDot} />
              </Pressable>
            </Box>
            {item.note ? <Type step="quote" className="text-quote italic">{`“${item.note}”`}</Type> : null}
          </ItemCard>
        );
      }}
    />
  );
}
