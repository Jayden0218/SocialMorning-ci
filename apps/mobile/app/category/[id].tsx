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
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Image as RNImage, ScrollView, useWindowDimensions } from "react-native";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import { Pressable } from "@/ui/lib/pressable";
import { Text } from "@/ui/lib/text";
import { Box } from "@/ui/lib/box";
import { Segmented } from "@/ui/kit/Segmented";
import { Toggle } from "@/ui/kit/Toggle";
import { Loader } from "@/ui/kit/Loader";
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
  swipeIndex,
  type CategorySort,
} from "@/discover/category-list";
import {
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicator,
  ActionsheetDragIndicatorWrapper,
} from "@/ui/lib/actionsheet";
import { SheetRow } from "@/ui/kit/SheetRow";
import { tick } from "@/ui/kit/haptics";
import { hit } from "@/design";
import { ago } from "@/discover/sections";
import { useSafety } from "@/safety/context";
import type { CategoryShows, ShowCard } from "@/social/api";
import { useSocial } from "@/social/context";
import { useStores, useSubscriptionSync } from "@/ui/shell/providers";
import { useColours } from "@/ui/kit/useColours";
import { Icon } from "@/ui/kit/Icon";
import { Artwork } from "@/ui/kit/Artwork";
import { Card } from "@/ui/kit/Card";
import { Screen } from "@/ui/kit/Screen";
import { PageHeader } from "@/ui/kit/PageHeader";

const TAP = { minHeight: hit.min };
const ROUND = { width: hit.min, height: hit.min };
/** Owner, 2026-10-04: the half card's plus is smaller (32 pt; 8 pt hitSlop keeps a 48 pt tap). */
const ROUND_SMALL = { width: 32, height: 32 };
/** The half card's cover; the + row laid over the card leaves a gap this size for it. */
const HALF_ART = 72;
const SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
/** The longest a category waits for its covers before showing the list anyway. */
const COVER_WAIT_MS = 3000;
/** The chevron over the category row's right end: a 48 pt tap plus room each side. */
const CHEVRON_W = hit.min + 16;
const CHEVRON = { width: CHEVRON_W, zIndex: 1 };
/** A finger lifted with no fling: the swipe's category is picked after this pause. */
const SETTLE_MS = 150;
/** How near the bottom (pt) the next page starts loading. */
const LOAD_AHEAD = 600;
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
  const c = useColours(stores.settings);
  // Owner, 2026-10-04: the kept list draws on the first frame; the fresh one replaces it.
  const keptState = (id: number): State => {
    const body = cachedCategory(stores.feedCache, id);
    return body ? { kind: "ok", body } : { kind: "loading" };
  };
  const [state, setState] = useState<State>(() => keptState(Number(params.id)));
  const [sort, setSort] = useState<CategorySort>("all");
  const [notSubscribedOnly, setNotSubscribedOnly] = useState(false);
  const [more, setMore] = useState<More>(() => freshMore(Number(params.id)));
  const loadingMore = useRef<number | null>(null);
  const [picking, setPicking] = useState(false);
  const { height: screenHeight } = useWindowDimensions();
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
  /** Owner, 2026-10-05: the chevron's list of every category. */
  const pickFromSheet = (id: number) => {
    setPicking(false);
    pick(id);
  };

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
                status:
                  body.shows.length > 0 && hasMoreAfter(body) ? "idle" : "end",
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
  const shows = categoryList(visible, { sort, notSubscribedOnly, subscribed });
  const [lead, ...rest] = shows;
  const pairs: ShowCard[][] = [];
  for (let i = 0; i < rest.length; i += 2) pairs.push(rest.slice(i, i + 2));

  /** One show: the first is the wide card, the rest half-width; subscribe sits top right on both. */
  const showCard = (s: ShowCard, wide: boolean): React.ReactElement => {
    const on = subscribed.has(s.feedUrl);
    const ep = s.latestEpisode;
    return (
      <Card
        key={s.feedUrl}
        padded={false}
        className={wide ? "mb-row" : "flex-1"}
      >
        {/* Owner, 2026-10-04 ("I press a podcast and can't go in"): the whole card is the tap
            area — the padding and the empty space under a shorter half card used to sit outside it. */}
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/show/[feedUrl]",
              params: { feedUrl: encodeURIComponent(s.feedUrl) },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`${s.title}, ${s.author}${ep ? `. Newest: ${ep.title}` : ""}`}
          className={
            wide
              ? "flex-row items-center gap-section p-section pr-16"
              : "flex-1 items-center gap-1 p-row"
          }
          style={TAP}
        >
          {wide ? (
            <Artwork url={s.imageUrl} size={100} rounded="row" name={s.title} />
          ) : (
            /* Owner, 2026-10-05: the half card's + sits in a row with the cover, the space
               shared out equally. The + is drawn by the same row laid over the card (below),
               so the whole card stays one tap and the + its own; this gap holds its place. */
            <Box className="self-stretch flex-row items-center justify-evenly">
              <Artwork url={s.imageUrl} size={HALF_ART} rounded="row" name={s.title} />
              <Box style={ROUND_SMALL} />
            </Box>
          )}
          {/* Owner, 2026-10-04: everything in a half card sits in the middle. */}
          <Box className={wide ? "flex-1" : "self-stretch items-center"}>
            {/* Owner, 2026-10-04: names were cut off with "…" — a line more for each (title 3, author 2, episode 3). */}
            {/* Owner, 2026-10-04: smaller titles: 17 pt wide, 13 pt half (were 20 and 14). */}
            <Text
              className={
                wide
                  ? "text-text text-title font-display"
                  : "text-text text-meta font-bold mt-1 text-center"
              }
              numberOfLines={3}
            >
              {s.title}
            </Text>
            <Text
              className={`text-muted text-xs ${wide ? "" : "text-center"}`}
              numberOfLines={2}
            >
              {s.author}
            </Text>
            {ep ? (
              /* Owner, 2026-10-04: the first card's newest episode sits in the same tinted box as
                 the others, with no play mark. */
              <Box className="self-stretch bg-background rounded-row p-2 mt-2">
                <Text
                  className={`text-muted text-xs ${wide ? "" : "text-center"}`}
                  numberOfLines={3}
                >
                  {ep.publishedAt ? `${ago(ep.publishedAt, now)} · ` : ""}
                  {ep.title}
                </Text>
              </Box>
            ) : null}
          </Box>
        </Pressable>
        {wide ? (
          /* Owner, 2026-10-05: the wide card's button is always a + on yellow, never a tick. */
          <Box className="absolute top-2 right-2">
            <Pressable
              onPress={() => toggleSubscription(s.feedUrl)}
              accessibilityRole="button"
              accessibilityLabel={
                on ? `Unsubscribe from ${s.title}` : `Subscribe to ${s.title}`
              }
              accessibilityState={{ selected: on }}
              className="items-center justify-center rounded-pill bg-primary"
              style={ROUND}
            >
              <Icon name="add" size={22} color={c.onPrimary} />
            </Pressable>
          </Box>
        ) : (
          <Box
            pointerEvents="box-none"
            className="absolute top-0 left-0 right-0 p-row flex-row items-center justify-evenly"
          >
            <Box pointerEvents="none" style={{ width: HALF_ART, height: HALF_ART }} />
            <Pressable
              onPress={() => toggleSubscription(s.feedUrl)}
              accessibilityRole="button"
              accessibilityLabel={
                on ? `Unsubscribe from ${s.title}` : `Subscribe to ${s.title}`
              }
              accessibilityState={{ selected: on }}
              className={`items-center justify-center rounded-pill ${on ? "bg-surface border border-border" : "bg-primary"}`}
              style={ROUND_SMALL}
              hitSlop={SLOP}
            >
              <Icon name={on ? "checkmark" : "add"} size={18} color={on ? c.muted : c.onPrimary} />
            </Pressable>
          </Box>
        )}
      </Card>
    );
  };

  return (
    <>
      <PageHeader title="Categories" />
      <Screen
        scroll
        // Owner, 2026-10-05: the category row stays at the top while the list scrolls.
        stickyHeaderIndices={[0]}
        scrollEventThrottle={100}
        onScroll={(e) => {
          const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - LOAD_AHEAD)
            loadMore();
        }}
      >
        {/* Owner, 2026-10-04: no large category title and no list under it — the sliding row of
          categories below is how a category is chosen. Owner, 2026-10-05: a chevron fixed at its
          right opens every category as a list, wherever the row has scrolled. */}
        <Box className="-mx-screen-x bg-background border-b-hairline border-separator mb-gap">
          <ScrollView
            ref={strip}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-5 pl-screen-x"
            contentContainerStyle={{ paddingRight: CHEVRON_W }}
            scrollEventThrottle={16}
            onScrollBeginDrag={() => {
              if (settle.current) clearTimeout(settle.current);
              dragging.current = true;
            }}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              followSwipe(contentOffset.x, contentSize.width - layoutMeasurement.width);
            }}
            onScrollEndDrag={() => {
              // A fling goes on (momentum begins and cancels this); a plain lift ends here.
              settle.current = setTimeout(endSwipe, SETTLE_MS);
            }}
            onMomentumScrollBegin={() => {
              if (settle.current) clearTimeout(settle.current);
              settle.current = undefined;
            }}
            onMomentumScrollEnd={() => {
              if (dragging.current) endSwipe();
            }}
          >
            {GENRES.map((g) => {
              const on = g.id === genreId;
              const lit = g.id === (hover ?? genreId);
              return (
                <Pressable
                  key={g.id}
                  onPress={() => pick(g.id)}
                  onLayout={(e) => {
                    tileX.current.set(g.id, e.nativeEvent.layout.x);
                    if (on && !scrolled.current) {
                      scrolled.current = true;
                      showTile(g.id, false);
                    }
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={g.name}
                  className="justify-center"
                  style={TAP}
                >
                  {/* Owner, 2026-10-04: the yellow line sits just under the word (it was at the foot of
                    the 48 pt tap area, about 14 pt below). */}
                  <Box>
                    <Text
                      className={
                        lit
                          ? "text-text text-body font-bold"
                          : "text-muted text-body"
                      }
                      numberOfLines={1}
                    >
                      {g.name}
                    </Text>
                    {/* A bar with round ends, not a border (a border's ends are square). */}
                    <Box
                      className={`h-[3px] rounded-pill mt-1 ${lit ? "bg-primary" : "bg-clear"}`}
                    />
                  </Box>
                </Pressable>
              );
            })}
          </ScrollView>
          {/* Phone check 2026-10-05: as a flex sibling the row still spread under the chevron and took
              its taps (it picked a category). Now the chevron is laid over the row's right end, solid,
              on top (zIndex; Android's elevation drew a grey box), and the row leaves room for it. */}
          <Pressable
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            accessibilityLabel="All categories"
            className="absolute right-0 top-0 bottom-0 items-center justify-center bg-background"
            style={CHEVRON}
          >
            <Icon name="chevron-down" size={22} color={c.text} />
          </Pressable>
        </Box>
        {/* Owner, 2026-10-04: All / Newest in the Notifications style (the shared Segmented, full
          width), and "Not subscribed only" on its own row under it. */}
        <Segmented
          items={[
            {
              value: "all",
              label: "All",
              accessibilityLabel: "All, chart order",
              icon: "list-outline",
            },
            {
              value: "newest",
              label: "Newest",
              accessibilityLabel: "Newest episodes first",
              icon: "time-outline",
            },
          ]}
          value={sort}
          onChange={setSort}
        />
        {/* Owner, 2026-10-04: right under the switch (no 48 pt row round it; the toggle is its own tap target).
            Owner, 2026-10-05: the order in words on the left, "Not subscribed only" on the right. */}
        <Box className="flex-row items-center justify-between gap-2 mb-row pt-2">
          <Text className="text-muted text-sm flex-1" numberOfLines={2}>
            {sort === "newest" ? "By latest update" : "Recommended by us"}
          </Text>
          <Box className="flex-row items-center gap-2">
            <Text className="text-muted text-body">Not subscribed only</Text>
            <Toggle
              value={notSubscribedOnly}
              onChange={setNotSubscribedOnly}
              label="Not subscribed only"
              size="small"
            />
          </Box>
        </Box>
        {state.kind === "loading" ? <Loader className="my-section" /> : null}
        {state.kind === "error" ? (
          <Text className="text-muted text-sm">
            Couldn't load this category right now.
          </Text>
        ) : null}
        {state.kind === "ok" && state.body.stale ? (
          <Text className="text-accent text-sm mb-row">
            Couldn't refresh — showing an earlier list.
          </Text>
        ) : null}
        {state.kind === "ok" && shows.length === 0 ? (
          <Text className="text-muted text-sm">
            {visible.length > 0 && notSubscribedOnly
              ? "You're subscribed to every show here."
              : "No shows here yet."}
          </Text>
        ) : null}
        {lead ? showCard(lead, true) : null}
        {pairs.map((pair) => (
          <Box
            key={pair.map((s) => s.feedUrl).join("|")}
            className="flex-row gap-row mb-row"
          >
            {pair.map((s) => showCard(s, false))}
            {pair.length === 1 ? <Box className="flex-1" /> : null}
          </Box>
        ))}
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
              className="items-center justify-center my-row"
              style={TAP}
            >
              <Text className="text-muted text-sm">
                Couldn't load more — tap to try again.
              </Text>
            </Pressable>
          ) : ended ? (
            <Text className="text-muted text-sm text-center my-section">
              No more shows
            </Text>
          ) : null
        ) : null}
      </Screen>
      <Actionsheet isOpen={picking} onClose={() => setPicking(false)}>
        <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
        <ActionsheetContent className="bg-surface rounded-t-row px-screen-x pt-row items-stretch">
          {/* Owner, 2026-10-05: an × at the top right, level with the drag bar; no scroll bar. */}
          <Box className="justify-center">
            <ActionsheetDragIndicatorWrapper>
              <ActionsheetDragIndicator />
            </ActionsheetDragIndicatorWrapper>
            <Pressable
              onPress={() => setPicking(false)}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="absolute -right-3 items-center justify-center"
              style={ROUND}
            >
              <Icon name="close" size={18} color={c.muted} />
            </Pressable>
          </Box>
          <ScrollView
            style={{ maxHeight: screenHeight * 0.7 }}
            showsVerticalScrollIndicator={false}
          >
            {GENRES.map((g) => (
              <SheetRow
                key={g.id}
                icon={g.icon}
                label={g.name}
                iconColour={g.id === genreId ? c.text : c.muted}
                selected={g.id === genreId}
                {...(g.id === genreId ? { detail: "✓" } : {})}
                onPress={() => pickFromSheet(g.id)}
              />
            ))}
          </ScrollView>
        </ActionsheetContent>
      </Actionsheet>
    </>
  );
}
