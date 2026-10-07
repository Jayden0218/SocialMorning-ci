// Episodes people you follow played this week, with who and when.
/**
 * Friends are listening (M12 FR-102): episodes people you follow played in the last 7 days,
 * newest first, with who. The server leaves out anyone whose listening is private now or
 * was private when they listened (the M4 rule), anyone across a block, and hidden shows.
 *
 * M17 T064 (`FriendsListening-B`): a "This week" eyebrow over the serif title; the newest
 * episode is a white card — artwork, show, serif title, the listeners' initials stacked, who
 * and when, and a yellow Play pill; the rest are a two-column grid of square artwork cards
 * (Play on the artwork's corner) with show, title, who and when under them. Same data, same
 * order, same open and play, same sign-in, empty, error and Retry states.
 *
 * M21 T086 (FR-065): above them, a deck of like posts from people you follow — swipe through
 * the cards; each opens its like post, and Follow / Following sits on each. ⓘ in the header
 * opens a help sheet saying what this page shows and what it never shows.
 */
import { useLoad } from '@/ui/kit/useLoad';
import { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit, spacing } from '@/design';
import { Loader } from '@/ui/kit/Loader';
import { Card } from '@/ui/kit/Card';
import { Artwork } from '@/ui/kit/Artwork';
import { Button } from '@/ui/kit/Button';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { EmptyPicture } from '@/ui/me/parts';
import { PlayButton } from '@/ui/discover/parts';
import { useCardActions } from '@/discover/useDiscover';
import { ago } from '@/discover/sections';
import { useSocial } from '@/social/context';
import { useM12Api, type FriendListen } from '@/social/m12-api';
import { whoListened } from '@/social/who';
import { PageHeader } from '@/ui/kit/PageHeader';
import { BarButton } from '@/ui/kit/TopBar';
import { Icon } from '@/ui/kit/Icon';
import { Avatar } from '@/ui/kit/Avatar';
import { useColours } from '@/ui/kit/useColours';
import { useStores } from '@/ui/shell/providers';
import { Pager } from '@/ui/discover/parts';
import { openLikePost } from '@/ui/discover/TheirLikes';
import { useProfileApi, type LikeItem } from '@/social/profile-api';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { EndOfList } from '@/ui/kit/EndOfList';

const TAP = { minHeight: hit.min };
const COLUMNS = { gap: spacing.row };
/** The stacked initials: at most this many faces, then "+N". */
const FACES = 2;
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: FriendListen[] };

/** The eyebrow and the serif title, drawn in the list so they scroll with it (`FriendsListening-B`). */
function Title(): React.ReactElement {
  return (
    <Box className="pb-row">
      <Eyebrow accent>This week</Eyebrow>
      <Text className="text-text text-display font-display mt-1" accessibilityRole="header">Friends listening</Text>
    </Box>
  );
}

/** The listeners' initials, overlapping; decoration — the names are in the text beside them. */
function Faces(props: { listeners: FriendListen['listeners'] }): React.ReactElement {
  const shown = props.listeners.slice(0, FACES);
  const more = props.listeners.length - shown.length;
  return (
    <Box className="flex-row" accessible={false} importantForAccessibility="no-hide-descendants">
      {shown.map((l, n) => (
        <Box key={l.id} className={`w-7 h-7 rounded-pill bg-accentTint border border-surface items-center justify-center ${n > 0 ? '-ml-2' : ''}`}>
          <Text className="text-text text-micro font-bold">{l.initials ?? l.name.slice(0, 1).toUpperCase()}</Text>
        </Box>
      ))}
      {more > 0 ? (
        <Box className="w-7 h-7 rounded-pill bg-track border border-surface items-center justify-center -ml-2">
          <Text className="text-text text-micro font-bold">+{more}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

/** M21: one like post as a card in the deck — the person with Follow, the note, the episode. */
function LikeDeckCard(props: { item: LikeItem; following: boolean; onFollow: () => void }): React.ReactElement | null {
  const { item } = props;
  const who = item.listener;
  if (!who) return null;
  return (
    <Card className="py-row">
      <Box className="flex-row items-center gap-row">
        <Avatar size={36} url={who.avatarUrl} name={who.displayName} />
        <Text className="flex-1 text-text text-body font-bold" numberOfLines={1}>{who.displayName}</Text>
        <Pressable onPress={props.onFollow} accessibilityRole="button" accessibilityState={{ selected: props.following }} accessibilityLabel={props.following ? `Unfollow ${who.displayName}` : `Follow ${who.displayName}`} className={`justify-center px-section rounded-pill ${props.following ? 'bg-surface border border-border' : 'bg-primary'}`} style={TAP}>
          <Text className={props.following ? 'text-muted text-meta font-semibold' : 'text-onPrimary text-meta font-bold'}>{props.following ? 'Following' : 'Follow'}</Text>
        </Pressable>
      </Box>
      <Pressable onPress={() => openLikePost(item)} accessibilityRole="button" accessibilityLabel={`Open ${who.displayName}'s like of ${item.episode.title}`} style={TAP}>
        {item.note ? <Text className="text-text text-body font-display-semibold mt-gap" numberOfLines={3}>{`“${item.note}”`}</Text> : null}
        <Box className="flex-row items-center gap-row mt-row">
          <Artwork url={item.episode.imageUrl} size={48} name={item.episode.showTitle} />
          <Box className="flex-1">
            <Text className="text-text text-meta font-bold" numberOfLines={2}>{item.episode.title}</Text>
            <Text className="text-muted text-xs" numberOfLines={1}>{item.episode.showTitle}</Text>
          </Box>
        </Box>
      </Pressable>
    </Card>
  );
}

export default function FriendsListening(): React.ReactElement {
  const { listener, api } = useSocial();
  const profileApi = useProfileApi();
  const stores = useStores();
  const c = useColours(stores.settings);
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
  const helpButton = <BarButton label="What is this page?" onPress={() => setHelp(true)}><Icon name="information-circle-outline" size={24} color={c.text} /></BarButton>;
  const helpSheet = (
    <Actionsheet isOpen={help} onClose={() => setHelp(false)}>
      <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
      <ActionsheetContent className="bg-surface rounded-t-row px-screen-x pt-row items-stretch">
        <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
        <Text className="text-text text-title font-display py-row" accessibilityRole="header">Friends listening</Text>
        <Text className="text-text text-body">What people you follow liked, and what they played in the last 7 days.</Text>
        <Text className="text-muted text-body mt-gap">Anyone who listens privately, or keeps their likes private, is never shown. Nor is anyone you blocked, or who blocked you.</Text>
        <Pressable onPress={() => setHelp(false)} accessibilityRole="button" accessibilityLabel="Close" className="items-center justify-center mt-row" style={TAP}>
          <Text className="text-accent text-sm font-bold">Close</Text>
        </Pressable>
      </ActionsheetContent>
    </Actionsheet>
  );
  const deck = likes.length > 0 ? (
    <Box className="-mx-screen-x mb-row">
      <Text className="text-text text-lg font-display px-screen-x mb-gap" accessibilityRole="header">Their likes</Text>
      <Pager count={likes.length}>
        {(i) => {
          const it = likes[i];
          return it && it.listener ? <LikeDeckCard item={it} following={!unfollowed.has(it.listener.id)} onFollow={() => it.listener && toggleFollow(it.listener.id)} /> : null;
        }}
      </Pager>
    </Box>
  ) : null;
  const m12 = useM12Api();
  const { open, play } = useCardActions();
  const { width } = useWindowDimensions();
  const [state, load] = useLoad(listener ? () => m12.friendsListening().then((items) => ({ items })) : undefined, [m12, listener], 'friends.listening');
  if (!listener) return <><PageHeader title="Friends listening" right={helpButton} />{helpSheet}<Box className="flex-1 bg-background"><EmptyPicture icon="people-outline" line="Sign in to see what people you follow are playing" /></Box></>;
  const now = Date.now();
  const items = state.kind === 'ok' ? state.items : [];
  const [lead] = items;
  const who = (item: FriendListen): string => `${whoListened(item.listeners.map((l) => l.name))} · ${ago(item.lastAt, now)}`;
  /** A grid card's width: half the content width, less half the gap. */
  const cell = Math.max(0, Math.floor((width - 2 * spacing.screenX - spacing.row) / 2));
  const cellBox = { width: cell };

  /** The newest one: the wide card. */
  const feature = (item: FriendListen): React.ReactElement => (
    <Card padded={false} className="p-section mb-row">
      <Pressable onPress={() => void open(item.episode)} accessibilityRole="button" accessibilityLabel={`${item.episode.title}, ${item.episode.showTitle}`} className="flex-row items-center gap-section" style={TAP}>
        <Artwork url={item.episode.imageUrl} size={96} rounded="row" name={item.episode.showTitle} />
        <Box className="flex-1">
          <Text className="text-muted text-xs" numberOfLines={1}>{item.episode.showTitle}</Text>
          <Text className="text-text text-title font-display mt-1" numberOfLines={3}>{item.episode.title}</Text>
        </Box>
      </Pressable>
      <Box className="flex-row items-center gap-2 mt-row">
        <Faces listeners={item.listeners} />
        <Text className="flex-1 text-muted text-xs" numberOfLines={2}>{who(item)}</Text>
        <Button label="Play" accessibilityLabel={`Play ${item.episode.title}`} onPress={() => void play(item.episode)} />
      </Box>
    </Card>
  );

  return (
    <>
    <PageHeader middle={<Box />} right={helpButton} />
    {helpSheet}
    <FlatList
      className="flex-1 bg-background"
      data={items.slice(1)}
      // Owner, 2026-10-05: the bottom of a fetched list says so.
      ListFooterComponent={items.length > 0 ? <EndOfList /> : undefined}
      keyExtractor={(i) => i.episode.id}
      numColumns={2}
      columnWrapperStyle={COLUMNS}
      contentContainerClassName="px-screen-x pb-24 flex-grow"
      ListHeaderComponent={<Box><Title />{deck}{lead ? feature(lead) : null}</Box>}
      ListEmptyComponent={items.length > 0 ? undefined : state.kind === 'loading' ? <Loader className="my-section" /> : state.kind === 'error' ? (
        <Box className="items-center my-section">
          <Text className="text-muted text-sm">Couldn't load this right now.</Text>
          <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center" style={TAP}><Text className="text-accent text-sm font-semibold">Retry</Text></Pressable>
        </Box>
      ) : <EmptyPicture icon="people-outline" line="Nobody you follow has played anything public this week" />}
      renderItem={({ item }) => (
        <Box className="mb-section" style={cellBox}>
          <Pressable onPress={() => void open(item.episode)} accessibilityRole="button" accessibilityLabel={`${item.episode.title}, ${item.episode.showTitle}`} style={TAP}>
            <Artwork url={item.episode.imageUrl} size={cell} rounded="row" name={item.episode.showTitle} />
            <Text className="text-muted text-xs mt-2" numberOfLines={1}>{item.episode.showTitle}</Text>
            <Text className="text-text text-body font-bold mt-0.5" numberOfLines={3}>{item.episode.title}</Text>
            <Text className="text-muted text-xs mt-1" numberOfLines={2}>{who(item)}</Text>
          </Pressable>
          <Box className="absolute top-1 right-1">
            <PlayButton title={item.episode.title} onPress={() => void play(item.episode)} />
          </Box>
        </Box>
      )}
    />
    </>
  );
}
