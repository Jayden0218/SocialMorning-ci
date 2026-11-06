// The new-shows plaza page: drag a wall of new shows' covers, Shuffle it, or read it as a list.
/**
 * M31 W5-D (T064; design-pulse2 `discover.html` `plaza--screen`, `plaza--list`, `plaza--error`, layout pattern Stage): a pushed page,
 * the title bar low ("New shows plaza", 26, the line under it) with two circles — Shuffle (loop) and List view / Wall view (list / grid).
 * The wall fills the page behind the bar (92 covers turned -6 degrees, see `PlazaWall`); the list view is a Mosaic of 1 x 2 tiles
 * (cover 72, the title, "n episodes") in the 28 lane that loads more at its end. Nothing loaded and the server not answering: the wall
 * is grey placeholders at 25 % and the error tile with Retry floats over it; covers from last time keep a slim strip with Retry over
 * a live wall.
 *
 * Spec 039 (Feed lane, design B): a `FeedPage` (Back, the title, Shuffle and List/Wall view). The wall is the list's body in a box that reaches both screen
 * edges (the wall is a pan surface, so the list does not scroll in that view: `scrollEnabled` false); the list view is the same frame as a scrolling list of cards in
 * two equal columns on the gutter. A failed load is an `InlineNotice` with Retry over the wall (or its grey placeholder).
 *
 * M21 US7 (T083, FR-062). OUR OWN DESIGN (owner, 2026-10-06). The newest shows the server
 * knows, in an order seeded per listener and day (`GET /v1/discover/plaza`); Shuffle asks for
 * the next order; more load near the wall's bottom edge. "List view" shows the same shows as a
 * plain list — the way in for anyone who cannot drag (screen readers, switch control). With no
 * network, the covers fetched last time show with a Retry.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { InlineNotice } from '@/ui/kit/layout';
import { FeedPage } from '@/ui/feed/FeedPage';
import { Loader } from '@/ui/kit/Loader';
import { Artwork } from '@/ui/kit/Artwork';
import { EndOfList } from '@/ui/kit/EndOfList';
import { Type } from '@/ui/kit/Type';
import { useStores } from '@/ui/shell/providers';
import { useSafety } from '@/safety/context';
import { useExploreApi, type PlazaShow } from '@/discover/explore-api';
import { PlazaPlaceholder, PlazaWall } from '@/ui/discover/Plaza';
import { PAGE } from '@/ui/discover/measures';
import { gutter, radius, spacing } from '@/design';
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
  const { width, height } = useWindowDimensions();
  const side = gutter(width);
  // The wall reaches both screen edges (the page's gutter taken back) and the room under the title row.
  const wall = (
    <Box testID="plaza-stage" style={{ marginHorizontal: -side, height: Math.round(height * 0.7) }}>
      {shows.length > 0 ? <PlazaWall shows={shows} onOpen={openShow} onNearEnd={more} /> : <PlazaPlaceholder />}
      {shows.length === 0 && state.loading ? <Box className="absolute left-0 right-0 items-center" style={{ top: spacing.group }}><Loader /></Box> : null}
    </Box>
  );
  const notice = state.failed ? (
    shows.length > 0
      ? <Box testID="plaza-strip"><InlineNotice text="Couldn't refresh — these are the covers from last time." actionLabel="Retry" onAction={() => load(shuffle)} /></Box>
      : <InlineNotice text="Couldn't reach the server." actionLabel="Retry" onAction={() => load(shuffle)} />
  ) : null;
  return (
    <FeedPage<PlazaShow>
      key={list ? 'list' : 'wall'}
      title="New shows plaza"
      subtitle={subtitle}
      actions={[
        { icon: 'repeat-outline', label: 'Shuffle the plaza', onPress: again },
        { icon: list ? 'grid-outline' : 'list-outline', label: list ? 'Wall view' : 'List view', onPress: () => setList((v) => !v) },
      ]}
      data={list ? shows : []}
      keyExtractor={(s) => s.feedUrl}
      {...(list ? { numColumns: 2, columnWrapperStyle: { gap: spacing.row } } : { scrollEnabled: false })}
      gap={spacing.row}
      ListHeaderComponent={notice}
      ListEmptyComponent={list ? (state.loading && shows.length === 0 ? <Loader className="my-section" /> : undefined) : wall}
      onEndReached={list ? more : undefined}
      ListFooterComponent={list ? (state.next ? (state.loading ? <Loader className="my-section" /> : undefined) : shows.length > 0 ? <EndOfList /> : undefined) : undefined}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => openShow(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.title || 'A show'}, ${plural(item.episodes, 'episode')}`}
          testID="plaza-tile"
          className="flex-1 bg-raise min-w-0"
          style={{ height: PAGE.row * 2 + PAGE.gap, borderRadius: radius.card, padding: PAGE.pad }}
        >
          <Artwork url={item.imageUrl} size={72} name={item.title} />
          <Type step="compact" className="text-text font-bold" style={{ marginTop: PAGE.gap }} numberOfLines={1}>{item.title || 'Untitled show'}</Type>
          <Type step="caption" className="text-text2" numberOfLines={1}>{plural(item.episodes, 'episode')}</Type>
        </Pressable>
      )}
    />
  );
}
