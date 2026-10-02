/**
 * Friends are listening (M12 FR-102): episodes people you follow played in the last 7 days,
 * newest first, with who. The server leaves out anyone whose listening is private now or
 * was private when they listened (the M4 rule), anyone across a block, and hidden shows.
 */
import { useCallback, useEffect, useState } from 'react';
import { FlatList } from '../src/ui/lib/flat-list';
import { Pressable } from '../src/ui/lib/pressable';
import { Text } from '../src/ui/lib/text';
import { Box } from '../src/ui/lib/box';
import { hit } from '../src/design';
import { Loader } from '../src/ui/Loader';
import { EmptyPicture } from '../src/ui/me/parts';
import { EpisodeLine } from '../src/ui/discover/parts';
import { useCardActions } from '../src/discover/useDiscover';
import { ago } from '../src/discover/sections';
import { useSocial } from '../src/social/context';
import { useM12Api, type FriendListen } from '../src/social/m12-api';
import { whoListened } from '../src/social/who';
import { PageHeader } from '../src/ui/PageHeader';

const TAP = { minHeight: hit.min };
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: FriendListen[] };

export default function FriendsListening(): React.ReactElement {
  const { listener } = useSocial();
  const m12 = useM12Api();
  const { open, play } = useCardActions();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(() => {
    if (!listener) return;
    setState({ kind: 'loading' });
    m12.friendsListening().then((items) => setState({ kind: 'ok', items }), () => setState({ kind: 'error' }));
  }, [m12, listener]);
  useEffect(() => { load(); }, [load]);
  if (!listener) return <><PageHeader title="Friends listening" /><Box className="flex-1 bg-background"><EmptyPicture icon="people-outline" line="Sign in to see what people you follow are playing" /></Box></>;
  const now = Date.now();
  return (
    <>
    <PageHeader title="Friends listening" />
    <FlatList
      className="flex-1 bg-background"
      data={state.kind === 'ok' ? state.items : []}
      keyExtractor={(i) => i.episode.id}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow"
      ListEmptyComponent={state.kind === 'loading' ? <Loader className="my-section" /> : state.kind === 'error' ? (
        <Box className="items-center my-section">
          <Text className="text-muted text-sm">Couldn't load this right now.</Text>
          <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center" style={TAP}><Text className="text-accent text-sm font-semibold">Retry</Text></Pressable>
        </Box>
      ) : <EmptyPicture icon="people-outline" line="Nobody you follow has played anything public this week" />}
      renderItem={({ item }) => (
        <EpisodeLine card={item.episode} size={56} line={`${whoListened(item.listeners.map((l) => l.name))} · ${ago(item.lastAt, now)}`} onOpen={() => void open(item.episode)} onPlay={() => void play(item.episode)} />
      )}
    />
    </>
  );
}
