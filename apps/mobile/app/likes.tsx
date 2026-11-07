// Likes: episodes people you follow liked, newest first, on a spine; tap a card to open the like, the circle to play.
/**
 * M19 T031 (US3, FR-021): the Likes timeline — likes from accounts you follow (only those whose
 * likes are public; never someone you blocked or a show you hid), 20 a page, newest first. From Me.
 *
 * M31 W3-C (T041; design-pulse2 `listen.html` `likes--screen`, `--signed-out`, `--empty`, `--loading`, `--error`; layout
 * pattern Thread on time): each node is the friend's avatar (28, a void ring round it) on the spine with their name and
 * "liked · when" (the head opens their profile), over a raise card — the episode (cover 52, title, show, a 34 play circle),
 * their note in italics. Tapping the card opens the like (`/like/[owner]/[episode]`); the circle plays. Loading is a
 * grey spine and breathing ghost rows; a failure is the grey-glow empty block with Retry; signed out, a light Sign in.
 *
 * Not as drawn: the reaction and comment counts under a card are not here (`/v1/me/likes` sends none).
 */
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Link } from '@/design/tailwind';
import { FlatList } from '@/ui/lib/flat-list';
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
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { ME_TYPE } from '@/ui/me/measures';
import { ageLabel, DRAWN, emptyTop, EmptySpine, LIST, PageEmpty, PlayDot, ThreadCard, ThreadNode, ThreadSpine, threadPad } from '@/ui/me/lists';
import { GhostRows } from '@/ui/comments/Spine';
import { COMMENTS } from '@/ui/comments/measures';
import { nowMs as clockMs } from '@/ui/kit/clock';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: LikeItem[]; next?: string };

/** The avatar's ring: 28 inside a 2 void ring, so it sits cleanly on the spine. */
const AVATAR = 28;
const RING = 2;

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
  const title = 'Likes';
  const subtitle = 'Episodes people you follow liked';
  return (
    <PushedPage title={title} subtitle={subtitle} tone={listener && state.kind === 'error' ? 'grey' : 'hot'}>
      {(layout) => {
        const top = layout.top + (DRAWN.listTop - DRAWN.status);
        const emptyAt = layout.top + (LIST.emptySpineTop - DRAWN.status);
        if (!listener) {
          return <Box className="flex-1" style={{ paddingTop: top }}><PageEmpty top={emptyTop(260)} title="Likes" line="Sign in to see what people you follow like." action={{ label: 'Sign in', onPress: () => router.push('/auth/sign-in') }} /></Box>;
        }
        if (state.kind === 'loading') {
          return (
            <Box className="flex-1" testID="likes-loading">
              <EmptySpine top={emptyAt} />
              <Box style={{ marginTop: layout.top + 30, marginLeft: COMMENTS.spineX, marginRight: LIST.right - LIST.headGap }}><GhostRows rows={6} /></Box>
            </Box>
          );
        }
        if (state.kind === 'error') {
          return (
            <Box className="flex-1" style={{ paddingTop: top }}>
              <PageEmpty top={emptyTop(260)} title="Couldn't load likes" line="Couldn't load likes right now." action={{ label: 'Retry', onPress: () => { setState({ kind: 'loading' }); load(); } }} />
            </Box>
          );
        }
        const nothing = state.items.length === 0;
        return (
          <Box className="flex-1" style={{ paddingTop: top }}>
            {nothing ? <EmptySpine top={emptyAt} /> : <ThreadSpine top={top} />}
            <FlatList
              className="flex-1"
              data={state.items}
              keyExtractor={(l) => `${l.listener?.id ?? ''}|${l.episode.id}|${l.createdAt}`}
              contentContainerStyle={{ ...threadPad(layout.reserve), flexGrow: 1 }}
              ItemSeparatorComponent={() => <Box style={{ height: LIST.nodeGap }} />}
              ListEmptyComponent={<PageEmpty top={emptyTop(LIST.emptyBlockTop) - LIST.top} title="No likes yet" line="No likes yet from people you follow." />}
              ListFooterComponent={state.items.length > 0 ? (state.next ? <Box className="items-center py-row"><Loader /></Box> : <EndOfList />) : undefined}
              onEndReached={more}
              renderItem={({ item }) => {
                const who = item.listener;
                const when = ageLabel(Date.parse(item.createdAt), nowMs);
                const head = (
                  <Box className="flex-row items-center" style={{ gap: LIST.headGap }}>
                    <Box className="items-center" style={{ width: LIST.column, zIndex: 2 }}>
                      <Box className="bg-void items-center justify-center" style={{ width: AVATAR + 2 * RING, height: AVATAR + 2 * RING, borderRadius: (AVATAR + 2 * RING) / 2 }}>
                        <Avatar size={AVATAR} url={who?.avatarUrl} name={who?.displayName} />
                      </Box>
                    </Box>
                    <Type step="caption" className="text-text font-semibold" style={ME_TYPE.name13} numberOfLines={1}>{who?.displayName ?? 'Someone'}</Type>
                    <Type step="caption" className="text-text2 flex-1" style={ME_TYPE.node12} numberOfLines={1}>{`liked · ${when}`}</Type>
                  </Box>
                );
                return (
                  <ThreadNode
                    head={who ? (
                      <Link href={{ pathname: '/profile/[id]', params: { id: who.id } }} asChild>
                        <Pressable accessibilityRole="link" accessibilityLabel={`${who.displayName} liked this, ${when}`} hitSlop={{ top: 8, bottom: 8 }}>{head}</Pressable>
                      </Link>
                    ) : head}
                  >
                    <Pressable
                      onPress={() => (who ? router.push({ pathname: '/like/[owner]/[episode]', params: { owner: who.id, episode: item.episode.id } }) : undefined)}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.episode.title}, ${item.episode.showTitle}`}
                    >
                      <ThreadCard>
                        <Box className="flex-row items-center" style={{ gap: LIST.headGap }}>
                          <Artwork url={item.episode.imageUrl} size={LIST.likeCover} name={item.episode.showTitle} />
                          <Box className="flex-1 min-w-0">
                            <Type step="compact" className="text-text" numberOfLines={2}>{item.episode.title}</Type>
                            <Type step="caption" className="text-text2" style={[ME_TYPE.show11, { marginTop: spacing.hair }]} numberOfLines={1}>{item.episode.showTitle}</Type>
                          </Box>
                          <Pressable onPress={() => void play(item.episode)} accessibilityRole="button" accessibilityLabel={`Play ${item.episode.title}`} hitSlop={7}>
                            <PlayDot size={LIST.playDot} />
                          </Pressable>
                        </Box>
                        {item.note ? <Type step="quote" className="text-quote italic" >{`“${item.note}”`}</Type> : null}
                      </ThreadCard>
                    </Pressable>
                  </ThreadNode>
                );
              }}
            />
          </Box>
        );
      }}
    </PushedPage>
  );
}
