// The Discover view of Home: the mosaic on top, the sections under it, the title and search field low.
/**
 * M31 T025 (design-pulse2 `discover--screen`, `home--screen`; layout pattern Mosaic + thumb zone).
 * From the top: the mosaic (today's pick, Hot now, the shortcuts as tiles), then the sections in the
 * owner's order exactly as before (their redraw as decks is wave 2, T030). The bottom zone, above the
 * Moments | Discover switch the Home screen draws, holds the "Discover" title with today's date and
 * the search field (48) with Scan. The title fades over 24–72 of scroll; the field stays. A fade
 * (360 tall, void from 55 %) behind the zone hides the tiles scrolling under it; the glow behind the
 * top is `DiscoverGlow`.
 *
 * Kept from before: the page appears whole (the loading mark until Discover and For You have both had
 * their first answer, or `FIRST_PAINT_CAP_MS`); the stale notice; pull to refresh; the Discover tab
 * pressed again scrolls to the top; "Premium" scrolls to Premium picks.
 *
 * Deviation from the drawing (gate log): the loading state is the app's sound-bar mark centred, not the
 * 16-bar breathing mark (home--loading is a wave-7 state).
 */
import { Fragment, useRef } from 'react';
import { useScrollToTop } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Box } from '@/ui/lib/box';
import { colour, gutter, spacing } from '@/design';
import { type SectionId } from '@/discover/sections';
import { Loader } from '@/ui/kit/Loader';
import { usePullRefresh } from '@/ui/kit/PullRefresh';
import { Fade } from '@/ui/kit/Fade';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { Type } from '@/ui/kit/Type';
import { TAB_PAGE_END } from '@/ui/kit/Screen';
import { RecFeedbackLink } from './RecFeedback';
import { DECK } from './Deck';
import { NotInterestedSheet } from './NotInterested';
import { TreasureHunt } from './TreasureHunt';
import { TheirLikes } from './TheirLikes';
import { TopicListCards } from './TopicLists';
import { ForYouSection } from './ForYouSection';
import { PicksSection } from './PicksSection';
import { ChartSection } from './ChartSection';
import { CategoryStrip, MoreCategories } from './CategorySections';
import { PremiumSection, ShowTiles, VideoSection, popularShowTiles } from './ShowSections';
import { NewArrivalsSection, SaidSection } from './ListenerSections';
import { DiscoverMosaic } from './DiscoverMosaic';
import { DiscoverGlow } from './DiscoverGlow';
import { useShortcutTiles } from './DiscoverShortcuts';
import { TrendingSearchBar } from './TrendingSearch';
import { SWITCH_HEIGHT, SWITCH_LIFT } from './HomeSwitch';
import { hottest } from './moments-logic';
import { useMomentActions } from './useMomentActions';
import type { DiscoverPageData } from './useDiscoverPage';
import type { MomentsList } from './useMoments';
import type { PickWithFaces } from '@/discover/explore-api';
import { setShared } from '@/ui/kit/sharedValue';
import { nowMs } from '@/ui/kit/clock';

/** How far the page scrolls before the title has gone (it fades over 24–72). */
const COLLAPSE_FROM = 24;
const COLLAPSE_TO = 72;
/** The void strip under the clock is fully drawn after this much scroll; it is 8 taller than the status bar (drawn: 58 vs 50). */
export const SCRIM_FROM = 16;
export const CLOCK_SCRIM_EXTRA = 8;
/** Distance from the page's bottom to the bottom zone: above the switch, 16 clear (drawn: zone at 168, switch top at 152). */
export const ZONE_BOTTOM = SWITCH_LIFT + SWITCH_HEIGHT + 16;
/** The title row (Unbounded 30, 38 tall) + 10 + the field (48). */
const ZONE_HEIGHT = 38 + 10 + 48;
/** The fade behind the zone: 360 tall from the page's foot (drawn `fade(92,360)`), void from 55 %. */
export const FADE_HEIGHT = 360;
/** The mosaic starts 6 under the status bar (drawn: status bar 50, mosaic at 56). */
export const MOSAIC_TOP = 6;
const MONTH_DAY = { weekday: 'short', day: 'numeric', month: 'short' } as const;
/** "TUE 27 OCT" — the date in the bottom zone, from the phone's clock. */
const today = (): string => new Date().toLocaleDateString('en-GB', MONTH_DAY).replace(/,/g, '').toUpperCase();

export function DiscoverPage(props: { page: DiscoverPageData; moments: MomentsList }): React.ReactElement {
  const { page, moments } = props;
  const { model, act, view, refreshing, allCategories, hiddenCats, showCat, hints, openSearch, moreFor, notInterested, scroller, shown, listener, undo } = page;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const side = gutter(width);
  useScrollToTop(scroller);
  const scrollY = useSharedValue(0);
  const premiumY = useRef<number | undefined>(undefined);
  const pull = usePullRefresh(refreshing, () => void page.refreshBoth());
  // The pull-to-refresh backdrop still hears every scroll; the shared value drives the title.
  const pullScroll = pull.onScroll as unknown as (e: { nativeEvent: { contentOffset: { y: number } } }) => void;
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      setShared(scrollY, e.contentOffset.y);
      runOnJS(pullScroll)({ nativeEvent: { contentOffset: { y: e.contentOffset.y } } });
    },
  });
  const title = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [COLLAPSE_FROM, COLLAPSE_TO], [1, 0], Extrapolation.CLAMP),
  }));
  // M31 F2a (design-pulse2 `scroll(…,58)`): the drawing clips the page at 58, so nothing shows under the clock once it
  // has scrolled; the glow belongs to the top of the page and scrolls away with it (the fold screens have none).
  const glowShift = useAnimatedStyle(() => ({ transform: [{ translateY: -scrollY.value }] }));
  const clockScrim = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [0, SCRIM_FROM], [0, 1], Extrapolation.CLAMP) }));
  const toPremium = (): void => {
    if (premiumY.current === undefined) return;
    scroller.current?.scrollTo({ y: Math.max(0, premiumY.current - 56), animated: true });
  };
  const markPremium = (e: LayoutChangeEvent): void => {
    premiumY.current = e.nativeEvent.layout.y;
  };
  const tiles = useShortcutTiles({ onCategories: page.allCategories, onPremium: toPremium });
  const momentActions = useMomentActions(page.view?.body);
  const hot = hottest(moments.items);
  const pick = model.picks[0] as PickWithFaces | undefined;

  const section = (id: SectionId): React.ReactNode => {
    switch (id) {
      case 'forYou':
        return (
          <ForYouSection
            rows={model.forYou}
            {...act}
            onOpenAt={(c, index) => {
              page.outbox.opened(index);
              void page.open(c);
            }}
            {...(listener ? { onMore: page.setMoreFor } : {})}
            {...(undo ? { hidden: { at: undo.at, kind: undo.kind, onUndo: page.undoHide } } : {})}
            // M22 US5 (FR-019): "Not liking these?" under the For You deck.
            {...(listener && model.forYou.length > 0 ? { footer: <RecFeedbackLink /> } : {})}
          />
        );
      // M25 A5: each part the owner can switch on or off on its own (Admin › Discover).
      case 'pickedShows':
        return <ShowTiles title="Shows picked for you" caption="Picked for you" shows={model.pickedShows} onShow={page.showPage} />;
      case 'picks':
        return (
          <PicksSection
            items={model.picks as PickWithFaces[]}
            {...(view?.body.date ? { date: view.body.date } : {})}
            {...act}
            onQueue={(c) => void page.queue(c)}
            onPast={() => page.router.push({ pathname: '/picks/past', params: view?.body.date ? { before: view.body.date } : {} })}
            onDaily={() => page.router.push('/picks/daily')}
          />
        );
      case 'theirLikes':
        return <TheirLikes signedIn={listener !== undefined} />;
      case 'chart':
        return <ChartSection tabs={model.chart} {...act} onFull={() => page.router.push('/chart')} />;
      case 'categories':
        return view ? (
          <CategoryStrip
            onGenre={(id) => page.router.push({ pathname: '/category/[id]', params: { id: String(id) } })}
            onAll={page.allCategories}
            hidden={page.hiddenCats}
            onHide={page.hideCat}
          />
        ) : null;
      case 'shows':
        return <ShowTiles title="Popular shows" short="Popular" shows={popularShowTiles(model.shows)} onShow={page.showPage} />;
      case 'premium':
        return (
          <Box onLayout={markPremium}>
            <PremiumSection shows={model.premium} onShow={page.showPage} />
          </Box>
        );
      case 'video':
        return <VideoSection items={model.video} {...act} />;
      // Owner, 2026-10-05: "Shows listeners here follow" is no longer drawn. M21: the collections
      // come back only as topic-list cards, each opening its full list.
      case 'collections':
        return <TopicListCards lists={model.collections} />;
      case 'said':
        return <SaidSection items={model.said} now={nowMs()} {...act} />;
      case 'newShows':
        return <NewArrivalsSection items={model.arrivals} {...act} />;
      case 'hunt':
        return <TreasureHunt onOpen={act.onOpen} onPlay={act.onPlay} />;
    }
  };

  // Owner, 2026-10-04: the page appears whole — the loading mark until Discover and For You have
  // both had their first answer (or FIRST_PAINT_CAP_MS), then everything at once.
  if (!shown) {
    return (
      <Box className="flex-1 bg-void items-center justify-center">
        <Loader />
      </Box>
    );
  }

  return (
    <Box className="flex-1 bg-void">
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, glowShift]} testID="discover-glow-shift"><DiscoverGlow /></Animated.View>
      {/* The pull-to-refresh mark sits under the status bar, not behind it. */}
      <Box pointerEvents="none" className="absolute left-0 right-0" style={{ top: insets.top, height: 0 }}>{pull.backdrop}</Box>
      <Animated.ScrollView
        ref={scroller}
        contentContainerStyle={{ paddingTop: insets.top + MOSAIC_TOP, paddingBottom: ZONE_BOTTOM + ZONE_HEIGHT + TAB_PAGE_END }}
        refreshControl={pull.refreshControl}
        onScroll={onScroll}
        scrollEventThrottle={pull.scrollEventThrottle}
      >
        {view ? pull.inline : null}
        {view?.stale ? (
          <Box className="bg-raise border border-line" style={{ marginHorizontal: side, marginBottom: spacing.row, padding: spacing.row, borderRadius: spacing.section }}>
            <Type step="note" className="text-warn">
              Couldn't refresh — showing what was fetched {view.fetchedAt ? new Date(view.fetchedAt).toLocaleTimeString() : 'earlier'}.
            </Type>
          </Box>
        ) : null}
        <Box style={{ paddingBottom: DECK.bottom }}>
          <EdgeLabel label="Today's pick" top={30} />
          <DiscoverMosaic
            pick={pick}
            {...(view?.body.date ? { date: view.body.date } : {})}
            stats={pick ? act.stats?.[pick.episode.id] : undefined}
            hot={hot}
            tiles={tiles}
            offline={!view}
            actions={{
              onOpen: act.onOpen,
              onPlay: act.onPlay,
              onQueue: (c) => void page.queue(c),
              onPast: () => page.router.push({ pathname: '/picks/past', params: view?.body.date ? { before: view.body.date } : {} }),
              onHot: (m) => momentActions.playFull(m),
            }}
          />
        </Box>
        {!view && refreshing ? <Loader className="mt-section" /> : null}

        {/* M15 US5: the owner's order, hidden sections left out (`buildModel`). M25 A5: the
            category strip is a section of its own ("categories"), right after the chart by default. */}
        {model.order.map((id) => (
          <Fragment key={id}>{section(id)}</Fragment>
        ))}
        {view ? <MoreCategories onPress={allCategories} hidden={hiddenCats} onShow={showCat} /> : null}
      </Animated.ScrollView>

      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: colour.void, height: insets.top + CLOCK_SCRIM_EXTRA }, clockScrim]} testID="clock-scrim" />
      <Fade bottom={0} height={FADE_HEIGHT} />
      {/* The bottom zone: the title with today's date, then the search field. */}
      <Box pointerEvents="box-none" className="absolute left-0 right-0" style={{ bottom: ZONE_BOTTOM, paddingHorizontal: side, gap: spacing.row - 2, zIndex: 25 }}>
        <Animated.View style={title} pointerEvents="none">
          <Box className="flex-row items-end justify-between">
            <Type step="hero" className="text-text" accessibilityRole="header">Discover</Type>
            <Type step="mono" className="text-text3">{today()}</Type>
          </Box>
        </Animated.View>
        <TrendingSearchBar
          hints={hints}
          // `fromY`: where the field sits now, so Search can start its box here and move it up.
          // M17: Search opens IN PLACE over the tabs (not the `/search` route), so a page opened
          // from its results is an ordinary push with the edge swipe (src/ui/search/SearchOverlay.tsx).
          onOpen={openSearch}
          onScan={() => page.router.push('/scan')}
        />
      </Box>
      <NotInterestedSheet card={moreFor} onChoose={notInterested} onClose={() => page.setMoreFor(undefined)} />
    </Box>
  );
}
