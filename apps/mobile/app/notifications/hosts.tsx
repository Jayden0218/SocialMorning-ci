// From hosts: announcements from the shows you follow, newest first; a card opens its show.
/**
 * M19 T100 (US10, FR-062): the announcements of the shows you follow, newest first, each shown
 * only from its release time (the server filters). A white card: the show's artwork and title,
 * the text, up to 9 pictures in a three-column grid, and the time; tapping the card opens the
 * show. 20 a page; the list ends with "No more to fetch".
 *
 * M21 US10 (T108): moved out of the Notifications page's third tab into its own page, opened
 * from the "From hosts" card at the top of Notifications. Same cards, same paging.
 */
import { router } from 'expo-router';
import { Link } from '@/design/tailwind';
import { useCallback, useEffect, useState } from 'react';
import { FlatList } from '@/ui/lib/flat-list';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Image } from '@/ui/lib/image';
import { Artwork } from '@/ui/kit/Artwork';
import { Loader } from '@/ui/kit/Loader';
import { Card } from '@/ui/kit/Card';
import { PageHeader } from '@/ui/kit/PageHeader';
import { EndOfList } from '@/ui/kit/EndOfList';
import { EmptyPicture } from '@/ui/me/parts';
import { hit } from '@/design';
import { useSocial } from '@/social/context';
import { useM19Api, type HostNotice } from '@/social/m19-api';

/** One picture in the 3-column grid: a square a third of the card wide. */
const PICTURE = { width: '31.5%', aspectRatio: 1 } as const;

/** M19 T100: one announcement as a white card; the whole card opens the show. */
function HostNoticeCard(props: { notice: HostNotice }): React.ReactElement {
  const n = props.notice;
  const at = new Date(n.releaseAt);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(n.feedUrl) } })}
      accessibilityRole="link"
      accessibilityLabel={`${n.showTitle}: ${n.body}${n.images.length > 0 ? `. ${n.images.length} ${n.images.length === 1 ? 'picture' : 'pictures'}` : ''}. Open the show`}
      className="bg-surface border border-border rounded-row p-row gap-gap"
      style={{ minHeight: hit.min }}
    >
      <Box className="flex-row items-center gap-row">
        <Artwork url={n.imageUrl} size={40} rounded="row" name={n.showTitle} />
        <Box className="flex-1">
          <Text className="text-text text-body font-bold" numberOfLines={1}>{n.showTitle}</Text>
          <Text className="text-muted text-xs">{at.toLocaleDateString([], { day: 'numeric', month: 'short' })} · {at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </Box>
      </Box>
      <Text className="text-text text-body leading-[22px]">{n.body}</Text>
      {n.images.length > 0 ? (
        <Box className="flex-row flex-wrap gap-1.5">
          {n.images.slice(0, 9).map((u) => <Image key={u} source={{ uri: u }} className="rounded-row bg-background" style={PICTURE} accessible={false} />)}
        </Box>
      ) : null}
    </Pressable>
  );
}

type HostsState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: HostNotice[]; next?: string };

/** M19 T100: the From hosts list, paged by `before`. */
function HostNotices(): React.ReactElement {
  const m19 = useM19Api();
  const [state, setState] = useState<HostsState>({ kind: 'loading' });
  const [paging, setPaging] = useState(false);
  const load = useCallback(() => {
    m19.hostNotices().then((p) => setState({ kind: 'ok', items: p.items, ...(p.next ? { next: p.next } : {}) })).catch(() => setState((s) => (s.kind === 'ok' ? s : { kind: 'error' })));
  }, [m19]);
  useEffect(load, [load]);
  const more = () => {
    if (state.kind !== 'ok' || !state.next || paging) return;
    setPaging(true);
    m19.hostNotices(state.next)
      .then((p) => setState({ kind: 'ok', items: [...state.items, ...p.items], ...(p.next ? { next: p.next } : {}) }))
      .catch(() => undefined)
      .finally(() => setPaging(false));
  };
  return (
    <FlatList
      className="flex-1 bg-background"
      data={state.kind === 'ok' ? state.items : []}
      keyExtractor={(n) => n.id}
      contentContainerClassName="px-screen-x pt-gap pb-24 gap-row flex-grow"
      ListEmptyComponent={
        state.kind === 'loading' ? <Box className="items-center p-4"><Loader /></Box>
          : state.kind === 'error' ? (
            <Box className="gap-row">
              <Text className="text-text text-body">Couldn't load announcements right now.</Text>
              <Pressable onPress={() => { setState({ kind: 'loading' }); load(); }} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center self-start" style={{ minHeight: hit.min }}><Text className="text-accent text-body font-semibold">Retry</Text></Pressable>
            </Box>
          )
          : <EmptyPicture icon="mic-outline" line="No announcements yet. When a show you follow posts one, it appears here." />
      }
      ListFooterComponent={state.kind === 'ok' && state.items.length > 0 ? (state.next ? <Box className="items-center py-row"><Loader /></Box> : <EndOfList />) : undefined}
      renderItem={({ item }) => <HostNoticeCard notice={item} />}
      onEndReached={more}
    />
  );
}

export default function HostNoticesScreen(): React.ReactElement {
  const { listener } = useSocial();
  return (
    <>
      <PageHeader title="From hosts" />
      {listener ? <HostNotices /> : (
        <Box className="flex-1 bg-background px-screen-x pt-gap">
          <Card className="py-section">
            <Text className="text-muted text-body">Sign in to see announcements from the shows you follow.</Text>
            <Link href="/auth/sign-in" className="text-accent text-body font-semibold mt-gap py-row" style={{ minHeight: hit.min }} accessibilityRole="link">Sign in</Link>
          </Card>
        </Box>
      )}
    </>
  );
}
