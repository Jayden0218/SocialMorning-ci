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
 */
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

export default function FriendsListening(): React.ReactElement {
  const { listener } = useSocial();
  const m12 = useM12Api();
  const { open, play } = useCardActions();
  const { width } = useWindowDimensions();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(() => {
    if (!listener) return;
    setState({ kind: 'loading' });
    m12.friendsListening().then((items) => setState({ kind: 'ok', items }), () => setState({ kind: 'error' }));
  }, [m12, listener]);
  useEffect(() => { load(); }, [load]);
  if (!listener) return <><PageHeader title="Friends listening" /><Box className="flex-1 bg-background"><EmptyPicture icon="people-outline" line="Sign in to see what people you follow are playing" /></Box></>;
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
    <PageHeader middle={<Box />} />
    <FlatList
      className="flex-1 bg-background"
      data={items.slice(1)}
      // Owner, 2026-10-05: the bottom of a fetched list says so.
      ListFooterComponent={items.length > 0 ? <EndOfList /> : null}
      keyExtractor={(i) => i.episode.id}
      numColumns={2}
      columnWrapperStyle={COLUMNS}
      contentContainerClassName="px-screen-x pb-24 flex-grow"
      ListHeaderComponent={<Box><Title />{lead ? feature(lead) : null}</Box>}
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
