// The new-shows plaza page: drag a wall of new shows' covers, Shuffle it, or read it as a list.
/**
 * M31 W5-D (T064; design-pulse2 `discover.html` `plaza--screen`, `plaza--list`, `plaza--error`, layout pattern Stage): a pushed page,
 * the title bar low ("New shows plaza", 26, the line under it) with two circles — Shuffle (loop) and List view / Wall view (list / grid).
 * The wall fills the page behind the bar (92 covers turned -6 degrees, see `PlazaWall`); the list view is a Mosaic of 1 x 2 tiles
 * (cover 72, the title, "n episodes") in the 28 lane that loads more at its end. Nothing loaded and the server not answering: the wall
 * is grey placeholders at 25 % and the error tile with Retry floats over it; covers from last time keep a slim strip with Retry over
 * a live wall.
 *
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
import { Box } from '@/ui/lib/box';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Loader } from '@/ui/kit/Loader';
import { Artwork } from '@/ui/kit/Artwork';
import { EndOfList } from '@/ui/kit/EndOfList';
import { Type } from '@/ui/kit/Type';
import { useStores } from '@/ui/shell/providers';
import { useSafety } from '@/safety/context';
import { useExploreApi, type PlazaShow } from '@/discover/explore-api';
import { PlazaPlaceholder, PlazaWall } from '@/ui/discover/Plaza';
import { RetryTile } from '@/ui/discover/Mosaic';
import { PAGE } from '@/ui/discover/measures';
import { bodyTop } from '@/ui/discover/page-parts';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { PulseButton } from '@/ui/kit/PulseButton';
import { plural } from '@socialmorning/social-core';

const CACHE_KEY = 'plaza';

type State = { shows: PlazaShow[]; next?: string; loading: boolean; failed: boolean };

export default function PlazaScreen(): React.ReactElement {
  const api = useExploreApi();
  const stores = useStores();
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

  const subtitle = list ? 'The newest shows, as a list.' : 'Drag the wall in any direction. Tap a cover to open the show.';
  const colGap = PAGE.gap;
  return (
    <PushedPage
      title="New shows plaza"
      subtitle={subtitle}
      size={26}
      fade={PAGE.plazaFade}
      actions={[
        { icon: 'repeat-outline', label: 'Shuffle the plaza', onPress: again },
        { icon: list ? 'grid-outline' : 'list-outline', label: list ? 'Wall view' : 'List view', onPress: () => setList((v) => !v) },
      ]}
    >
      {(layout) => (
        <Box className="flex-1">
          {!list && shows.length > 0 ? <PlazaWall shows={shows} onOpen={openShow} onNearEnd={more} /> : null}
          {!list && shows.length === 0 ? <PlazaPlaceholder /> : null}
          {shows.length === 0 && state.loading ? <Box className="absolute left-0 right-0 items-center" style={{ top: bodyTop(layout) }}><Loader /></Box> : null}
          {state.failed ? (
            shows.length > 0 ? (
              <Box testID="plaza-strip" className="absolute flex-row items-center bg-raise border border-line" style={{ left: ME_MOSAIC.lane, right: ME_MOSAIC.right, top: bodyTop(layout), borderRadius: PAGE.radius, paddingLeft: ME_MOSAIC.panelPad, zIndex: 5 }}>
                <Type step="caption" className="text-text flex-1 py-row">Couldn't refresh — these are the covers from last time.</Type>
                <PulseButton label="Retry" accessibilityLabel="Retry" kind="quiet" onPress={() => load(shuffle)} height={40} />
              </Box>
            ) : (
              <Box className="absolute left-0 right-0" style={{ top: bodyTop(layout, PAGE.plazaError), zIndex: 5 }}>
                <RetryTile line="Couldn't reach the server." onRetry={() => load(shuffle)} />
              </Box>
            )
          ) : null}
          {list ? (
            <FlatList
              data={shows}
              keyExtractor={(s) => s.feedUrl}
              numColumns={2}
              columnWrapperStyle={{ gap: colGap }}
              contentContainerStyle={{ paddingTop: bodyTop(layout), paddingBottom: layout.reserve, paddingLeft: ME_MOSAIC.lane, paddingRight: ME_MOSAIC.right, rowGap: colGap }}
              onEndReached={more}
              ListFooterComponent={state.next ? (state.loading ? <Loader className="my-section" /> : undefined) : shows.length > 0 ? <EndOfList /> : undefined}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => openShow(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title || 'A show'}, ${plural(item.episodes, 'episode')}`}
                  testID="plaza-tile"
                  className="flex-1 bg-raise min-w-0"
                  style={{ height: PAGE.row * 2 + PAGE.gap, borderRadius: PAGE.radius, padding: PAGE.pad }}
                >
                  <Artwork url={item.imageUrl} size={72} name={item.title} />
                  <Type step="compact" className="text-text font-bold" style={{ marginTop: PAGE.gap }} numberOfLines={1}>{item.title || 'Untitled show'}</Type>
                  <Type step="caption" className="text-text2" numberOfLines={1}>{plural(item.episodes, 'episode')}</Type>
                </Pressable>
              )}
            />
          ) : null}
        </Box>
      )}
    </PushedPage>
  );
}
