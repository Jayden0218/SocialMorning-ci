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
 */
import { CardSheetHost, openCardSheet } from '@/ui/episode/CardSheet';
import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, Keyboard, type View } from 'react-native';
import { runOnJS } from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { Input, InputField } from '@/ui/lib/input';
import { Pressable } from '@/ui/lib/pressable';
import { SafeAreaView } from '@/ui/lib/safe-area-view';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Card } from '@/ui/kit/Card';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { Loader } from '@/ui/kit/Loader';
import { mergeSearch } from '@socialmorning/social-core';
import { useSocial } from '@/social/context';
import { useStores, useSubscriptionSync } from '@/ui/shell/providers';
import { ApiError, type EpisodeCard, type SearchResult, type ShowCard } from '@/social/api';
import { looksLikeFeedUrl, searchLibrary } from '@/discover/local-search';
import { useCardActions, useDiscover } from '@/discover/useDiscover';
import { useExploreApi, type RichEpisode, type SearchSince } from '@/discover/explore-api';
import { PlayButton, StatsLine } from '@/ui/discover/parts';
import { Artwork } from '@/ui/kit/Artwork';
import { EmptyState } from '@/ui/kit/EmptyState';
import { hit, size } from '@/design';
import { useColours } from '@/ui/kit/useColours';
import { Icon } from '@/ui/kit/Icon';
import { GENRES } from '@/discover/genres';
import { addHistory, clearHistory, readHistory, recentSearches } from '@/search/history';
import { suggestions } from '@/search/suggest';
import { splitMatch } from '@/search/match';
import { useSafety } from '@/safety/context';

const TAP = { minHeight: hit.min, minWidth: hit.min };
const ROW = { minHeight: size.row };
/** `Search-B`: the box is 56 pt tall; a category tile 64. */
const BOX = { minHeight: 56 };
const TILE = { minHeight: 64 };
/** `Search-B`: "Try searching" numbers 1–3 are in the accent, the rest muted. */
const LEAD = 3;
/** How long the box takes to move between Discover's place and the top. */
const MOVE_MS = 260;
/** On "All", this many shows sit above the episodes; the Shows tab has the rest. */
const ALL_SHOWS = 3;
/** Owner, 2026-10-01: on "All", at most this many episodes; the Episodes tab has the rest. */
const ALL_EPISODES = 5;
/** Owner, 2026-10-01: while typing, at most this many shows above the names to search for. */
const TYPED_SHOWS = 4;

type CatalogueState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; result: SearchResult } | { kind: 'error'; message: string };
type PeopleState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; people: { id: string; displayName: string }[] } | { kind: 'error'; message: string };
type Tab = 'all' | 'shows' | 'episodes' | 'people';
const TABS: { key: Tab; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'shows', label: 'Shows' }, { key: 'episodes', label: 'Episodes' }, { key: 'people', label: 'People' }];

/** M21: the date chips; `since` is what the server takes. */
const SINCE: { key: SearchSince; label: string; days?: number }[] = [
  { key: 'any', label: 'Any' }, { key: '30d', label: 'Last 30 days', days: 30 }, { key: '180d', label: 'Last 6 months', days: 180 },
];
const TAB_KEYS: Tab[] = ['all', 'shows', 'episodes', 'people'];

/** M21 T060: a row's ⋯ opens the shared episode sheet (CardSheetHost below resolves the card). */
const onMore = openCardSheet;

/** Owner, 2026-10-01: a name with the typed part in the accent colour. */
function Marked(props: { text: string; term: string; bold?: boolean; lines?: number }): React.ReactElement {
  return (
    <Text className={props.bold ? 'text-text text-sm font-display-semibold flex-1' : 'text-text text-body flex-1'} numberOfLines={props.lines ?? 1}>
      {splitMatch(props.text, props.term).map((s, i) => (
        <Text key={i} className={s.match ? 'text-accent' : 'text-text'}>{s.text}</Text>
      ))}
    </Text>
  );
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
  const c = useColours(stores.settings);
  const { api } = useSocial();
  const { open, view } = useDiscover();
  const { play } = useCardActions();
  const explore = useExploreApi();
  const [since, setSince] = useState<SearchSince>('any');
  const { hiddenFeeds, listeners: safeListeners } = useSafety();
  const subscriptionSync = useSubscriptionSync();
  // Bumped by a Subscribe tap so the pills re-read `stores.subscriptions`.
  const [, setSubVersion] = useState(0);
  const params = props;
  const [term, setTerm] = useState(params.q ?? '');
  // The term the result page is showing; undefined while the listener is still typing.
  const [submitted, setSubmitted] = useState<string | undefined>(params.q?.trim() ? params.q.trim() : undefined);
  const [tab, setTab] = useState<Tab>('all');
  const [history, setHistory] = useState<string[]>(() => readHistory(stores.settings));
  const tryThese = useMemo(() => suggestions(view?.body, hiddenFeeds), [view, hiddenFeeds]);
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
  const [catalogue, setCatalogue] = useState<CatalogueState>({ kind: 'idle' });
  const requestId = useRef(0);
  const trimmed = term.trim();

  // --- The box moving up from Discover (and back down on Cancel). 0 = Discover's place, 1 = the top.
  const fromY = params.fromY !== undefined && Number.isFinite(params.fromY) ? params.fromY : undefined;
  const move = useRef(new Animated.Value(fromY === undefined ? 1 : 0)).current;
  const [delta, setDelta] = useState(0);
  const [placed, setPlaced] = useState(fromY === undefined);
  const still = useRef(false);
  const bar = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then((v) => { still.current = v; }).catch(() => undefined); }, []);
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
  // page's own background fades in. M17 (`Search-B`): "Cancel" sits in the title row now, so the
  // box keeps Discover's full width throughout.
  const backdrop = move.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

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

  // Owner, 2026-10-01: People — asked for only when the People tab is open on a result page.
  const [people, setPeople] = useState<PeopleState>({ kind: 'idle' });
  const peopleId = useRef(0);
  const peopleFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (submitted === undefined || tab !== 'people') return;
    if (peopleFor.current === submitted) return; // already asked for this term
    const mine = ++peopleId.current;
    setPeople({ kind: 'loading' });
    api.searchPeople(submitted)
      .then((list) => { if (mine === peopleId.current) { peopleFor.current = submitted; setPeople({ kind: 'ok', people: list }); } })
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

  const openShow = (feedUrl: string) => { remember(trimmed); router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(feedUrl) } }); };
  // Owner, 2026-10-01: the same toggle as the show page — a local write first, then the push.
  const toggleSubscription = (feedUrl: string) => {
    if (stores.subscriptions.has(feedUrl)) stores.subscriptions.remove(feedUrl);
    else stores.subscriptions.add(feedUrl, Date.now());
    subscriptionSync.push();
    setSubVersion((v) => v + 1);
  };

  const showRows = (list: typeof merged.shows) => list.map((s, i) => {
    const on = stores.subscriptions.has(s.feedUrl);
    return (
      <Box key={s.feedUrl} className={`flex-row items-center gap-row ${i === list.length - 1 ? '' : 'border-b-hairline border-separator'}`}>
        <Pressable className="flex-1 flex-row items-center gap-row py-gap" accessibilityRole="button" accessibilityLabel={`${s.title}, ${s.author}`} onPress={() => openShow(s.feedUrl)}>
          {/* Phone walk 2026-09-30: shows with no (or a broken) image were blank grey squares. */}
          <Artwork url={s.imageUrl} size={56} rounded="row" name={s.title} />
          <Box className="flex-1">
            <Box className="flex-row"><Marked text={s.title} term={submitted ?? trimmed} bold lines={2} /></Box>
            <Text className="text-meta text-muted" numberOfLines={1}>{s.author}{libShowKeys.has(s.feedUrl) ? ' · in your library' : ''}</Text>
          </Box>
        </Pressable>
        {/* Owner, 2026-10-01: subscribe from the result, as on the show page. */}
        <Pressable onPress={() => toggleSubscription(s.feedUrl)} accessibilityRole="button" accessibilityLabel={on ? `Unsubscribe from ${s.title}` : `Subscribe to ${s.title}`} accessibilityState={{ selected: on }}
          className={`justify-center px-section rounded-pill ${on ? 'bg-surface border border-border' : 'bg-primary'}`} style={TAP}>
          <Text className={on ? 'text-xs font-bold text-muted' : 'text-xs font-bold text-onPrimary'}>{on ? 'Subscribed' : 'Subscribe'}</Text>
        </Pressable>
      </Box>
    );
  });
  // Owner, 2026-10-01: "More ›" on an All section when its tab has more than All shows.
  const more = (label: string, to: Tab) => (
    <Pressable onPress={() => setTab(to)} accessibilityRole="button" accessibilityLabel={`More ${label.toLowerCase()}`} className="justify-center pl-row" style={TAP}>
      <Text className="text-accent text-meta font-semibold">More ›</Text>
    </Pressable>
  );
  const sectionHead = (label: string, to: Tab, extra: boolean) => (
    <Box className="flex-row items-center justify-between mt-section">
      <Eyebrow accent>{label}</Eyebrow>
      {extra ? more(label, to) : null}
    </Box>
  );
  // M21 T087: rich rows — the match marked, counts, ▶ and ⋯.
  const episodeRows = (list: typeof merged.episodes) => list.map((e) => {
    const stats = (e as RichEpisode).stats;
    const mine = libEpisodeKeys.has(e.id);
    return (
      <Box key={`${e.feedUrl}\u0001${e.guid}`} className="flex-row items-center gap-row py-row border-b-hairline border-separator">
        <Pressable onPress={() => { remember(trimmed); if (mine) router.push({ pathname: '/episode/[id]', params: { id: e.id } }); else void open(e); }} accessibilityRole="button" accessibilityLabel={`${e.title}, ${e.showTitle}${mine ? '. In your library' : ''}`} className="flex-1 flex-row items-center gap-row" style={TAP}>
          <Artwork url={e.imageUrl} size={56} rounded="row" name={e.showTitle} />
          <Box className="flex-1 gap-0.5">
            <Box className="flex-row"><Marked text={e.title} term={submitted ?? trimmed} bold lines={2} /></Box>
            <Box className="flex-row"><Marked text={mine ? `${e.showTitle} · in your library` : e.showTitle} term={submitted ?? trimmed} /></Box>
            {stats ? <StatsLine stats={stats} /> : null}
          </Box>
        </Pressable>
        <Pressable onPress={() => onMore(e)} accessibilityRole="button" accessibilityLabel={`More for ${e.title}`} className="items-center justify-center" style={TAP}>
          <Icon name="ellipsis-horizontal" size={20} color={c.muted} />
        </Pressable>
        <PlayButton title={e.title} onPress={() => { remember(trimmed); void play(e); }} />
      </Box>
    );
  });

  return (
    <SafeAreaView className="flex-1">
      <Animated.View pointerEvents="none" className="absolute inset-0 bg-background" style={{ opacity: backdrop }} />
      {/* M17 (`Search-B`): the page's name in serif, "Cancel" in the accent on its right. */}
      <Animated.View className="flex-row items-center justify-between px-screen-x pt-row" style={{ opacity: fadeIn }}>
        <Text className="text-text text-display font-display" accessibilityRole="header">Search</Text>
        <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Cancel" className="justify-center pl-row" style={TAP}>
          <Text className="text-accent text-body font-bold" numberOfLines={1}>Cancel</Text>
        </Pressable>
      </Animated.View>
      <Box className="px-screen-x mt-gap">
        <Animated.View
          ref={bar}
          collapsable={false}
          onLayout={place}
          className="flex-row items-center bg-surface rounded-row border-[1.5px] border-text pl-section pr-1"
          style={{ ...BOX, opacity: placed ? 1 : 0, transform: [{ translateY: barY }] }}
        >
          {/* M12 FR-010 (B10): the same magnifier and scan marks as the Discover bar. */}
          <Icon name="search-outline" size={18} color={c.muted} />
          <Input className="flex-1 border-0 h-auto px-0 w-auto">
            <InputField
            placeholderTextColor={c.muted} placeholder={params.hint ?? 'Search shows and episodes, or paste a feed URL'} autoCorrect={false} autoFocus={params.q === undefined} returnKeyType="search"
            value={term} onChangeText={type} onSubmitEditing={() => run(term.trim() === '' && params.hint ? params.hint : term)} accessibilityLabel="Search podcasts"  className="px-row py-row text-text text-sm" />
          </Input>
          <Pressable onPress={() => router.push('/scan')} accessibilityRole="button" accessibilityLabel="Scan a QR code" className="items-center justify-center" style={TAP}>
            <Icon name="scan-outline" size={22} color={c.text} />
          </Pressable>
        </Animated.View>
      </Box>
      <Animated.View className="flex-1" style={{ opacity: fadeIn }}>
      {results ? (
        <Box className="flex-row gap-1 p-1 bg-surface border border-border rounded-pill mx-screen-x mt-row" accessibilityRole="tablist">
          {TABS.map((t) => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }} accessibilityLabel={t.label} className={`flex-1 items-center justify-center rounded-pill ${tab === t.key ? 'bg-primary' : ''}`} style={TAP}>
              <Text className={tab === t.key ? 'text-onPrimary text-body font-bold' : 'text-muted text-body'}>{t.label}</Text>
            </Pressable>
          ))}
        </Box>
      ) : null}
      {results && tab !== 'shows' && tab !== 'people' ? (
        <Box className="flex-row gap-gap mx-screen-x mt-gap" accessibilityRole="radiogroup" accessibilityLabel="Published">
          {SINCE.map((x) => (
            <Pressable key={x.key} onPress={() => setSince(x.key)} accessibilityRole="radio" accessibilityState={{ checked: since === x.key }} accessibilityLabel={`Published: ${x.label}`} className={`justify-center px-row rounded-pill border ${since === x.key ? 'bg-primary border-primary' : 'bg-surface border-border'}`} style={TAP}>
              <Text className={since === x.key ? 'text-onPrimary text-meta font-bold' : 'text-text text-meta'}>{x.label}</Text>
            </Pressable>
          ))}
        </Box>
      ) : null}
      <GestureDetector gesture={tabSwipe}>
      <ScrollView contentContainerClassName="px-screen-x pb-24" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {trimmed === '' ? (
          <Box>
            {tryThese.length > 0 ? (
              <>
                <Eyebrow accent className="mt-section mb-gap">Try searching</Eyebrow>
                {/* M17 (`Search-B`): a numbered card — serif numbers, the first three in the accent. */}
                <Card>
                  {tryThese.map((t, i) => (
                    <Pressable key={t} onPress={() => run(t)} accessibilityRole="button" accessibilityLabel={`Search for ${t}`} className={`flex-row items-center gap-row ${i === 0 ? '' : 'border-t-hairline border-separator'}`} style={TAP}>
                      <Text className={i < LEAD ? 'w-6 text-base font-display text-accent' : 'w-6 text-base font-display text-muted'}>{String(i + 1)}</Text>
                      <Text className="flex-1 text-text text-title font-display-semibold" numberOfLines={1}>{t}</Text>
                      <Icon name="search-outline" size={16} color={c.muted} />
                    </Pressable>
                  ))}
                </Card>
              </>
            ) : null}
            <Box className="flex-row items-center justify-between mt-section">
              <Eyebrow accent>Categories</Eyebrow>
              <Pressable onPress={() => router.push({ pathname: '/category/[id]', params: { id: String(GENRES[0]!.id) } })} accessibilityRole="link" accessibilityLabel="Browse categories" className="justify-center pl-row" style={TAP}>
                <Text className="text-accent text-meta font-semibold">Browse categories ›</Text>
              </Pressable>
            </Box>
            {/* M17 (`Search-B`): a two-column grid of tiles — the category's icon, then its name. */}
            <Box className="flex-row flex-wrap justify-between gap-y-2">
              {GENRES.slice(0, 4).map((g) => (
                <Pressable key={g.id} onPress={() => router.push({ pathname: '/category/[id]', params: { id: String(g.id) } })} accessibilityRole="button" accessibilityLabel={g.name} className="bg-surface border border-border rounded-row justify-between px-row py-2.5 gap-1.5 w-[48.5%]" style={TILE}>
                  <Icon name={g.icon} size={18} color={c.accent} />
                  <Text className="text-text text-meta font-semibold" numberOfLines={1}>{g.name}</Text>
                </Pressable>
              ))}
            </Box>
            {/* M12 FR-073: "Recent" — the last 10 searches, newest first, each one tap away. */}
            {history.length > 0 ? (
              <>
                <Box className="flex-row items-center justify-between mt-row">
                  <Eyebrow accent>Recent</Eyebrow>
                  {/* Owner, 2026-10-01: a trash button, not the word "Clear". */}
                  <Pressable onPress={() => { clearHistory(stores.settings); setHistory([]); }} accessibilityRole="button" accessibilityLabel="Clear recent searches" className="items-center justify-center" style={TAP}>
                    <Icon name="trash-outline" size={18} color={c.muted} />
                  </Pressable>
                </Box>
                {/* M17 (`Search-B`): rows with a clock (they were wrapping chips, 2026-10-01). */}
                {recentSearches(history).map((h) => (
                  <Pressable key={h} onPress={() => run(h)} accessibilityRole="button" accessibilityLabel={`Search for ${h}`} className="flex-row items-center gap-row" style={TAP}>
                    <Icon name="time-outline" size={16} color={c.muted} />
                    <Text className="flex-1 text-text text-body" numberOfLines={1}>{h}</Text>
                  </Pressable>
                ))}
              </>
            ) : null}
          </Box>
        ) : null}
        {looksLikeFeedUrl(trimmed) ? (
          <Pressable className="py-2.5" accessibilityRole="button" onPress={() => openShow(trimmed)}><Text className="text-accent">Open feed {trimmed}</Text></Pressable>
        ) : null}

        {/* Typing: the term itself, then names from what matched so far. */}
        {!results && trimmed !== '' && !looksLikeFeedUrl(trimmed) ? (
          <Box>
            <Pressable onPress={() => run(trimmed)} accessibilityRole="button" accessibilityLabel={`Search for ${trimmed}`} className="flex-row items-center gap-row border-b-hairline border-separator" style={ROW}>
              <Icon name="search-outline" size={18} color={c.muted} />
              <Text className="text-accent text-sm flex-1" numberOfLines={1}>{`Search “${trimmed}”`}</Text>
            </Pressable>
            {/* Owner, 2026-10-01: the matching shows first — artwork and name, opening the show. */}
            {merged.shows.slice(0, TYPED_SHOWS).map((s) => (
              <Pressable key={s.feedUrl} onPress={() => openShow(s.feedUrl)} accessibilityRole="button" accessibilityLabel={`Open ${s.title}`} className="flex-row items-center gap-row border-b-hairline border-separator" style={ROW}>
                <Artwork url={s.imageUrl} size={32} rounded="row" name={s.title} />
                <Marked text={s.title} term={trimmed} />
              </Pressable>
            ))}
            {typed.map((name, i) => (
              <Pressable key={`${i}\u0001${name}`} onPress={() => run(name)} accessibilityRole="button" accessibilityLabel={`Search for ${name}`} className="flex-row items-center gap-row border-b-hairline border-separator" style={ROW}>
                <Icon name="search-outline" size={18} color={c.muted} />
                <Marked text={name} term={trimmed} />
              </Pressable>
            ))}
          </Box>
        ) : null}

        {results ? (
          <Box>
            {tab !== 'people' ? (
              <>
                {catalogue.kind === 'loading' ? <Loader className="my-section" /> : null}
                {catalogue.kind === 'error' ? <Text className="my-2 text-accent bg-surface p-2 rounded-row">{catalogue.message}</Text> : null}
                {catalogue.kind === 'ok' && catalogue.result.episodeSearch === 'unavailable' ? <Text className="my-2 text-accent bg-surface p-2 rounded-row">Episode search is unavailable right now — shows only.</Text> : null}
                {nothing ? <EmptyState surface="search" page /> : null}
              </>
            ) : null}

            {tab === 'all' ? (
              <>
                {merged.shows.length > 0 ? sectionHead('Shows', 'shows', merged.shows.length > ALL_SHOWS) : null}
                {merged.shows.length > 0 ? <Card className="mt-gap">{showRows(merged.shows.slice(0, ALL_SHOWS))}</Card> : null}
                {merged.episodes.length > 0 ? sectionHead('Episodes', 'episodes', merged.episodes.length > ALL_EPISODES) : null}
                {episodeRows(merged.episodes.slice(0, ALL_EPISODES))}
              </>
            ) : null}
            {tab === 'shows' ? (catalogue.kind !== 'loading' && merged.shows.length === 0 && !nothing ? <Text className="text-muted text-sm mt-section">No shows match.</Text> : (merged.shows.length > 0 ? <Card className="mt-section">{showRows(merged.shows)}</Card> : null)) : null}
            {tab === 'episodes' ? (catalogue.kind !== 'loading' && merged.episodes.length === 0 && !nothing ? <Text className="text-muted text-sm mt-section">No episodes match.</Text> : episodeRows(merged.episodes)) : null}
            {/* Owner, 2026-10-01: People — listeners by name, opening their profile. */}
            {tab === 'people' ? (
              <Box>
                {people.kind === 'loading' ? <Loader className="my-section" /> : null}
                {people.kind === 'error' ? <Text className="my-2 text-accent bg-surface p-2 rounded-row">{people.message}</Text> : null}
                {people.kind === 'ok' && shownPeople.length === 0 ? <Text className="text-muted text-sm mt-section">No one by that name.</Text> : null}
                {shownPeople.map((p) => (
                  <Pressable key={p.id} onPress={() => { remember(trimmed); router.push({ pathname: '/profile/[id]', params: { id: p.id } }); }} accessibilityRole="link" accessibilityLabel={p.displayName ?? 'Listener'}
                    className="flex-row items-center gap-row py-2 border-b-hairline border-separator" style={ROW}>
                    <Artwork url={null} size={40} rounded="pill" name={p.displayName ?? undefined} />
                    <Marked text={p.displayName ?? ''} term={submitted ?? trimmed} />
                  </Pressable>
                ))}
              </Box>
            ) : null}
          </Box>
        ) : null}
      </ScrollView>
      </GestureDetector>
      </Animated.View>
      <CardSheetHost />
    </SafeAreaView>
  );
}
