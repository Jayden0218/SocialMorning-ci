// All of one listener's likes, newest first, paged.
/**
 * M21 US8 (FR-074): the profile's Likes "View all". The server's rule decides what shows
 * (`GET /v1/listeners/:id/likes`): public likes only, unless it is you; nothing across a block.
 * An empty answer reads as "no public likes", which also covers likes kept private.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { useProfileApi, type LikeItem } from '@/social/profile-api';
import { useCardActions } from '@/discover/useDiscover';
import { PageHeader } from '@/ui/kit/PageHeader';
import { EndOfList } from '@/ui/kit/EndOfList';
import { Loader } from '@/ui/kit/Loader';
import { EmptyPicture } from '@/ui/me/parts';
import { LikeCard } from '@/ui/social/LikeCard';

const TAP = { minHeight: hit.min };
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: LikeItem[]; next?: string };

export default function ListenerLikesScreen(): React.ReactElement {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const profileApi = useProfileApi();
  const { open, play } = useCardActions();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [paging, setPaging] = useState(false);
  const load = useCallback(() => {
    profileApi.listenerLikes(String(id)).then((p) => setState({ kind: 'ok', items: p.items, ...(p.next ? { next: p.next } : {}) }))
      .catch(() => setState((s) => (s.kind === 'ok' ? s : { kind: 'error' })));
  }, [profileApi, id]);
  useFocusEffect(load);
  const more = () => {
    if (state.kind !== 'ok' || !state.next || paging) return;
    setPaging(true);
    profileApi.listenerLikes(String(id), state.next)
      .then((p) => setState({ kind: 'ok', items: [...state.items, ...p.items], ...(p.next ? { next: p.next } : {}) }))
      .catch(() => undefined)
      .finally(() => setPaging(false));
  };
  const header = <PageHeader title="Likes" {...(typeof name === 'string' && name !== '' ? { subtitle: `Episodes ${name} liked` } : {})} />;
  if (state.kind === 'loading') return <>{header}<Box className="flex-1 bg-background items-center p-4"><Loader /></Box></>;
  if (state.kind === 'error') {
    return (
      <>
      {header}
      <Box className="flex-1 bg-background px-screen-x gap-row">
        <Text className="text-text text-body">Couldn't load likes right now.</Text>
        <Pressable onPress={() => { setState({ kind: 'loading' }); load(); }} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center self-start" style={TAP}><Text className="text-accent text-body font-semibold">Retry</Text></Pressable>
      </Box>
      </>
    );
  }
  const now = new Date().toISOString();
  return (
    <>
    {header}
    <FlatList
      className="flex-1 bg-background"
      data={state.items}
      keyExtractor={(l) => `${l.episode.id}|${l.createdAt}`}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow gap-row"
      ListEmptyComponent={<EmptyPicture icon="thumbs-up-outline" line="No public likes yet." />}
      ListFooterComponent={state.items.length > 0 ? (state.next ? <Box className="items-center py-row"><Loader /></Box> : <EndOfList />) : undefined}
      renderItem={({ item }) => <LikeCard item={{ ...item, listener: undefined }} now={now} onOpen={(c) => void open(c)} onPlay={(c) => void play(c)} />}
      onEndReached={more}
    />
    </>
  );
}
