// Discover, the first screen: search box, shortcuts, picks, For You, charts, categories.
/**
 * Discover — the first tab and the screen the app opens on (M10, owner 2026-09-27),
 * laid out after the reference the owner chose: a large title, a search box, shortcut
 * chips, then the sections top to bottom.
 *
 * Kept from M5/M8: works signed out (For You simply is not there); the last copy shows at
 * once and offline, marked stale; pull to refresh; opening a card resolves it through its
 * feed without subscribing (research R8). New: every row plays from its round button.
 *
 * M17 (`Home-B`, `Discover-B`): today's date as an eyebrow over a 32 pt serif "Discover";
 * the stale notice is a bordered white card. The sections themselves are restyled in
 * `src/ui/discover/{parts,sections}.tsx`; order, data, pull to refresh and every action stay.
 *
 * M21 US7 (T082–T084): the serif title fades as the page scrolls and a small bar takes its place
 * with the title and the search button (reanimated scroll handler + interpolate); pressing the
 * Discover tab again scrolls to the top (`useScrollToTop`). The shortcuts add Academy, Premium
 * (scrolls to "Premium picks") and the Plaza; category tiles can be hidden with × and brought
 * back under "Explore more categories"; picks show faces of people you follow who liked them;
 * "Shows picked for you" (from For You), topic lists, the treasure hunt and "Their likes" join
 * the page. The treasure hunt, the plaza and like posts are OUR OWN DESIGN (owner, 2026-10-06).
 */
import { useRouter, useScrollToTop } from "expo-router";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { LayoutChangeEvent, ScrollView as RNScrollView } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { Pressable } from "@/ui/lib/pressable";
import { Image } from "@/ui/lib/image";
import { SafeAreaView } from "@/ui/lib/safe-area-view";
import { Text } from "@/ui/lib/text";
import { Box } from "@/ui/lib/box";
import { colour, hit } from "@/design";
import { GENRES } from "@/discover/genres";
import { buildModel, sectionOrder, type SectionId } from "@/discover/sections";
import { HINT_EVERY_MS, hintAt, trendingHints } from "@/discover/trending";
import { Loader } from "@/ui/kit/Loader";
import { usePullRefresh } from "@/ui/kit/PullRefresh";
import { useDiscover } from "@/discover/useDiscover";
import { useForYou } from "@/recs/useForYou";
import { RecFeedbackLink } from "@/ui/discover/RecFeedback";
import { useFirstPaint } from "@/discover/first-paint";
import { useRecOutbox } from "@/recs/useRecOutbox";
import { useSafety } from "@/safety/context";
import { useSocial } from "@/social/context";
import { useStores, useToast } from "@/ui/shell/providers";
import { TAB_PAGE_END } from "@/ui/kit/Screen";
import { Eyebrow } from "@/ui/kit/Eyebrow";
import { SearchBar } from "@/ui/discover/parts";
import { useSearchOverlay } from "@/ui/search/SearchOverlay";
import {
  CategoryStrip,
  ChartSection,
  ForYouSection,
  MoreCategories,
  NewArrivalsSection,
  PicksSection,
  PremiumSection,
  SaidSection,
  ShowTiles,
  Shortcuts,
  popularShowTiles,
  VideoSection,
} from "@/ui/discover/sections";
import { useRowStats } from "@/discover/row-stats";
import { keyFor, useDismissals } from "@/recs/dismissals";
import { HiddenNotice, NotInterestedSheet } from "@/ui/discover/NotInterested";
import { TreasureHunt } from "@/ui/discover/TreasureHunt";
import { TheirLikes } from "@/ui/discover/TheirLikes";
import { TopicListCards } from "@/ui/discover/TopicLists";
import { Icon } from "@/ui/kit/Icon";
import { useColours } from "@/ui/kit/useColours";
import { hideCategory, readHiddenCategories, showCategory } from "@/discover/hidden-categories";
import type { PickWithFaces } from "@/discover/explore-api";
import type { EpisodeCard } from "@/social/api";
import type { DismissalKind } from "@/social/profile-api";

/** M19 T021: how long "Hidden · Undo" stays under For You. */
const UNDO_MS = 8000;

const ICON = { width: 36, height: 36 };
const TAP = { minHeight: hit.min, minWidth: hit.min };
/** M21: how far the page scrolls before the big title has gone and the small bar shows. */
const COLLAPSE_FROM = 24;
const COLLAPSE_TO = 72;
const BAR = { position: "absolute" as const, top: 0, left: 0, right: 0 };
/** "Thursday, 2 October" — the eyebrow over the title (`Home-B`), from the phone's clock. */
const today = (): string =>
  new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

export default function DiscoverScreen(): React.ReactElement {
  const router = useRouter();
  const stores = useStores();
  const c = useColours(stores.settings);
  // M21 T082: the tab pressed again scrolls back to the top; the title collapses into a bar.
  const scroller = useRef<React.ComponentRef<typeof RNScrollView>>(null);
  useScrollToTop(scroller);
  const scrollY = useSharedValue(0);
  const [collapsed, setCollapsed] = useState(false);
  const premiumY = useRef<number | undefined>(undefined);
  const [hiddenCats, setHiddenCats] = useState<number[]>(() => readHiddenCategories(stores.settings));
  const search = useSearchOverlay();
  const { view, refreshing, refresh, open, play, queue, settled } = useDiscover();
  const { listener } = useSocial();
  const { sets, hiddenFeeds, version } = useSafety();
  const forYou = useForYou(listener !== undefined);
  // M15 US5: a For You the owner hid is not drawn, so it records no impressions either.
  const forYouOn = sectionOrder(view?.body.layout).includes("forYou");
  const outbox = useRecOutbox(
    listener !== undefined,
    forYouOn ? forYou.view?.body.items : undefined,
  );
  const refreshBoth = async (): Promise<void> => {
    await Promise.all([refresh(), forYou.refresh()]);
  };
  // M19 T021: "Not interested" — a row the listener turned down leaves For You at once.
  const dismissals = useDismissals();
  const toast = useToast();
  const [moreFor, setMoreFor] = useState<EpisodeCard | undefined>();
  const [undo, setUndo] = useState<{ kind: DismissalKind; key: string } | undefined>();
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(undoTimer.current), []);
  const model = useMemo(
    () => {
      const m = buildModel(view?.body, forYou.view?.body, {
        feeds: hiddenFeeds,
        blocked: sets.blocked,
      });
      return { ...m, forYou: m.forYou.filter((r) => !dismissals.isDismissed(r.card)) };
    },
    // `version` bumps on every local report/block, so a hidden row leaves at once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, forYou.view, hiddenFeeds, sets, version, dismissals.isDismissed],
  );
  const notInterested = (kind: DismissalKind, card: EpisodeCard): void => {
    setMoreFor(undefined);
    const key = keyFor(kind, card);
    dismissals.dismiss(kind, key, kind === "episode" ? card.title : card.showTitle).catch(() => {
      setUndo(undefined);
      toast("Couldn't hide that — try again.");
    });
    setUndo({ kind, key });
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(undefined), UNDO_MS);
  };
  const undoHide = (): void => {
    if (!undo) return;
    clearTimeout(undoTimer.current);
    setUndo(undefined);
    dismissals.restore(undo.kind, undo.key).catch(() => toast("Couldn't undo — try again in Settings."));
  };
  // The search box's middle cycles through what is trending (owner, 2026-09-27).
  const hints = useMemo(() => trendingHints(model.chart), [model]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (hints.length < 2) return;
    const t = setInterval(() => setTick((n) => n + 1), HINT_EVERY_MS);
    return () => clearInterval(t);
  }, [hints]);
  const hint = hintAt(hints, tick);
  const showPage = (feedUrl: string) =>
    router.push({
      pathname: "/show/[feedUrl]",
      params: { feedUrl: encodeURIComponent(feedUrl) },
    });
  // Owner, 2026-10-01: "Categories" opens the genre strip with the first genre's list under it,
  // not the page of genre choices.
  const allCategories = () =>
    router.push({
      pathname: "/category/[id]",
      params: { id: String(GENRES[0]!.id) },
    });
  const pull = usePullRefresh(refreshing, () => void refreshBoth());
  // The pull-to-refresh backdrop still hears every scroll; the shared value drives the title.
  const pullScroll = pull.onScroll as unknown as (e: { nativeEvent: { contentOffset: { y: number } } }) => void;
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      runOnJS(pullScroll)({ nativeEvent: { contentOffset: { y: e.contentOffset.y } } });
    },
  });
  useAnimatedReaction(
    () => scrollY.value > COLLAPSE_TO - 8,
    (now, before) => {
      if (now !== before) runOnJS(setCollapsed)(now);
    },
  );
  const bigTitle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [COLLAPSE_FROM, COLLAPSE_TO], [1, 0], Extrapolation.CLAMP),
  }));
  const smallBar = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [COLLAPSE_FROM, COLLAPSE_TO], [0, 1], Extrapolation.CLAMP),
  }));
  const openSearch = (fromY: number): void =>
    search.open({ fromY: Math.round(fromY), ...(hint ? { hint } : {}) });
  const toPremium = (): void => {
    if (premiumY.current === undefined) return;
    scroller.current?.scrollTo({ y: Math.max(0, premiumY.current - 56), animated: true });
  };
  const markPremium = (e: LayoutChangeEvent): void => {
    premiumY.current = e.nativeEvent.layout.y;
  };
  const hideCat = (id: number): void => setHiddenCats(hideCategory(stores.settings, id));
  const showCat = (id: number): void => setHiddenCats(showCategory(stores.settings, id));
  // M21: "Shows picked for you" — the shows behind the listener's own For You, each once.
  const pickedShows = useMemo(() => {
    const seen = new Set<string>();
    const out: { feedUrl: string; title: string; imageUrl?: string; line?: string }[] = [];
    for (const r of model.forYou) {
      if (seen.has(r.card.feedUrl)) continue;
      seen.add(r.card.feedUrl);
      out.push({ feedUrl: r.card.feedUrl, title: r.card.showTitle, ...(r.card.imageUrl ? { imageUrl: r.card.imageUrl } : {}) });
    }
    return out.slice(0, 10);
  }, [model]);
  const shown = useFirstPaint(settled && forYou.settled);
  // Owner, 2026-10-05: "12 listened · 3 comments" under every episode on the page — one call.
  const stats = useRowStats(model);
  const act = {
    onOpen: (c: Parameters<typeof open>[0]) => void open(c),
    onPlay: (c: Parameters<typeof play>[0]) => void play(c),
    stats,
  };
  const categoryStrip = view ? (
    <CategoryStrip
      onGenre={(id) =>
        router.push({ pathname: "/category/[id]", params: { id: String(id) } })
      }
      onAll={allCategories}
      hidden={hiddenCats}
      onHide={hideCat}
    />
  ) : null;
  const section = (id: SectionId): React.ReactNode => {
    switch (id) {
      case "forYou":
        return (
          <>
          <ForYouSection
            rows={model.forYou}
            {...act}
            onOpenAt={(c, index) => {
              outbox.opened(index);
              void open(c);
            }}
            {...(listener ? { onMore: setMoreFor } : {})}
            {...(undo ? { notice: <HiddenNotice kind={undo.kind} onUndo={undoHide} /> } : {})}
          />
          {/* M22 US5 (FR-019): "Not liking these?" under For You. */}
          {listener && model.forYou.length > 0 ? <RecFeedbackLink /> : null}
          <ShowTiles title="Shows picked for you" shows={pickedShows} onShow={showPage} />
          </>
        );
      case "picks":
        return (
          <>
          <PicksSection
            items={model.picks as PickWithFaces[]}
            {...(view?.body.date ? { date: view.body.date } : {})}
            {...act}
            onQueue={(c) => void queue(c)}
            onPast={() =>
              router.push({
                pathname: "/picks/past",
                params: view?.body.date ? { before: view.body.date } : {},
              })
            }
            onDaily={() => router.push("/picks/daily")}
          />
          <TheirLikes signedIn={listener !== undefined} />
          </>
        );
      case "chart":
        return (
          <ChartSection
            tabs={model.chart}
            {...act}
            onFull={() => router.push("/chart")}
          />
        );
      case "shows":
        return (
          <>
            <ShowTiles
              title="Popular shows"
              shows={popularShowTiles(model.shows)}
              onShow={showPage}
            />
            <Box onLayout={markPremium}>
              <PremiumSection shows={model.premium} onShow={showPage} />
            </Box>
          </>
        );
      case "video":
        return <VideoSection items={model.video} {...act} />;
      // Owner, 2026-10-05: "Shows listeners here follow" is no longer drawn. M21: the collections
      // come back only as topic-list cards, each opening its full list.
      case "collections":
        return <TopicListCards lists={model.collections} />;
      case "followedHere":
        return null;
      case "said":
        return <SaidSection items={model.said} now={Date.now()} {...act} />;
      case "newShows":
        return (
          <>
            <NewArrivalsSection items={model.arrivals} {...act} />
            <TreasureHunt onOpen={act.onOpen} onPlay={act.onPlay} />
          </>
        );
    }
  };

  // Owner, 2026-10-04: the page appears whole — the loading mark until Discover and For You have
  // both had their first answer (or FIRST_PAINT_CAP_MS), then everything at once.
  if (!shown) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <Loader />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <Box className="flex-1">
        {pull.backdrop}
        <Animated.ScrollView
          ref={scroller}
          contentContainerStyle={{ paddingBottom: TAB_PAGE_END }}
          refreshControl={pull.refreshControl}
          onScroll={onScroll}
          scrollEventThrottle={pull.scrollEventThrottle}
        >
          {view ? pull.inline : null}
          {/* Owner, 2026-09-27: less space above the title. */}
          {/* Owner, 2026-10-04: the app icon centred on the date + title block (was aligned to its bottom). */}
          <Animated.View style={bigTitle}>
          <Box className="flex-row items-center justify-between px-screen-x pt-1 pb-row">
            <Box className="flex-1">
              <Eyebrow>{today()}</Eyebrow>
              {/* Owner, 2026-10-04/05: less space between the date and the title — pulled up 8 pt (the
                  serif's own line height stays: any less and Android cuts off its descenders). */}
              <Text
                className="text-text text-display font-display -mt-2"
                accessibilityRole="header"
              >
                Discover
              </Text>
            </Box>
            <Image
              source={require("../../assets/app-icon.png")}
              style={ICON}
              // Owner, 2026-10-04: less round — every app icon's corner is 22 % of its size, like
              // Apple's icon shape (36 → 8; sign-in 72 → 16, About 64 → 14, Terms 60 → 13, launch 34 → 8).
              className="rounded-[8px]"
              accessibilityIgnoresInvertColors
              accessibilityLabel="SocialNet"
            />
          </Box>
          </Animated.View>
          <SearchBar
            {...(hint ? { hint } : {})}
            // `fromY`: where the bar sits now, so Search can start its box here and move it up.
            // M17: Search opens IN PLACE over the tabs (not the `/search` route), so a page opened
            // from its results is an ordinary push with the edge swipe (src/ui/search/SearchOverlay.tsx).
            onPress={(fromY) => openSearch(fromY)}
            onScan={() => router.push("/scan")}
          />
          <Shortcuts
            items={[
              {
                label: "Categories",
                icon: "grid-outline",
                onPress: allCategories,
              },
              // Owner, 2026-10-04: no Inbox tile — it showed what Updates shows.
              // Owner, 2026-10-05: no Downloads tile — Downloads stays in Settings.
              {
                label: "Queue",
                icon: "list-outline",
                onPress: () => router.push("/queue"),
              },
              // M12 FR-101, FR-102
              {
                label: "Issues",
                icon: "newspaper-outline",
                onPress: () => router.push("/issues"),
              },
              {
                label: "Friends listening",
                icon: "people-outline",
                onPress: () => router.push("/friends-listening"),
              },
              // M21 T082 (FR-061): Academy, Premium (the "Premium picks" section) and the Plaza.
              {
                label: "Academy",
                icon: "school-outline",
                onPress: () => router.push("/academy"),
              },
              {
                label: "Premium",
                icon: "diamond-outline",
                onPress: toPremium,
              },
              {
                label: "Plaza",
                icon: "apps-outline",
                onPress: () => router.push("/plaza"),
              },
            ]}
          />

          {view?.stale ? (
            <Text className="text-accent bg-surface border border-border mx-screen-x mt-row p-row rounded-row text-body">
              Couldn't refresh — showing what was fetched{" "}
              {view.fetchedAt
                ? new Date(view.fetchedAt).toLocaleTimeString()
                : "earlier"}
              .
            </Text>
          ) : null}
          {!view ? (
            refreshing ? (
              <Loader className="mt-section" />
            ) : (
              <Text className="text-muted text-sm px-screen-x mt-section">
                Couldn't reach the server, and nothing is cached yet.
              </Text>
            )
          ) : null}

          {/* M15 US5: the owner's order, hidden sections left out (`buildModel`). The category
            strip follows the chart, or leads when the chart is hidden. */}
          {model.order.includes("chart") ? null : categoryStrip}
          {model.order.map((id) => (
            <Fragment key={id}>
              {section(id)}
              {id === "chart" ? categoryStrip : null}
            </Fragment>
          ))}
          {view ? <MoreCategories onPress={allCategories} hidden={hiddenCats} onShow={showCat} /> : null}
        </Animated.ScrollView>
        {/* M21 T082: the small bar the title collapses into — the name and the search button. */}
        <Animated.View
          style={[BAR, smallBar]}
          pointerEvents={collapsed ? "auto" : "none"}
          accessibilityElementsHidden={!collapsed}
          importantForAccessibility={collapsed ? "auto" : "no-hide-descendants"}
        >
          <Box className="flex-row items-center justify-between px-screen-x bg-background border-b-hairline border-separator">
          <Text className="text-text text-lg font-display" numberOfLines={1}>Discover</Text>
          <Pressable
            onPress={() => openSearch(0)}
            accessibilityRole="search"
            accessibilityLabel={hint ? `Search. Trending: ${hint}` : "Search shows and episodes"}
            className="items-center justify-center"
            style={TAP}
          >
            <Icon name="search-outline" size={22} color={c.text} />
          </Pressable>
          </Box>
        </Animated.View>
      </Box>
      <NotInterestedSheet card={moreFor} onChoose={notInterested} onClose={() => setMoreFor(undefined)} />
    </SafeAreaView>
  );
}
