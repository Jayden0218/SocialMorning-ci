// The new-shows plaza page: drag a wall of new shows' covers, Shuffle it, or read it as a list.
/**
 * M21 US7 (T083, FR-062). OUR OWN DESIGN (owner, 2026-10-06). The newest shows the server
 * knows, in an order seeded per listener and day (`GET /v1/discover/plaza`); Shuffle asks for
 * the next order; more load near the wall's bottom edge. "List view" shows the same shows as a
 * plain list — the way in for anyone who cannot drag (screen readers, switch control). With no
 * network, the covers fetched last time show with a Retry.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { PageHeader } from '@/ui/kit/PageHeader';
import { BarButton } from '@/ui/kit/TopBar';
import { Icon } from '@/ui/kit/Icon';
import { Loader } from '@/ui/kit/Loader';
import { Artwork } from '@/ui/kit/Artwork';
import { EndOfList } from '@/ui/kit/EndOfList';
import { useColours } from '@/ui/kit/useColours';
import { useStores } from '@/ui/shell/providers';
import { useSafety } from '@/safety/context';
import { useExploreApi, type PlazaShow } from '@/discover/explore-api';
import { PlazaWall } from '@/ui/discover/Plaza';
import { plural } from '@socialmorning/social-core';

const TAP = { minHeight: hit.min };
const CACHE_KEY = 'plaza';

type State = { shows: PlazaShow[]; next?: string; loading: boolean; failed: boolean };

export default function PlazaScreen(): React.ReactElement {
  const api = useExploreApi();
  const stores = useStores();
  const c = useColours(stores.settings);
  const { hiddenFeeds } = useSafety();
  const [shuffle, setShuffle] = useState(0);
  const [list, setList] = useState(false);
  const [state, setState] = useState<State>(() => {
    const row = stores.feedCache.get(CACHE_KEY);
    try { return { shows: row ? (JSON.parse(row.body) as PlazaShow[]) : [], loading: true, failed: false }; } catch { return { shows: [], loading: true, failed: false }; }
  });
  const loading = useRef(false);

  const load = useCallback((n: number, cursor?: string) => {
    if (loading.current) return;
    loading.current = true;
    setState((s) => ({ ...s, loading: true, failed: false }));
    api.plaza(cursor, n).then((p) => {
      setState((s) => {
        const shows = cursor ? [...s.shows, ...p.items.filter((x) => !s.shows.some((y) => y.feedUrl === x.feedUrl))] : p.items;
        stores.feedCache.set({ key: CACHE_KEY, fetchedAt: Date.now(), body: JSON.stringify(shows.slice(0, 120)) });
        return { shows, ...(p.next ? { next: p.next } : {}), loading: false, failed: false };
      });
    }, () => setState((s) => ({ ...s, loading: false, failed: true }))).finally(() => { loading.current = false; });
  }, [api, stores]);
  useEffect(() => { load(0); }, [load]);

  const more = useCallback(() => { if (state.next && !state.loading) load(shuffle, state.next); }, [state.next, state.loading, load, shuffle]);
  const again = (): void => { const n = shuffle + 1; setShuffle(n); load(n); };
  const openShow = (s: PlazaShow): void => { router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } }); };
  const shows = state.shows.filter((s) => !hiddenFeeds.has(s.feedUrl));

  return (
    <>
      <PageHeader
        title="New shows plaza"
        subtitle={list ? 'The newest shows, as a list.' : 'Drag the wall in any direction. Tap a cover to open the show.'}
        right={
          <Box className="flex-row">
            <BarButton label="Shuffle the plaza" onPress={again}><Icon name="shuffle" size={22} color={c.text} /></BarButton>
            <BarButton label={list ? 'Wall view' : 'List view'} onPress={() => setList((v) => !v)}><Icon name={list ? 'grid-outline' : 'list-outline'} size={22} color={c.text} /></BarButton>
          </Box>
        }
      />
      <Box className="flex-1 bg-background">
        {state.failed ? (
          <Box className="flex-row items-center gap-row mx-screen-x mb-gap bg-surface border border-border rounded-row pl-section">
            <Text className="flex-1 text-muted text-meta">{shows.length > 0 ? "Couldn't refresh — these are the covers from last time." : "Couldn't reach the server."}</Text>
            <Pressable onPress={() => load(shuffle)} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center px-section" style={TAP}>
              <Text className="text-accent text-meta font-bold">Retry</Text>
            </Pressable>
          </Box>
        ) : null}
        {shows.length === 0 && state.loading ? <Loader className="my-section" /> : null}
        {shows.length > 0 && !list ? <PlazaWall shows={shows} onOpen={openShow} onNearEnd={more} /> : null}
        {list ? (
          <FlatList
            data={shows}
            keyExtractor={(s) => s.feedUrl}
            contentContainerClassName="px-screen-x pb-24"
            onEndReached={more}
            ListFooterComponent={state.next ? (state.loading ? <Loader className="my-section" /> : null) : shows.length > 0 ? <EndOfList /> : null}
            renderItem={({ item, index }) => (
              <Pressable onPress={() => openShow(item)} accessibilityRole="button" accessibilityLabel={`${item.title || 'A show'}, ${plural(item.episodes, 'episode')}`} className={`flex-row items-center gap-row py-row ${index > 0 ? 'border-t-hairline border-separator' : ''}`} style={TAP}>
                <Artwork url={item.imageUrl} size={56} name={item.title} />
                <Box className="flex-1">
                  <Text className="text-text text-body font-bold" numberOfLines={2}>{item.title || 'Untitled show'}</Text>
                  <Text className="text-muted text-xs">{plural(item.episodes, 'episode')}</Text>
                </Box>
                <Icon name="chevron-forward" size={18} color={c.muted} />
              </Pressable>
            )}
          />
        ) : null}
      </Box>
    </>
  );
}
