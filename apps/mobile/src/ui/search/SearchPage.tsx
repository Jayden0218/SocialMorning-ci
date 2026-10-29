// Search box, your shows first, then catalogue results; recent searches and categories.
/**
 * Search (M1, reworked in M5 US2): the listener's library first — instant, offline —
 * then the catalogue's shows and episodes (`/v1/search`), merged so a library hit is
 * never repeated. A pasted feed URL still opens directly (the M1 path).
 *
 * M10 (owner, 2026-09-27), laid out after the reference: the box sits at the top with a
 * QR button and "Cancel"; with nothing typed the page shows "Try searching" (show names
 * from the Discover copy on the phone), "Browse categories", and this phone's search
 * history with a ✕ to clear it. M12 FR-073: that history is a "Recent" list (the last 10,
 * newest first) with Clear. `?q=` fills the box — how a scanned code's text lands.
 *
 * Owner, 2026-10-01:
 * - The page does not slide in. It fades, and the box moves up from where Discover's box
 *   was (`fromY`) to the top; the rest of the page fades in after it. Cancel reverses it.
 * - Three states: nothing typed (the page above); typing (names to search for); and the
 *   result page — reached by the keyboard's Search, a "Try searching" name, a Recent
 *   search or a typed suggestion — with All / Shows / Episodes tabs and the keyboard down.
 *   Typing again leaves the result page.
 * - Typing lists up to 4 matching shows (artwork + name, opening the show), then names to
 *   search for; the typed part of each name is in the accent colour (`splitMatch`).
 * - The result page: a Subscribe pill on each show (the show page's own toggle); "More ›"
 *   on All's sections; All caps episodes at 5; a People tab (`/v1/search/people`).
 * - "Recent" searches are wrapping chips, cleared by a trash button.
 *
 * M17 (phone walk 2026-10-02, M16a Tier B: an episode opened from Search could not be closed by
 * the edge swipe, 0 of 5): this page was a `transparentModal` route. Every route pushed after a
 * modal is grouped with it (expo-router's native-stack `getModalRouteKeys`: a route with no
 * `presentation` after a modal is a modal too) and presented as an iOS modal sheet, which has no
 * left-edge swipe. So the page is now a component: Discover draws it IN PLACE over the tabs
 * (src/ui/search/SearchOverlay.tsx — 小宇宙's "fade-in in place"), and result pages push on the
 * root stack like every other push. `app/search.tsx` keeps the `/search` route (the show page's
 * Search, a scanned code's text, links) as an ordinary page. Guard: __tests__/search-in-place.test.ts.
 *
 * M17 (`Search-B`, constitution v3.0.0 — layout follows B): a serif "Search" title with
 * "Cancel" in the accent on its right; under it the box, a white 16 pt card with a dark outline
 * (the magnifier, the field, the scan button). Nothing typed: "Try searching" as a numbered card
 * (serif numbers, the first three in the accent), "Categories" with "Browse categories →" and a
 * two-column grid of category tiles (icon + name), and "Recent" as rows with a clock (B's rows
 * replace the 2026-10-01 chips). The result tabs are a pill track; section labels are small
 * capitals. Cancel no longer sits beside the box, so the box keeps its full width and the
 * "Cancel" room animation is gone; the box still moves up from Discover's place and the rest
 * fades in. Every action, name and handler is the same.
 *
 * M21 T087 (FR-066): on the result page the tabs also change with a sideways swipe (one pan
 * gesture that gives way to vertical scrolling); date chips — Any / Last 30 days / Last 6
 * months — filter the episodes (the server's `since`; library episodes by their date, an
 * undated one only under Any); each episode row has ▶ (plays it), ⋯ (the episode's choices),
 * its listen and comment counts, and the match marked in its title and show name.
 *
 * M22 US16: on a tablet (`useOpensInPane`) the results sit in the left column and an episode
 * opens in the right pane (src/ui/shell/ListDetail.tsx); the box and tabs keep the full width.
 * A phone is unchanged.
 *
 * M31 T030 (design-pulse2 `discover.html` search entries; review D7 — this file was 555 lines): the page is
 * split. This file keeps the state and the effects (what is typed, the catalogue and people reads, the box
 * moving up from Discover, Android back, the tab swipe); `SearchZone` is the low zone (tabs, Published chips,
 * the name, the field with Cancel), `SearchHome` the idle page and the live suggestions, `SearchResults` the
 * result page (`ShowResults`, `EpisodeResults`, `MomentResults`, `PeopleResults`). Pulse layout: the field is
 * low (6 over the safe area, 8 over the keyboard on iOS), the content scrolls above it under a fade, and the
 * tabs are All · Shows · Episodes · Moments (NEW) · People. The Moments tab filters the Moments feed's list on
 * the phone (`moments-search.ts`) — there is no server search over moments. Every action keeps its name.
 */
import { EpisodePane, ListDetail, useOpensInPane } from '@/ui/shell/ListDetail';
import { CardSheetHost, openCardSheet } from '@/ui/episode/CardSheet';
import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, BackHandler, Easing, Keyboard, Platform, type View } from 'react-native';
import { useReducedMotion } from '@/ui/kit/useReducedMotion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { runOnJS } from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { Fade } from '@/ui/kit/Fade';
import { spacing } from '@/design';
import { mergeSearch } from '@socialmorning/social-core';
import { useSocial } from '@/social/context';
import { useStores, useSubscriptionSync } from '@/ui/shell/providers';
import { ApiError, type EpisodeCard, type SearchResult, type ShowCard } from '@/social/api';
import { looksLikeFeedUrl, searchLibrary } from '@/discover/local-search';
import { useCardActions, useDiscover } from '@/discover/useDiscover';
import { useExploreApi, type SearchSince } from '@/discover/explore-api';
import { DiscoverGlow } from '@/ui/discover/DiscoverGlow';
import { useMomentActions } from '@/ui/discover/useMomentActions';
import { GENRES } from '@/discover/genres';
import { addHistory, clearHistory, readHistory } from '@/search/history';
import { suggestions } from '@/search/suggest';
// M25 A7: the admin's search words and the number of category tiles (defaults: as before).
import { tryWords } from '@/config/hints';
import { useSafety } from '@/safety/context';
import { SearchHome, Suggestions } from './SearchHome';
import { SearchZone } from './SearchZone';
import { SearchResults, type PeopleView } from './SearchResults';
import { WithMoments, type MomentResultsState } from './MomentResults';
import type { Person } from './PeopleResults';
import type { EpisodeActions } from './EpisodeResults';
import type { ShowActions } from './ShowResults';
import { SINCE, TAB_KEYS, type Tab } from './search-tabs';

/** How long the box takes to move between Discover's place and the top (drawn: 280 ms, home--search-overlay). */
const MOVE_MS = 280;
/** Owner, 2026-10-01: while typing, at most this many shows above the names to search for. */
const TYPED_SHOWS = 4;
/**
 * Drawn: the zone sits 40 from the screen's foot (the 34 home strip and 6). The app's root already keeps that
 * strip clear (`SafeAreaView edges=['bottom']`, app/_layout.tsx), so inside the page it is 6 up from the foot —
 * the same place on every phone (the comments page does the same). Over the keyboard it is 8 above it.
 */
const ZONE_REST = 6;
const ZONE_OVER_KEYBOARD = 8;
/** The content starts 8 under the status bar; on a result page 14 (the drawing's `scroll(…, 64)` against 58). */
const BODY_TOP = 8;
const RESULTS_TOP = 14;
/** The fade behind the zone: 240 tall at rest; over the keyboard 160 tall, standing on it. */
const FADE_REST = 240;
const FADE_KEYBOARD = 160;
const NO_MOMENTS: MomentResultsState = { status: 'ready', hits: [] };

type CatalogueState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; result: SearchResult } | { kind: 'error'; message: string };
type PeopleState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; people: { id: string; displayName: string }[] } | { kind: 'error'; message: string };

/** M21 T060: a row's ⋯ opens the shared episode sheet (CardSheetHost below resolves the card). */
const onMore = openCardSheet;

/** The keyboard's height on iOS, where the window does not shrink for it (Android resizes the window itself). */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const show = Keyboard.addListener('keyboardWillShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardWillHide', () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}

export type SearchPageProps = {
  /** Fills the box and shows its results at once (a scanned code's text). */
  q?: string;
  /** The trending name the Discover box was showing; searching an empty box uses it. */
  hint?: string;
  /** Where Discover's box was on the screen (window y); the box moves up from there. */
  fromY?: number;
  /** Called once the box is back in Discover's place (Cancel, Android back). */
  onClose: () => void;
};

export function SearchPage(props: SearchPageProps): React.ReactElement {
  const router = useRouter();
  const stores = useStores();
  // The root keeps the home strip clear (edges bottom); it is read only to take it off the keyboard's height.
  const { top: statusBar, bottom: homeStrip } = useSafeAreaInsets();
  const { api } = useSocial();
  const { open, view } = useDiscover();
  const { play } = useCardActions();
  const moment = useMomentActions(view?.body);
  const explore = useExploreApi();
  const [since, setSince] = useState<SearchSince>('any');
  const { hiddenFeeds, listeners: safeListeners } = useSafety();
  const subscriptionSync = useSubscriptionSync();
  // Bumped by a Subscribe tap so the buttons re-read `stores.subscriptions`.
  const [, setSubVersion] = useState(0);
  const params = props;
  const [term, setTerm] = useState(params.q ?? '');
  // The term the result page is showing; undefined while the listener is still typing.
  const [submitted, setSubmitted] = useState<string | undefined>(params.q?.trim() ? params.q.trim() : undefined);
  const [tab, setTab] = useState<Tab>('all');
  const [history, setHistory] = useState<string[]>(() => readHistory(stores.settings));
  const tryThese = useMemo(() => tryWords(suggestions(view?.body, hiddenFeeds)), [view, hiddenFeeds]);
  const remember = (t: string) => setHistory(addHistory(stores.settings, t));
  const run = (t: string) => {
    const q = t.trim();
    if (q === '') return;
    Keyboard.dismiss();
    setTerm(q);
    setSubmitted(q);
    setTab('all');
    remember(q);
  };
  // M21 T087: a sideways swipe on the results moves to the neighbouring tab.
  const swipeTab = (dx: number) => {
    if (Math.abs(dx) < 80) return;
    setTab((t) => TAB_KEYS[Math.min(TAB_KEYS.length - 1, Math.max(0, TAB_KEYS.indexOf(t) + (dx < 0 ? 1 : -1)))] ?? t);
  };
  const tabSwipe = usePanGesture({
    activeOffsetX: [-24, 24],
    failOffsetY: [-14, 14],
    onDeactivate: (e) => {
      'worklet';
      runOnJS(swipeTab)(e.translationX);
    },
  });
  const type = (t: string) => { setTerm(t); setSubmitted(undefined); };
  const clear = () => { setTerm(''); setSubmitted(undefined); setTab('all'); };
  const [catalogue, setCatalogue] = useState<CatalogueState>({ kind: 'idle' });
  const requestId = useRef(0);
  const trimmed = term.trim();

  // --- The box moving up from Discover (and back down on Cancel). 0 = Discover's place, 1 = the top.
  const fromY = params.fromY !== undefined && Number.isFinite(params.fromY) ? params.fromY : undefined;
  const move = useRef(new Animated.Value(fromY === undefined ? 1 : 0)).current;
  const [delta, setDelta] = useState(0);
  const [placed, setPlaced] = useState(fromY === undefined);
  const still = { current: useReducedMotion() };
  const bar = useRef<ComponentRef<typeof View>>(null);
  const place = () => {
    if (placed || fromY === undefined || !bar.current) return;
    bar.current.measureInWindow((_x, y) => {
      setDelta(fromY - y);
      setPlaced(true);
      Animated.timing(move, { toValue: 1, duration: still.current ? 0 : MOVE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    });
  };
  const leaving = useRef(false);
  const leave = () => {
    if (leaving.current) return;
    leaving.current = true;
    Keyboard.dismiss();
    if (fromY === undefined || still.current) { props.onClose(); return; }
    Animated.timing(move, { toValue: 0, duration: MOVE_MS, easing: Easing.in(Easing.cubic), useNativeDriver: false }).start(() => props.onClose());
  };
  // Android's back button is Cancel, with the same reverse move — only while this page is the
  // one showing (a result page pushed on top owns back then).
  const focused = useIsFocused();
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    if (!focused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { leaveRef.current(); return true; });
    return () => sub.remove();
  }, [focused]);
  const barY = move.interpolate({ inputRange: [0, 1], outputRange: [delta, 0] });
  const fadeIn = move.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1] });
  // Phone check 2026-10-01: Discover stays visible under this page (drawn in place, M17) while the
  // page's own background fades in.
  const backdrop = move.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const keyboard = useKeyboardHeight();
  // The keyboard's height counts the home strip the root leaves clear, so it comes off.
  const lift = keyboard > 0 ? Math.max(0, keyboard - homeStrip) : 0;
  const zoneBottom = keyboard > 0 ? lift + ZONE_OVER_KEYBOARD : ZONE_REST;
  const [zoneHeight, setZoneHeight] = useState(0);

  const library = useMemo(() => (trimmed === '' ? { shows: [], episodes: [] } : searchLibrary(stores, trimmed)), [stores, trimmed]);

  useEffect(() => {
    if (trimmed === '' || looksLikeFeedUrl(trimmed)) { setCatalogue({ kind: 'idle' }); return; }
    const mine = ++requestId.current;
    setCatalogue({ kind: 'loading' });
    const timer = setTimeout(() => {
      (since === 'any' ? api.search(trimmed) : explore.search(trimmed, since) as Promise<SearchResult>)
        .then((result) => { if (mine === requestId.current) setCatalogue({ kind: 'ok', result }); })
        .catch((e: unknown) => {
          if (mine !== requestId.current) return;
          const message = e instanceof ApiError
            ? (e.code === 'network' ? 'The catalogue needs a connection — showing your library only.' : e.code === 'locked' ? 'Too many searches — try again in a moment.' : e.code === 'unavailable' ? 'The catalogue is not answering right now.' : e.message)
            : 'Search failed.';
          setCatalogue({ kind: 'error', message });
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [trimmed, api, explore, since]);

  // Owner, 2026-10-01: People — asked for only when the People tab (or, since T030, All, which previews them) is open on a result page.
  const [people, setPeople] = useState<PeopleState>({ kind: 'idle' });
  const peopleId = useRef(0);
  const peopleFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (submitted === undefined || (tab !== 'people' && tab !== 'all')) return;
    if (peopleFor.current === submitted) return; // already asked for this term
    const mine = ++peopleId.current;
    setPeople({ kind: 'loading' });
    api.searchPeople(submitted)
      .then((list) => { if (mine === peopleId.current) { peopleFor.current = submitted; setPeople({ kind: 'ok', people: Array.isArray(list) ? list : [] }); } })
      .catch((e: unknown) => {
        if (mine !== peopleId.current) return;
        const message = e instanceof ApiError
          ? (e.code === 'network' ? 'Finding people needs a connection.' : e.code === 'locked' ? 'Too many searches — try again in a moment.' : e.message)
          : 'Search failed.';
        setPeople({ kind: 'error', message });
      });
  }, [submitted, tab, api]);
  const shownPeople = useMemo(() => (people.kind === 'ok' ? safeListeners(people.people) : []), [people, safeListeners]);

  const merged = useMemo(() => {
    const cat = catalogue.kind === 'ok' ? catalogue.result : { shows: [] as ShowCard[], episodes: [] as EpisodeCard[] };
    const all = mergeSearch(library, cat);
    // M21: the date filter applies to library episodes too; an undated one shows only under Any.
    const days = SINCE.find((x) => x.key === since)?.days;
    if (days === undefined) return all;
    const from = Date.now() - days * 86_400_000;
    return { ...all, episodes: all.episodes.filter((e) => e.publishedAt !== undefined && Date.parse(e.publishedAt) >= from) };
  }, [library, catalogue, since]);
  const libShowKeys = new Set(library.shows.map((s) => s.feedUrl));
  const libEpisodeKeys = new Set(library.episodes.map((e) => e.id));
  const results = submitted !== undefined;
  const nothing = results && catalogue.kind !== 'loading' && merged.shows.length === 0 && merged.episodes.length === 0 && !looksLikeFeedUrl(trimmed);
  // While typing: names to search for — the shows first, then episode titles, no repeats.
  const typed = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    // Owner, 2026-10-01: the shows above are not repeated as names.
    for (const s of merged.shows.slice(0, TYPED_SHOWS)) seen.add(s.title.trim().toLowerCase());
    for (const name of [...merged.shows.map((s) => s.title), ...merged.episodes.map((e) => e.title)]) {
      const key = name.trim().toLowerCase();
      if (key === '' || seen.has(key) || key === trimmed.toLowerCase()) continue;
      seen.add(key);
      out.push(name.trim());
      if (out.length >= 8) break;
    }
    return out;
  }, [merged, trimmed]);

  // M22 US16: the tablet's right pane (undefined `pane` on a phone: the page is pushed as before).
  const inPane = useOpensInPane();
  const [paneId, setPaneId] = useState<string | undefined>(undefined);
  const pane = inPane ? setPaneId : undefined;
  const openShow = (feedUrl: string) => { remember(trimmed); router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(feedUrl) } }); };
  // Owner, 2026-10-01: the same toggle as the show page — a local write first, then the push.
  const toggleSubscription = (feedUrl: string) => {
    if (stores.subscriptions.has(feedUrl)) stores.subscriptions.remove(feedUrl);
    else stores.subscriptions.add(feedUrl, Date.now());
    subscriptionSync.push();
    setSubVersion((v) => v + 1);
  };
  const showActions: ShowActions = {
    isSubscribed: (f) => stores.subscriptions.has(f),
    inLibrary: (f) => libShowKeys.has(f),
    onOpen: openShow,
    onToggle: toggleSubscription,
  };
  const episodeActions: EpisodeActions = {
    inLibrary: (id) => libEpisodeKeys.has(id),
    onOpen: (e) => {
      remember(trimmed);
      const mine = libEpisodeKeys.has(e.id);
      if (mine && pane) pane(e.id);
      else if (mine) router.push({ pathname: '/episode/[id]', params: { id: e.id } });
      else void open(e, pane);
    },
    onPlay: (e) => { remember(trimmed); void play(e); },
    onMore,
  };
  const openPerson = (p: Person) => { remember(trimmed); router.push({ pathname: '/profile/[id]', params: { id: p.id } }); };
  const peopleView: PeopleView = {
    loading: people.kind === 'loading',
    ...(people.kind === 'error' ? { error: people.message } : {}),
    people: shownPeople,
    loaded: people.kind === 'ok',
  };
  const catalogueView = {
    kind: catalogue.kind,
    ...(catalogue.kind === 'error' ? { message: catalogue.message } : {}),
    ...(catalogue.kind === 'ok' && catalogue.result.episodeSearch === 'unavailable' ? { episodeSearchDown: true } : {}),
  };
  const resultsFor = (moments: MomentResultsState): React.ReactElement => (
    <SearchResults
      tab={tab}
      onTab={setTab}
      term={submitted ?? trimmed}
      catalogue={catalogueView}
      shows={merged.shows}
      episodes={merged.episodes}
      nothing={nothing}
      top={statusBar + RESULTS_TOP}
      showActions={showActions}
      episodeActions={episodeActions}
      moments={moments}
      onPlayMoment={moment.playFull}
      people={peopleView}
      onOpenPerson={openPerson}
    />
  );

  return (
    <Box className="flex-1">
      <Animated.View pointerEvents="none" className="absolute inset-0 bg-void" style={{ opacity: backdrop }}>
        <DiscoverGlow swap top={-260} strength={0.25} />
      </Animated.View>
      <Animated.View className="flex-1" style={{ opacity: fadeIn }}>
        <ListDetail
          placeholder="Choose an episode to see it here."
          detail={paneId !== undefined ? <EpisodePane episodeId={paneId} onOpenPage={() => router.push({ pathname: '/episode/[id]', params: { id: paneId } })} /> : undefined}
          list={
            <GestureDetector gesture={tabSwipe}>
              <ScrollView
                contentContainerStyle={{ paddingTop: statusBar + (results ? RESULTS_TOP : BODY_TOP), paddingBottom: zoneHeight + zoneBottom + spacing.section }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                {trimmed === '' ? (
                  <SearchHome
                    history={history}
                    tryThese={tryThese}
                    onSearch={run}
                    onClear={() => { clearHistory(stores.settings); setHistory([]); }}
                    onGenre={(id) => router.push({ pathname: '/category/[id]', params: { id: String(id) } })}
                    onBrowse={() => router.push({ pathname: '/category/[id]', params: { id: String(GENRES[0]!.id) } })}
                  />
                ) : null}
                {/* A pasted feed address opens as a feed; otherwise, while typing: the term, then names from what matched so far. */}
                {trimmed !== '' && (looksLikeFeedUrl(trimmed) || !results) ? (
                  <Suggestions term={trimmed} isFeed={looksLikeFeedUrl(trimmed)} shows={merged.shows.slice(0, TYPED_SHOWS)} names={typed} onSearch={run} onShow={openShow} />
                ) : null}
                {results && !looksLikeFeedUrl(trimmed)
                  ? (tab === 'moments' ? <WithMoments term={submitted}>{resultsFor}</WithMoments> : resultsFor(NO_MOMENTS))
                  : null}
              </ScrollView>
            </GestureDetector>
          }
        />
      </Animated.View>
      <Fade bottom={lift} height={keyboard > 0 ? FADE_KEYBOARD : FADE_REST} />
      <SearchZone
        bottom={zoneBottom}
        results={results}
        nothing={nothing === true}
        tab={tab}
        onTab={setTab}
        since={since}
        onSince={setSince}
        term={term}
        placeholder={params.hint ?? 'Search shows and episodes, or paste a feed URL'}
        autoFocus={params.q === undefined}
        onChangeText={type}
        onSubmit={() => run(term.trim() === '' && params.hint ? params.hint : term)}
        onClear={clear}
        onCancel={leave}
        onScan={() => router.push('/scan')}
        field={{ ref: bar, onLayout: place, style: { opacity: placed ? 1 : 0, transform: [{ translateY: barY }] } }}
        fadeIn={fadeIn}
        onHeight={setZoneHeight}
      />
      <CardSheetHost />
    </Box>
  );
}
