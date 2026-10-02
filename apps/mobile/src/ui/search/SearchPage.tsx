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
 */
import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, Keyboard, type View } from 'react-native';
import { Input, InputField } from '../lib/input';
import { Pressable } from '../lib/pressable';
import { SafeAreaView } from '../lib/safe-area-view';
import { ScrollView } from '../lib/scroll-view';
import { Text } from '../lib/text';
import { Box } from '../lib/box';
import { Loader } from '../Loader';
import { mergeSearch } from '@socialmorning/social-core';
import { useSocial } from '../../social/context';
import { useStores, useSubscriptionSync } from '../providers';
import { ApiError, type EpisodeCard, type SearchResult, type ShowCard } from '../../social/api';
import { looksLikeFeedUrl, searchLibrary } from '../../discover/local-search';
import { useDiscover } from '../../discover/useDiscover';
import { EpisodeRow } from '../EpisodeRow';
import { Artwork } from '../Artwork';
import { EmptyState } from '../EmptyState';
import { hit, size, spacing } from '../../design';
import { useColours } from '../useColours';
import { Icon } from '../Icon';
import { GENRES } from '../../discover/genres';
import { addHistory, clearHistory, readHistory, recentSearches } from '../../search/history';
import { suggestions } from '../../search/suggest';
import { splitMatch } from '../../search/match';
import { useSafety } from '../../safety/context';

const TAP = { minHeight: hit.min, minWidth: hit.min };
const ROW = { minHeight: size.row };
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

/** Owner, 2026-10-01: a name with the typed part in the accent colour. */
function Marked(props: { text: string; term: string; bold?: boolean; lines?: number }): React.ReactElement {
  return (
    <Text className={props.bold ? 'text-text text-[15px] font-semibold flex-1' : 'text-text text-sm flex-1'} numberOfLines={props.lines ?? 1}>
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
  // page's own background fades in, and "Cancel" opens room for itself, so the box starts at
  // Discover's full width. Width is not a native-driver prop, so this animation runs in JS.
  const backdrop = move.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const [cancelW, setCancelW] = useState(64);
  const cancelRoom = move.interpolate({ inputRange: [0, 1], outputRange: [0, cancelW] });

  const library = useMemo(() => (trimmed === '' ? { shows: [], episodes: [] } : searchLibrary(stores, trimmed)), [stores, trimmed]);

  useEffect(() => {
    if (trimmed === '' || looksLikeFeedUrl(trimmed)) { setCatalogue({ kind: 'idle' }); return; }
    const mine = ++requestId.current;
    setCatalogue({ kind: 'loading' });
    const timer = setTimeout(() => {
      api.search(trimmed)
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
  }, [trimmed, api]);

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
    return mergeSearch(library, cat);
  }, [library, catalogue]);
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
  const allCategories = () => router.push({ pathname: '/category/[id]', params: { id: String(GENRES[0]!.id) } });

  const showRows = (list: typeof merged.shows) => list.map((s) => {
    const on = stores.subscriptions.has(s.feedUrl);
    return (
      <Box key={s.feedUrl} className="flex-row items-center gap-row">
        <Pressable className="flex-1 flex-row gap-3 py-2" accessibilityRole="button" accessibilityLabel={`${s.title}, ${s.author}`} onPress={() => openShow(s.feedUrl)}>
          {/* Phone walk 2026-09-30: shows with no (or a broken) image were blank grey squares. */}
          <Artwork url={s.imageUrl} size={56} rounded="row" name={s.title} />
          <Box className="flex-1">
            <Box className="flex-row"><Marked text={s.title} term={submitted ?? trimmed} bold lines={2} /></Box>
            <Text className="text-[13px] text-muted" numberOfLines={1}>{s.author}{libShowKeys.has(s.feedUrl) ? ' · in your library' : ''}</Text>
          </Box>
        </Pressable>
        {/* Owner, 2026-10-01: subscribe from the result, as on the show page. */}
        <Pressable onPress={() => toggleSubscription(s.feedUrl)} accessibilityRole="button" accessibilityLabel={on ? `Unsubscribe from ${s.title}` : `Subscribe to ${s.title}`} accessibilityState={{ selected: on }}
          className={`justify-center px-row rounded-pill ${on ? 'bg-surface' : 'bg-primary'}`} style={TAP}>
          <Text className={on ? 'text-xs font-bold text-muted' : 'text-xs font-bold text-onPrimary'}>{on ? 'Subscribed' : 'Subscribe'}</Text>
        </Pressable>
      </Box>
    );
  });
  // Owner, 2026-10-01: "More ›" on an All section when its tab has more than All shows.
  const more = (label: string, to: Tab) => (
    <Pressable onPress={() => setTab(to)} accessibilityRole="button" accessibilityLabel={`More ${label.toLowerCase()}`} className="justify-center pl-row" style={TAP}>
      <Text className="text-muted text-xs">More ›</Text>
    </Pressable>
  );
  const sectionHead = (label: string, to: Tab, extra: boolean) => (
    <Box className="flex-row items-center justify-between mt-3 mb-1">
      <Text className="text-sm font-semibold text-text" accessibilityRole="header">{label}</Text>
      {extra ? more(label, to) : null}
    </Box>
  );
  const episodeRows = (list: typeof merged.episodes) => list.map((e) => (
    <EpisodeRow key={`${e.feedUrl}\u0001${e.guid}`} card={e} line={libEpisodeKeys.has(e.id) ? 'In your library' : undefined} onPress={() => { remember(trimmed); if (libEpisodeKeys.has(e.id)) router.push({ pathname: '/episode/[id]', params: { id: e.id } }); else void open(e); }} />
  ));

  return (
    <SafeAreaView className="flex-1">
      <Animated.View pointerEvents="none" className="absolute inset-0 bg-background" style={{ opacity: backdrop }} />
      <Box className="flex-row items-center px-screen-x pt-row">
        <Animated.View
          ref={bar}
          collapsable={false}
          onLayout={place}
          className="flex-1 flex-row items-center bg-surface rounded-pill pl-section"
          style={{ opacity: placed ? 1 : 0, transform: [{ translateY: barY }] }}
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
        {/* Phone check 2026-10-02: measured inside the 0-wide box, "Cancel" wrapped to two lines.
            The word is measured here, outside it, hidden; the button then takes that width. */}
        <Text className="absolute text-muted text-sm opacity-0" numberOfLines={1} accessible={false} importantForAccessibility="no-hide-descendants" onLayout={(e) => setCancelW(Math.ceil(e.nativeEvent.layout.width) + spacing.row)}>Cancel</Text>
        <Animated.View className="self-stretch overflow-hidden" style={{ width: cancelRoom, opacity: fadeIn }}>
          <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Cancel" className="absolute left-0 top-0 bottom-0 justify-center pl-row" style={{ ...TAP, width: cancelW }}>
            <Text className="text-muted text-sm" numberOfLines={1}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </Box>
      <Animated.View className="flex-1" style={{ opacity: fadeIn }}>
      {results ? (
        <Box className="flex-row border-b-hairline border-separator px-screen-x mt-row">
          {TABS.map((t) => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }} accessibilityLabel={t.label} className="flex-1 items-center justify-center" style={TAP}>
              <Text className={tab === t.key ? 'text-accent text-sm font-bold' : 'text-muted text-sm'}>{t.label}</Text>
            </Pressable>
          ))}
        </Box>
      ) : null}
      <ScrollView contentContainerClassName="px-screen-x pb-24" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {trimmed === '' ? (
          <Box>
            {tryThese.length > 0 ? (
              <>
                <Text className="text-muted text-xs mt-section mb-row">Try searching</Text>
                <Box className="flex-row flex-wrap">
                  {tryThese.map((t) => (
                    <Pressable key={t} onPress={() => run(t)} accessibilityRole="button" accessibilityLabel={`Search for ${t}`} className="w-1/2 justify-center pr-row" style={TAP}>
                      <Text className="text-text text-sm" numberOfLines={1}>{t}</Text>
                    </Pressable>
                  ))}
                </Box>
              </>
            ) : null}
            <Pressable onPress={allCategories} accessibilityRole="link" accessibilityLabel="Browse categories" className="justify-center mt-section" style={TAP}>
              <Text className="text-muted text-xs">Browse categories →</Text>
            </Pressable>
            <Box className="flex-row flex-wrap gap-row">
              {GENRES.slice(0, 4).map((g) => (
                <Pressable key={g.id} onPress={() => router.push({ pathname: '/category/[id]', params: { id: String(g.id) } })} accessibilityRole="button" accessibilityLabel={g.name} className="bg-surface rounded-row justify-center px-section" style={TAP}>
                  <Text className="text-text text-sm">{g.name}</Text>
                </Pressable>
              ))}
            </Box>
            {/* M12 FR-073: "Recent" — the last 10 searches, newest first, each one tap away. */}
            {history.length > 0 ? (
              <>
                <Box className="flex-row items-center justify-between mt-section">
                  <Text className="text-muted text-xs" accessibilityRole="header">Recent</Text>
                  {/* Owner, 2026-10-01: a trash button, not the word "Clear". */}
                  <Pressable onPress={() => { clearHistory(stores.settings); setHistory([]); }} accessibilityRole="button" accessibilityLabel="Clear recent searches" className="items-center justify-center" style={TAP}>
                    <Icon name="trash-outline" size={18} color={c.muted} />
                  </Pressable>
                </Box>
                {/* Owner, 2026-10-01: wrapping chips, not full-width rows. */}
                <Box className="flex-row flex-wrap gap-row">
                  {recentSearches(history).map((h) => (
                    <Pressable key={h} onPress={() => run(h)} accessibilityRole="button" accessibilityLabel={`Search for ${h}`} className="bg-surface rounded-row px-row justify-center max-w-full" style={TAP}>
                      <Text className="text-text text-sm" numberOfLines={1}>{h}</Text>
                    </Pressable>
                  ))}
                </Box>
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
                {catalogue.kind === 'error' ? <Text className="my-2 text-accent bg-surface p-2 rounded-md">{catalogue.message}</Text> : null}
                {catalogue.kind === 'ok' && catalogue.result.episodeSearch === 'unavailable' ? <Text className="my-2 text-accent bg-surface p-2 rounded-md">Episode search is unavailable right now — shows only.</Text> : null}
                {nothing ? <EmptyState surface="search" page /> : null}
              </>
            ) : null}

            {tab === 'all' ? (
              <>
                {merged.shows.length > 0 ? sectionHead('Shows', 'shows', merged.shows.length > ALL_SHOWS) : null}
                {showRows(merged.shows.slice(0, ALL_SHOWS))}
                {merged.episodes.length > 0 ? sectionHead('Episodes', 'episodes', merged.episodes.length > ALL_EPISODES) : null}
                {episodeRows(merged.episodes.slice(0, ALL_EPISODES))}
              </>
            ) : null}
            {tab === 'shows' ? (catalogue.kind !== 'loading' && merged.shows.length === 0 && !nothing ? <Text className="text-muted text-sm mt-section">No shows match.</Text> : showRows(merged.shows)) : null}
            {tab === 'episodes' ? (catalogue.kind !== 'loading' && merged.episodes.length === 0 && !nothing ? <Text className="text-muted text-sm mt-section">No episodes match.</Text> : episodeRows(merged.episodes)) : null}
            {/* Owner, 2026-10-01: People — listeners by name, opening their profile. */}
            {tab === 'people' ? (
              <Box>
                {people.kind === 'loading' ? <Loader className="my-section" /> : null}
                {people.kind === 'error' ? <Text className="my-2 text-accent bg-surface p-2 rounded-md">{people.message}</Text> : null}
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
      </Animated.View>
    </SafeAreaView>
  );
}
