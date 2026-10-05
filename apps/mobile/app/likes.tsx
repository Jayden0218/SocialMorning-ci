// Likes: episodes people you follow liked, newest first, with their notes; tap to open or play.
/**
 * M19 T031 (US3, FR-021): the Likes timeline — likes from accounts you follow (only those whose
 * likes are public; never someone you blocked or a show you hid), 20 a page, newest first. Each
 * card: the person, their note as a serif quote, and the episode row. From Me.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { useSocial } from '@/social/context';
import { useProfileApi, type LikeItem } from '@/social/profile-api';
import { useCardActions } from '@/discover/useDiscover';
import { PageHeader } from '@/ui/kit/PageHeader';
import { EndOfList } from '@/ui/kit/EndOfList';
import { Loader } from '@/ui/kit/Loader';
import { EmptyPicture } from '@/ui/me/parts';
import { LikeCard } from '@/ui/social/LikeCard';

const TAP = { minHeight: hit.min };

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: LikeItem[]; next?: string };

export default function LikesScreen(): React.ReactElement {
  const { listener } = useSocial();
  const profileApi = useProfileApi();
  const { open, play } = useCardActions();
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
  const header = <PageHeader title="Likes" subtitle="Episodes people you follow liked" />;
  if (!listener) return <>{header}<Box className="flex-1 bg-background px-screen-x"><Text className="text-muted text-body">Sign in to see what people you follow like.</Text></Box></>;
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
      keyExtractor={(l) => `${l.listener?.id ?? ''}|${l.episode.id}|${l.createdAt}`}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow gap-row"
      ListEmptyComponent={<EmptyPicture icon="thumbs-up-outline" line="No likes yet from people you follow." />}
      ListFooterComponent={state.items.length > 0 ? (state.next ? <Box className="items-center py-row"><Loader /></Box> : <EndOfList />) : undefined}
      renderItem={({ item }) => <LikeCard item={item} now={now} onOpen={(c) => void open(c)} onPlay={(c) => void play(c)} />}
      onEndReached={more}
    />
    </>
  );
}
