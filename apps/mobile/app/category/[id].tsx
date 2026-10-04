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
import { Image as RNImage, ScrollView } from "react-native";
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
import { GENRES } from "@/discover/genres";
import { categoryList, type CategorySort } from "@/discover/category-list";
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
const SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
/** The longest a category waits for its covers before showing the list anyway. */
const COVER_WAIT_MS = 3000;
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
  const [state, setState] = useState<State>({ kind: "loading" });
  const [sort, setSort] = useState<CategorySort>("all");
  const [notSubscribedOnly, setNotSubscribedOnly] = useState(false);
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
  const showTile = (id: number, animated: boolean) => {
    const x = tileX.current.get(id);
    if (x !== undefined)
      strip.current?.scrollTo({ x: Math.max(0, x - 40), animated });
  };
  const pick = (id: number) => {
    setGenreId(id);
    showTile(id, true);
  };

  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    api.category(genreId).then(
      async (body) => {
        // Owner, 2026-10-04: a new category shows its covers when ready, not the letter tiles
        // first. The covers of the first screen (9) are fetched before the list appears;
        // at most 3 s, then the list shows anyway.
        const covers = body.shows.slice(0, 9).flatMap((s) => (s.imageUrl ? [s.imageUrl] : []));
        await Promise.race([
          Promise.all(covers.map((u) => RNImage.prefetch(u).catch(() => false))),
          new Promise((done) => setTimeout(done, COVER_WAIT_MS)),
        ]);
        if (live) setState({ kind: "ok", body });
      },
      () => {
        if (live) setState({ kind: "error" });
      },
    );
    return () => {
      live = false;
    };
  }, [api, genreId]);

  // The same store calls and push as the show page's Subscribe (app/show/[feedUrl].tsx,
  // toggleSubscription): local write first, the sync is fire-and-forget (M8 US1).
  const toggleSubscription = (feedUrl: string) => {
    if (stores.subscriptions.has(feedUrl)) stores.subscriptions.remove(feedUrl);
    else stores.subscriptions.add(feedUrl, Date.now());
    subscriptionSync.push();
    setSubscribed(readSubscribed());
  };

  const now = Date.now();
  const visible =
    state.kind === "ok"
      ? state.body.shows.filter((s) => !hiddenFeeds.has(s.feedUrl))
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
          <Artwork
            url={s.imageUrl}
            size={wide ? 100 : 72}
            rounded="row"
            name={s.title}
          />
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
        <Box
          className={wide ? "absolute top-2 right-2" : "absolute top-8 right-row"}
        >
          <Pressable
            onPress={() => toggleSubscription(s.feedUrl)}
            accessibilityRole="button"
            accessibilityLabel={
              on ? `Unsubscribe from ${s.title}` : `Subscribe to ${s.title}`
            }
            accessibilityState={{ selected: on }}
            className={`items-center justify-center rounded-pill ${on ? "bg-surface border border-border" : "bg-primary"}`}
            style={wide ? ROUND : ROUND_SMALL}
            {...(wide ? {} : { hitSlop: SLOP })}
          >
            <Icon
              name={on ? "checkmark" : "add"}
              size={wide ? 22 : 18}
              color={on ? c.muted : c.onPrimary}
            />
          </Pressable>
        </Box>
      </Card>
    );
  };

  return (
    <>
      <PageHeader title="Categories" />
      <Screen scroll>
        {/* Owner, 2026-10-04: no large category title and no list under it — the sliding row of
          categories below is how a category is chosen. */}
        <Box className="-mx-screen-x border-b-hairline border-separator mb-gap">
          <ScrollView
            ref={strip}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-5 px-screen-x"
          >
            {GENRES.map((g) => {
              const on = g.id === genreId;
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
                        on
                          ? "text-text text-body font-bold"
                          : "text-muted text-body"
                      }
                      numberOfLines={1}
                    >
                      {g.name}
                    </Text>
                    {/* A bar with round ends, not a border (a border's ends are square). */}
                    <Box
                      className={`h-[3px] rounded-pill mt-1 ${on ? "bg-primary" : "bg-clear"}`}
                    />
                  </Box>
                </Pressable>
              );
            })}
          </ScrollView>
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
        {/* Owner, 2026-10-04: right under the switch (no 48 pt row round it; the toggle is its own tap target). */}
        <Box className="flex-row items-center gap-2 mb-row">
          <Text className="text-muted text-body">Not subscribed only</Text>
          <Toggle
            value={notSubscribedOnly}
            onChange={setNotSubscribedOnly}
            label="Not subscribed only"
            size="small"
          />
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
      </Screen>
    </>
  );
}
