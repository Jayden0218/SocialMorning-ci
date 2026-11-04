// Top shows in one category, with a category strip, sort, filter, subscribe buttons.
/**
 * One category (M10): the genre's top shows from Apple's chart, through the server
 * (`GET /v1/categories/:id`, cached there). Tapping a show opens its page. M12 FR-072: a strip
 * of every genre along the top switches in place (no new page per tap), and each row names the
 * show's newest episode.
 * Owner, 2026-10-01: Discover's "Categories" opens here (on the first genre) instead of the
 * page of choices; the page is titled "Categories" and the strip scrolls to the chosen genre.
 * Owner, 2026-10-01 (after the reference's category page): the strip is icon tiles with a
 * chevron that opens every genre as a grid; "All" / "Newest" chips and a "Not subscribed only"
 * switch sit under it; rows lose the rank number, show the newest episode in a grey box, and
 * carry a round subscribe button — the only subscribing here is the listener's own tap.
 *
 * M17 T058 (`Category-B`): "Categories" sits small in the back row and the chosen genre is the
 * serif page title, with the chevron (every genre as a grid) beside it; the strip is plain
 * words underlined in yellow; All / Newest are a pill track; the first show is a wide white
 * card and the rest are half-width cards, subscribe round in each card's corner. Same genres,
 * sort, filter, subscribe and show links; the strip still scrolls to the chosen genre.
 *
 * M21 T085 (FR-063): For you / Hot / Newest chips (For you puts shows you don't follow yet
 * first; Hot is the chart order; Newest as before); the list swipes left or right to the next
 * or previous category (one pan gesture that gives way to vertical scrolling); the chevron
 * opens a full-screen grid of every category in place of the sheet; every card shows two lines
 * about the show (its maker and its kinds — Apple's catalogue gives no description).
 *
 * M31 D-C (design-pulse2 `category--screen`, `category--all-sheet`; layout pattern Mosaic): a pushed page with the title bar low — the genre as
 * the title, "Categories" under it, and the grid circle ("All categories") that opens every genre as a 3-column sheet. Under the status bar:
 * the genre strip, the 44 track (For you · Hot · Newest), the order in words with "Not subscribed only" and its 46 x 28 switch, then the
 * Mosaic — the first show a light 2 x 3 card, the rest 1 x 2 tiles. The body is still the virtualised two-column FlatList (034): the
 * strip, the track and the lead card are its header, the "Couldn't load more" tile and the end line its footer; swiping the list moves to
 * the next genre as before. Every action stays; parts are in `src/ui/discover/CategoryParts.tsx`.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Image as RNImage, ScrollView } from "react-native";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import { runOnJS } from "react-native-reanimated";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { Pressable } from "@/ui/lib/pressable";
import { FlatList } from "@/ui/lib/flat-list";
import { Box } from "@/ui/lib/box";
import { Toggle } from "@/ui/kit/Toggle";
import { Loader } from "@/ui/kit/Loader";
import { PushedPage } from "@/ui/kit/PushedPage";
import { Type } from "@/ui/kit/Type";
import { ErrTile } from "@/ui/chat/blocks";
import { SegmentSwitch } from "@/ui/me/lists";
import { ME_MOSAIC } from "@/ui/me/mosaic";
import { ME_TYPE } from "@/ui/me/measures";
import { bodyTop } from "@/ui/discover/page-parts";
import { AllCategoriesSheet, CATEGORY, GenreStrip, LeadCard, ShowTile } from "@/ui/discover/CategoryParts";
import {
  cachedCategory,
  fetchCategory,
  firstCovers,
} from "@/discover/category-cache";
import { GENRES } from "@/discover/genres";
import {
  appendPage,
  categoryList,
  hasMoreAfter,
  neighbourGenre,
  swipeIndex,
  type CategorySort,
} from "@/discover/category-list";
import { tick } from "@/ui/kit/haptics";
import { hit, spacing } from "@/design";
import { useSafety } from "@/safety/context";
import type { CategoryShows, ShowCard } from "@/social/api";
import { useSocial } from "@/social/context";
import { useStores, useSubscriptionSync } from "@/ui/shell/providers";
import { EndOfList } from "@/ui/kit/EndOfList";

const TAP = { minHeight: hit.min };
/** The longest a category waits for its covers before showing the list anyway. */
const COVER_WAIT_MS = 3000;
/** A finger lifted with no fling: the swipe's category is picked after this pause. */
const SETTLE_MS = 150;
/** M32: the grid's rows — two tiles side by side (10 apart, in the 28 / 16 lane); a lone last tile stays half width. */
const COLUMNS = { gap: ME_MOSAIC.gap, marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right };
const CELL = { flex: 1, maxWidth: "50%" as const, marginBottom: ME_MOSAIC.gap };
const LANE = { marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right };
const GENRE_IDS = GENRES.map((g) => g.id);
/**
 * Owner, 2026-10-05: scrolling to the bottom loads the next 20 (`?page=N`) until the server says
 * there are no more. Page 0 is `state` (kept and refreshed as before); later pages live here.
 */
type More = {
  genreId: number;
  shows: ShowCard[];
  next: number;
  status: "idle" | "loading" | "error" | "end";
};
const freshMore = (genreId: number): More => ({
  genreId,
  shows: [],
  next: 1,
  status: "idle",
});
type State =
  | { kind: "loading" }
  | { kind: "ok"; body: CategoryShows }
  | { kind: "error" };

export default function CategoryScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ id: string }>();
  const [genreId, setGenreId] = useState(Number(params.id));
  const router = useRouter();
  const { api } = useSocial();
  const { hiddenFeeds } = useSafety();
  const stores = useStores();
  const subscriptionSync = useSubscriptionSync();
  // Owner, 2026-10-04: the kept list draws on the first frame; the fresh one replaces it.
  const keptState = (id: number): State => {
    const body = cachedCategory(stores.feedCache, id);
    return body ? { kind: "ok", body } : { kind: "loading" };
  };
  const [state, setState] = useState<State>(() => keptState(Number(params.id)));
  const [sort, setSort] = useState<CategorySort>("forYou");
  // M25 A2: the owner may choose the chip a category opens on; once the listener picks one, theirs stays.
  const sortPicked = useRef(false);
  const pickSort = (v: CategorySort) => {
    sortPicked.current = true;
    setSort(v);
  };
  const shownDefault =
    state.kind === "ok" ? state.body.defaultSort : undefined;
  useEffect(() => {
    if (!sortPicked.current) setSort(shownDefault ?? "forYou");
  }, [shownDefault]);
  const [notSubscribedOnly, setNotSubscribedOnly] = useState(false);
  const [more, setMore] = useState<More>(() => freshMore(Number(params.id)));
  const loadingMore = useRef<number | null>(null);
  const [picking, setPicking] = useState(false);
  const readSubscribed = useCallback(
    () => new Set(stores.subscriptions.list().map((s) => s.feedUrl)),
    [stores],
  );
  const [subscribed, setSubscribed] = useState<Set<string>>(readSubscribed);
  // A show page opened from here may subscribe or unsubscribe; re-read on coming back.
  useFocusEffect(
    useCallback(() => {
      setSubscribed(readSubscribed());
    }, [readSubscribed]),
  );

  const strip = useRef<ComponentRef<typeof ScrollView>>(null);
  const tileX = useRef(new Map<number, number>());
  const scrolled = useRef(false);
  // Owner, 2026-10-05: while the row is swiped by a finger the yellow line follows it (a tick
  // each time it moves on); the category under it is opened when the row stops.
  const [hover, setHover] = useState<number | undefined>(undefined);
  const hoverRef = useRef<number | undefined>(undefined);
  const dragging = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const followSwipe = (offset: number, maxOffset: number) => {
    if (!dragging.current) return;
    const g = GENRES[swipeIndex(offset, maxOffset, GENRES.length)];
    if (!g || g.id === (hoverRef.current ?? genreId)) return;
    hoverRef.current = g.id;
    setHover(g.id);
    tick();
  };
  const endSwipe = () => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = undefined;
    dragging.current = false;
    const id = hoverRef.current;
    hoverRef.current = undefined;
    setHover(undefined);
    // Picked where it stopped — no scroll back to the left edge (that would undo the swipe).
    if (id !== undefined && id !== genreId) setGenreId(id);
  };
  const showTile = (id: number, animated: boolean) => {
    const x = tileX.current.get(id);
    if (x !== undefined)
      strip.current?.scrollTo({ x: Math.max(0, x - 40), animated });
  };
  const pick = (id: number) => {
    setGenreId(id);
    showTile(id, true);
  };
  /** Owner, 2026-10-05: the chevron's list of every category (M21: a grid over the page). */
  const pickFromSheet = (id: number) => {
    setPicking(false);
    pick(id);
  };
  // M21 T085: a sideways swipe on the list moves to the neighbouring category.
  const swipeTo = (dx: number) => {
    const id = neighbourGenre(GENRE_IDS, genreId, dx);
    if (id !== undefined) {
      tick();
      pick(id);
    }
  };
  const listSwipe = usePanGesture({
    activeOffsetX: [-24, 24],
    failOffsetY: [-14, 14],
    onDeactivate: (e) => {
      "worklet";
      runOnJS(swipeTo)(e.translationX);
    },
  });

  useEffect(() => {
    let live = true;
    const shown = keptState(genreId);
    setState(shown);
    setMore(freshMore(genreId));
    loadingMore.current = null;
    fetchCategory(
      { api, cache: stores.feedCache, now: () => Date.now() },
      genreId,
    ).then(
      async (body) => {
        // Owner, 2026-10-04: a new category shows its covers when ready, not the letter tiles
        // first. With nothing kept, the covers of the first screen (9) are fetched before the
        // list appears; at most 3 s, then the list shows anyway. With a kept list on screen,
        // the fresh one swaps in at once.
        if (shown.kind === "loading") {
          await Promise.race([
            Promise.all(
              firstCovers(body).map((u) =>
                RNImage.prefetch(u).catch(() => false),
              ),
            ),
            new Promise((done) => setTimeout(done, COVER_WAIT_MS)),
          ]);
        }
        if (live) setState({ kind: "ok", body });
      },
      () => {
        // Offline with a kept list: keep showing it.
        if (live && shown.kind === "loading") setState({ kind: "error" });
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keptState reads the same store
  }, [api, genreId]);

  // The same store calls and push as the show page's Subscribe (app/show/[feedUrl].tsx,
  // toggleSubscription): local write first, the sync is fire-and-forget (M8 US1).
  const toggleSubscription = (feedUrl: string) => {
    if (stores.subscriptions.has(feedUrl)) stores.subscriptions.remove(feedUrl);
    else stores.subscriptions.add(feedUrl, Date.now());
    subscriptionSync.push();
    setSubscribed(readSubscribed());
  };

  const firstHasMore = state.kind === "ok" && hasMoreAfter(state.body);
  const ended =
    state.kind === "ok" &&
    more.genreId === genreId &&
    (more.status === "end" || (more.next === 1 && !firstHasMore));
  const loadMore = () => {
    if (state.kind !== "ok" || ended || loadingMore.current !== null) return;
    if (more.genreId !== genreId || more.status !== "idle") return;
    const id = genreId;
    const page = more.next;
    const first = state.body.shows;
    loadingMore.current = id;
    setMore((m) => ({ ...m, status: "loading" }));
    api.category(id, page).then(
      (body) =>
        setMore((m) =>
          m.genreId !== id
            ? m
            : {
                genreId: id,
                shows: appendPage(m.shows, body.shows),
                next: page + 1,
                // Owner, 2026-10-05: a page that adds no new show is the end too — a server
                // that ignores `page` answers the first 20 again for ever.
                status:
                  appendPage(appendPage(first, m.shows), body.shows).length >
                    appendPage(first, m.shows).length &&
                  hasMoreAfter(body)
                    ? "idle"
                    : "end",
              },
        ),
      () =>
        setMore((m) => (m.genreId !== id ? m : { ...m, status: "error" })),
    ).finally(() => {
      if (loadingMore.current === id) loadingMore.current = null;
    });
  };

  const now = Date.now();
  const visible =
    state.kind === "ok"
      ? appendPage(
          state.body.shows,
          more.genreId === genreId ? more.shows : [],
        ).filter((s) => !hiddenFeeds.has(s.feedUrl))
      : [];
  const shows = categoryList(visible, {
    sort,
    notSubscribedOnly,
    subscribed,
    // M25 A2: the owner's pins keep their place under For you, Hot and Newest.
    pinned: state.kind === "ok" ? (state.body.pinned ?? []) : [],
  });
  const [lead, ...rest] = shows;

  const open = (feedUrl: string) =>
    router.push({
      pathname: "/show/[feedUrl]",
      params: { feedUrl: encodeURIComponent(feedUrl) },
    });
  const genre = GENRES.find((g) => g.id === genreId);
  const lit = hover ?? genreId;

  return (
    <>
      <PushedPage
        title={genre?.name ?? "Categories"}
        subtitle="Categories"
        actions={[{ icon: "grid-outline", label: "All categories", onPress: () => setPicking(true) }]}
      >
        {(layout) => (
          /* M32 T030 (review C5): the grid is a FlatList (a window of rows is mounted, not every loaded page). */
          <GestureDetector gesture={listSwipe}>
            <Box className="flex-1" style={{ paddingTop: bodyTop(layout) }}>
              <FlatList
                data={rest}
                keyExtractor={(s: ShowCard) => s.feedUrl}
                numColumns={2}
                columnWrapperStyle={COLUMNS}
                contentContainerStyle={{ paddingBottom: layout.reserve }}
                initialNumToRender={8}
                maxToRenderPerBatch={8}
                windowSize={5}
                onEndReachedThreshold={0.6}
                onEndReached={loadMore}
                renderItem={({ item }: { item: ShowCard }) => (
                  <Box style={CELL}>
                    <ShowTile
                      show={item}
                      subscribed={subscribed.has(item.feedUrl)}
                      now={now}
                      onOpen={() => open(item.feedUrl)}
                      onToggle={() => toggleSubscription(item.feedUrl)}
                    />
                  </Box>
                )}
                ListHeaderComponent={
                  <>
                    {/* Owner, 2026-10-05: the sliding row of categories is how a category is chosen; the grid circle in the title bar lists them all. */}
                    <GenreStrip
                      genreId={genreId}
                      lit={lit}
                      onPick={pick}
                      scrollRef={strip}
                      onTileLayout={(id, x, chosen) => {
                        tileX.current.set(id, x);
                        if (chosen && !scrolled.current) {
                          scrolled.current = true;
                          showTile(id, false);
                        }
                      }}
                      scrollProps={{
                        onScrollBeginDrag: () => {
                          if (settle.current) clearTimeout(settle.current);
                          dragging.current = true;
                        },
                        onScroll: (e) => {
                          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                          followSwipe(contentOffset.x, contentSize.width - layoutMeasurement.width);
                        },
                        onScrollEndDrag: () => {
                          // A fling goes on (momentum begins and cancels this); a plain lift ends here.
                          settle.current = setTimeout(endSwipe, SETTLE_MS);
                        },
                        onMomentumScrollBegin: () => {
                          if (settle.current) clearTimeout(settle.current);
                          settle.current = undefined;
                        },
                        onMomentumScrollEnd: () => {
                          if (dragging.current) endSwipe();
                        },
                      }}
                    />
                    {/* The 44 track: For you · Hot · Newest. */}
                    <Box style={[LANE, { marginTop: CATEGORY.rowGap, marginBottom: CATEGORY.rowGap }]}>
                      <SegmentSwitch
                        items={[
                          { value: "forYou", label: "For you", accessibilityLabel: "For you, shows you don't follow first" },
                          { value: "all", label: "Hot", accessibilityLabel: "Hot, chart order" },
                          { value: "newest", label: "Newest", accessibilityLabel: "Newest episodes first" },
                        ] as const}
                        value={sort}
                        onChange={pickSort}
                      />
                    </Box>
                    {/* The order in words, and the filter with its 46 x 28 switch. */}
                    <Box className="flex-row items-center" style={[LANE, { marginBottom: CATEGORY.rowGap, gap: ME_MOSAIC.gap }]}>
                      <Type step="caption" className="text-text3 flex-1" style={ME_TYPE.node12} numberOfLines={2}>
                        {sort === "newest" ? "By latest update" : sort === "forYou" ? "New to you first" : "Recommended by us"}
                      </Type>
                      <Type step="caption" className="text-text2" style={ME_TYPE.node12}>Not subscribed only</Type>
                      <Toggle value={notSubscribedOnly} onChange={setNotSubscribedOnly} label="Not subscribed only" />
                    </Box>
                    {state.kind === "loading" ? <Loader className="my-section" /> : null}
                    {state.kind === "error" ? <ErrTile line="Couldn't load this category right now." /> : null}
                    {state.kind === "ok" && state.body.stale ? (
                      <Type step="caption" className="text-hotText" style={[LANE, { marginBottom: spacing.row }]}>
                        Couldn't refresh — showing an earlier list.
                      </Type>
                    ) : null}
                    {state.kind === "ok" && shows.length === 0 ? (
                      <Type step="caption" className="text-text2" style={LANE}>
                        {visible.length > 0 && notSubscribedOnly
                          ? "You're subscribed to every show here."
                          : "No shows here yet."}
                      </Type>
                    ) : null}
                    {lead ? (
                      <Box style={{ marginBottom: ME_MOSAIC.gap }}>
                        <LeadCard
                          show={lead}
                          subscribed={subscribed.has(lead.feedUrl)}
                          now={now}
                          onOpen={() => open(lead.feedUrl)}
                          onToggle={() => toggleSubscription(lead.feedUrl)}
                        />
                      </Box>
                    ) : null}
                  </>
                }
                ListFooterComponent={
                  <>
                    {state.kind === "ok" && visible.length > 0 ? (
                      more.status === "loading" ? (
                        <Loader className="my-section" />
                      ) : more.status === "error" ? (
                        <Pressable
                          onPress={() => {
                            setMore((m) => ({ ...m, status: "idle" }));
                            // The state above lands on the next render; load from there.
                            setTimeout(loadMore, 0);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Couldn't load more — tap to try again."
                          style={TAP}
                        >
                          <ErrTile line="Couldn't load more — tap to try again." />
                        </Pressable>
                      ) : ended ? (
                        <EndOfList />
                      ) : null
                    ) : null}
                  </>
                }
              />
            </Box>
          </GestureDetector>
        )}
      </PushedPage>
      {/* M21 T085: every category as a grid, now in a sheet (design-pulse2 `category--all-sheet`). */}
      <AllCategoriesSheet open={picking} genreId={genreId} onPick={pickFromSheet} onClose={() => setPicking(false)} />
    </>
  );
}
