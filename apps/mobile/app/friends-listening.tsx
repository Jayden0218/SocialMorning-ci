// Episodes people you follow played this week, with who and when.
/**
 * Friends are listening (M12 FR-102): episodes people you follow played in the last 7 days,
 * newest first, with who. The server leaves out anyone whose listening is private now or
 * was private when they listened (the M4 rule), anyone across a block, and hidden shows.
 *
 * M17 T064 (`FriendsListening-B`): the Editorial page. Same data, same order, same open and play,
 * same sign-in, empty, error and Retry states.
 *
 * M21 T086 (FR-065): above them, a deck of like posts from people you follow — swipe through
 * the cards; each opens its like post, and Follow / Following sits on each. ⓘ in the header
 * opens a help sheet saying what this page shows and what it never shows.
 *
 * M31 W4-C (T052; design-pulse2 `discover.html#friends-listening--screen`, `--signed-out`, `--empty`, `--help-sheet`, `--error`; layout
 * pattern Thread): "Their likes" is a Deck of 250 x 160 cards (who with Follow / Following at 30, the note in Unbounded 15, the
 * episode at the foot), under its edge label. What people played in the last 7 days hangs on the spine: the player's avatar (40, with a
 * 3 void ring) on the line, and a raise card (radius 18, padding 12) — "Jo played" with the age in mono, the episode (cover 48, title,
 * show) and a light Play (36). The title bar is low: "Friends listening", "This week", and an info circle ("What is this page?")
 * that opens the sheet: the line, the privacy rule in a lock tile, Close. Signed out: an empty block with a light Sign in (the info
 * circle still works); nothing yet: "Quiet week"; a failed load: the error tile with Retry.
 *
 * Not as drawn: the buttons' words are Geist 15 (the kit's button), the drawing's are 12.
 */
import { useLoad } from '@/ui/kit/useLoad';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, spacing } from '@/design';
import { drawnType } from '@/design/type-px';
import { Artwork } from '@/ui/kit/Artwork';
import { Avatar } from '@/ui/kit/Avatar';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { EndOfList } from '@/ui/kit/EndOfList';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Icon } from '@/ui/kit/Icon';
import { Loader } from '@/ui/kit/Loader';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { useCardActions } from '@/discover/useDiscover';
import { ago } from '@/discover/sections';
import { useSocial } from '@/social/context';
import { useM12Api, type FriendListen } from '@/social/m12-api';
import { whoListened } from '@/social/who';
import { openLikePost } from '@/ui/discover/TheirLikes';
import { useProfileApi, type LikeItem } from '@/social/profile-api';
import { CenterAt, ErrTile, SignInBlock } from '@/ui/chat/blocks';
import { COMMENTS } from '@/ui/comments/measures';
import { LIST, PageEmpty } from '@/ui/me/lists';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { SpineColumn } from '@/ui/notifications/parts';
import { FRIENDS } from '@/ui/notifications/measures';

/** M21: one like post as a card in the deck — the person with Follow, the note, the episode. */
function LikeDeckCard(props: { item: LikeItem; following: boolean; onFollow: () => void }): React.ReactElement | null {
  const { item } = props;
  const who = item.listener;
  if (!who) return null;
  return (
    <Box testID="like-card" className="bg-raise border border-line overflow-hidden" style={{ width: FRIENDS.deckWidth, height: FRIENDS.deckHeight, borderRadius: FRIENDS.deckRadius, padding: FRIENDS.deckPad, gap: FRIENDS.deckGap }}>
      <Box className="flex-row items-center" style={{ gap: 8 }}>
        <Avatar size={FRIENDS.deckAvatar} url={who.avatarUrl} name={who.displayName} />
        <Type step="compact" className="text-text flex-1" numberOfLines={1}>{who.displayName}</Type>
        <PulseButton
          label={props.following ? 'Following' : 'Follow'}
          accessibilityLabel={props.following ? `Unfollow ${who.displayName}` : `Follow ${who.displayName}`}
          kind={props.following ? 'quiet' : 'light'}
          selected={props.following}
          height={FRIENDS.followHeight}
          padX={FRIENDS.followPadX}
          onPress={props.onFollow}
        />
      </Box>
      <Pressable onPress={() => openLikePost(item)} accessibilityRole="button" accessibilityLabel={`Open ${who.displayName}'s like of ${item.episode.title}`} className="flex-1 justify-between">
        {item.note ? <Type step="row" className="text-text font-display" style={drawnType.unbounded[15]} numberOfLines={3}>{`“${item.note}”`}</Type> : <Box />}
        <Box className="flex-row items-center" style={{ gap: 10 }}>
          <Artwork url={item.episode.imageUrl} size={FRIENDS.deckCover} name={item.episode.showTitle} />
          <Type step="caption" className="text-text2 flex-1" numberOfLines={2}>{item.episode.title}</Type>
        </Box>
      </Pressable>
    </Box>
  );
}

export default function FriendsListening(): React.ReactElement {
  const { listener, api } = useSocial();
  const profileApi = useProfileApi();
  const [help, setHelp] = useState(false);
  // M23 US9: both loads below are cancelled on unmount.
  const [likesLoad] = useLoad(listener ? () => profileApi.likesTimeline().then((p) => ({ items: p.items.filter((i) => i.listener !== undefined).slice(0, 10) })) : undefined, [profileApi, listener], 'friends.likes');
  const likes: LikeItem[] = likesLoad.kind === 'ok' ? likesLoad.items : [];
  // The timeline is people you follow; an Unfollow here is remembered until the page closes.
  const [unfollowed, setUnfollowed] = useState<ReadonlySet<string>>(new Set());
  const toggleFollow = (id: string): void => {
    const off = unfollowed.has(id);
    (off ? api.follow(id) : api.unfollow(id)).then(() => setUnfollowed((s) => {
      const n = new Set(s);
      if (off) n.delete(id); else n.add(id);
      return n;
    }), () => { /* unchanged */ });
  };
  const m12 = useM12Api();
  const { open, play } = useCardActions();
  const [state, load] = useLoad(listener ? () => m12.friendsListening().then((items) => ({ items })) : undefined, [m12, listener], 'friends.listening');

  const helpSheet = (
    <ActionSheet open={help} onClose={() => setHelp(false)} label="Friends listening">
      <Type step="heading" className="text-text" accessibilityRole="header">Friends listening</Type>
      <Type step="body" className="text-text">What people you follow liked, and what they played in the last 7 days.</Type>
      <Box className="flex-row bg-raise" style={{ borderRadius: LIST.cardRadius, padding: FRIENDS.noteTilePad, gap: 10 }}>
        <Icon name="lock-closed-outline" size={22} color={colour.hotText} />
        <Type step="note" className="text-text2 flex-1">Anyone who listens privately, or keeps their likes private, is never shown. Nor is anyone you blocked, or who blocked you.</Type>
      </Box>
      <PulseButton label="Close" kind="quiet" onPress={() => setHelp(false)} full className="border border-line" />
    </ActionSheet>
  );

  const now = Date.now();
  const items = state.kind === 'ok' ? state.items : [];
  const who = (item: FriendListen): string => `${whoListened(item.listeners.map((l) => l.name))} played`;

  return (
    <PushedPage
      title="Friends listening"
      subtitle="This week"
      actions={[{ icon: 'information-circle-outline', label: 'What is this page?', onPress: () => setHelp(true) }]}
    >
      {(layout) => (
        <>
          {!listener ? (
            <CenterAt top={240}>
              <SignInBlock line="Sign in to see what people you follow are playing">
                <PulseButton label="Sign in" accessibilityLabel="Sign in" onPress={() => router.push('/auth/sign-in')} full />
              </SignInBlock>
            </CenterAt>
          ) : (
            <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1, paddingTop: layout.top + FRIENDS.topBelowStatus, paddingBottom: layout.reserve }}>
              {likes.length > 0 ? (
                <Box className="relative" style={{ paddingBottom: FRIENDS.deckBelow }} testID="likes-deck">
                  <EdgeLabel label="Their likes" top={4} />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={FRIENDS.deckWidth + FRIENDS.deckSpace}
                    decelerationRate="fast"
                    style={{ flexGrow: 0 }}
                    contentContainerStyle={{ paddingLeft: ME_MOSAIC.lane, paddingRight: ME_MOSAIC.right, gap: FRIENDS.deckSpace }}
                  >
                    {likes.map((it, i) => it.listener ? (
                      <LikeDeckCard key={`${it.listener.id}|${it.episode.id}|${i}`} item={it} following={!unfollowed.has(it.listener.id)} onFollow={() => it.listener && toggleFollow(it.listener.id)} />
                    ) : null)}
                  </ScrollView>
                </Box>
              ) : null}
              {state.kind === 'loading' ? <Loader className="my-section" />
                : state.kind === 'error' ? (
                  <Box style={{ paddingTop: ME_MOSAIC.row }}>
                    <ErrTile line="Couldn't load this right now.">
                      <PulseButton label="Retry" accessibilityLabel="Retry" kind="quiet" icon="repeat-outline" onPress={load} height={40} className="self-start border border-line" />
                    </ErrTile>
                  </Box>
                )
                  : items.length === 0 ? <PageEmpty top={ME_MOSAIC.row} title="Quiet week" line="Nobody you follow has played anything public this week" />
                    : (
                      <SpineColumn>
                        <Box style={{ paddingLeft: LIST.left, paddingRight: LIST.right, gap: FRIENDS.nodeGap }}>
                          {items.map((item) => (
                            <Box key={item.episode.id} className="flex-row" style={{ gap: FRIENDS.rowGap }} testID="friend-node">
                              <Box className="bg-void items-center justify-center" style={{ width: FRIENDS.avatar, height: FRIENDS.avatar, borderRadius: FRIENDS.avatar / 2, zIndex: 2 }} accessible={false} importantForAccessibility="no-hide-descendants">
                                <Avatar size={FRIENDS.avatar - 2 * FRIENDS.ring} name={item.listeners[0]?.name} />
                              </Box>
                              <Box className="flex-1 min-w-0 bg-raise" style={{ borderRadius: LIST.cardRadius, padding: LIST.cardPad, gap: 8 }} testID="friend-card">
                                <Box className="flex-row items-center" style={{ gap: 8 }}>
                                  <Type step="caption" className="text-text font-semibold" numberOfLines={1} style={{ flexShrink: 1 }}>{who(item)}</Type>
                                  <Type step="tag" className="text-text3">{ago(item.lastAt, now)}</Type>
                                </Box>
                                <Box className="flex-row items-center" style={{ gap: 10 }}>
                                  <Pressable onPress={() => void open(item.episode)} accessibilityRole="button" accessibilityLabel={`${item.episode.title}, ${item.episode.showTitle}`} className="flex-1 flex-row items-center" style={{ gap: 10 }}>
                                    <Artwork url={item.episode.imageUrl} size={FRIENDS.cover} name={item.episode.showTitle} />
                                    <Box className="flex-1 min-w-0">
                                      <Type step="compact" className="text-text font-bold" numberOfLines={2}>{item.episode.title}</Type>
                                      <Type step="caption" className="text-text2" numberOfLines={1}>{item.episode.showTitle}</Type>
                                    </Box>
                                  </Pressable>
                                  <PulseButton label="Play" accessibilityLabel={`Play ${item.episode.title}`} icon="play" height={FRIENDS.playHeight} padX={spacing.section - 2} onPress={() => void play(item.episode)} />
                                </Box>
                              </Box>
                            </Box>
                          ))}
                          {/* Owner, 2026-10-05: the bottom of a fetched list says so. */}
                          <EndOfList />
                        </Box>
                      </SpineColumn>
                    )}
            </ScrollView>
          )}
          {helpSheet}
        </>
      )}
    </PushedPage>
  );
}
