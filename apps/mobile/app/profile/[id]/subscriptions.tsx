// The shows another listener subscribes to, unless they keep them private.
/**
 * M21 US8 (FR-074, G-M21-10): `GET /v1/listeners/:id/subscriptions`. A 403 `private` (they keep
 * their subscriptions private, or a block stands between you) shows a Private state and no shows.
 * Each show opens its page. Order: their own "Default" order, then newest first (the server's).
 */
import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { PageHeader } from '@/ui/kit/PageHeader';
import { EndOfList } from '@/ui/kit/EndOfList';
import { Loader } from '@/ui/kit/Loader';
import { Artwork } from '@/ui/kit/Artwork';
import { EmptyPicture } from '@/ui/me/parts';
import { useUs8Api, type PublicShow } from '@/social/us8-api';

const TAP = { minHeight: hit.min };
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'private' } | { kind: 'ok'; items: PublicShow[] };

export default function ListenerSubscriptionsScreen(): React.ReactElement {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const us8 = useUs8Api();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(() => {
    us8.listenerSubscriptions(String(id))
      .then((r) => setState(r.private ? { kind: 'private' } : { kind: 'ok', items: r.items }))
      .catch(() => setState((s) => (s.kind === 'ok' ? s : { kind: 'error' })));
  }, [us8, id]);
  useFocusEffect(load);
  const whose = typeof name === 'string' && name !== '' ? name : 'This listener';
  const header = <PageHeader title="Subscriptions" subtitle={`Shows ${whose === 'This listener' ? 'they follow' : `${whose} follows`}`} />;
  if (state.kind === 'loading') return <>{header}<Box className="flex-1 bg-background items-center p-4"><Loader /></Box></>;
  if (state.kind === 'private') {
    return <>{header}<Box className="flex-1 bg-background px-screen-x"><EmptyPicture icon="lock-closed-outline" line={`${whose} keeps their subscriptions private.`} /></Box></>;
  }
  if (state.kind === 'error') {
    return (
      <>
      {header}
      <Box className="flex-1 bg-background px-screen-x gap-row">
        <Text className="text-text text-body">Couldn't load the shows right now.</Text>
        <Pressable onPress={() => { setState({ kind: 'loading' }); load(); }} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center self-start" style={TAP}><Text className="text-accent text-body font-semibold">Retry</Text></Pressable>
      </Box>
      </>
    );
  }
  return (
    <>
    {header}
    <FlatList
      className="flex-1 bg-background"
      data={state.items}
      keyExtractor={(s) => s.feedUrl}
      contentContainerClassName="px-screen-x pb-24 flex-grow"
      ListEmptyComponent={<EmptyPicture icon="albums-outline" line="No shows yet." />}
      ListFooterComponent={state.items.length > 0 ? <EndOfList /> : undefined}
      renderItem={({ item }) => {
        const title = item.title ?? item.feedUrl;
        return (
          <Pressable onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(item.feedUrl) } })} accessibilityRole="button" accessibilityLabel={`Open ${title}`}
            className="flex-row gap-row items-center py-2.5 border-b-hairline border-separator" style={TAP}>
            <Artwork url={item.imageUrl ?? undefined} size={56} name={title} />
            <Text className="text-text text-sm font-bold flex-1" numberOfLines={2}>{title}</Text>
          </Pressable>
        );
      }}
    />
    </>
  );
}
