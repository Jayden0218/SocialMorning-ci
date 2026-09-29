/**
 * Search (M1, reworked in M5 US2): the listener's library first — instant, offline —
 * then the catalogue's shows and episodes (`/v1/search`), merged so a library hit is
 * never repeated. A pasted feed URL still opens directly (the M1 path).
 *
 * M10 (owner, 2026-09-27), laid out after the reference: the box sits at the top with a
 * QR button and "Cancel"; with nothing typed the page shows "Try searching" (show names
 * from the Discover copy on the phone), "Browse categories", and this phone's search
 * history with a ✕ to clear it. `?q=` fills the box — how a scanned code's text lands.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { Loader } from '../src/ui/Loader';
import { mergeSearch } from '@socialmorning/social-core';
import { useSocial } from '../src/social/context';
import { useStores } from '../src/ui/providers';
import { ApiError, type EpisodeCard, type SearchResult, type ShowCard } from '../src/social/api';
import { looksLikeFeedUrl, searchLibrary } from '../src/discover/local-search';
import { useDiscover } from '../src/discover/useDiscover';
import { EpisodeRow } from '../src/ui/EpisodeRow';
import { EmptyState } from '../src/ui/EmptyState';
import { hit } from '../src/design';
import { useColours } from '../src/ui/useColours';
import { GENRES } from '../src/discover/genres';
import { addHistory, clearHistory, readHistory } from '../src/search/history';
import { suggestions } from '../src/search/suggest';
import { useSafety } from '../src/safety/context';

const TAP = { minHeight: hit.min, minWidth: hit.min };

type CatalogueState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; result: SearchResult } | { kind: 'error'; message: string };

export default function SearchScreen(): React.ReactElement {
  const router = useRouter();
  const stores = useStores();
  const c = useColours(stores.settings);
  const { api } = useSocial();
  const { open, view } = useDiscover();
  const { hiddenFeeds } = useSafety();
  // `hint`: the trending name the Discover box was showing; searching an empty box uses it.
  const params = useLocalSearchParams<{ q?: string; hint?: string }>();
  const [term, setTerm] = useState(params.q ?? '');
  const [history, setHistory] = useState<string[]>(() => readHistory(stores.settings));
  const tryThese = useMemo(() => suggestions(view?.body, hiddenFeeds), [view, hiddenFeeds]);
  const remember = (t: string) => setHistory(addHistory(stores.settings, t));
  const searchFor = (t: string) => { setTerm(t); remember(t); };
  const [catalogue, setCatalogue] = useState<CatalogueState>({ kind: 'idle' });
  const requestId = useRef(0);
  const trimmed = term.trim();

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

  const merged = useMemo(() => {
    const cat = catalogue.kind === 'ok' ? catalogue.result : { shows: [] as ShowCard[], episodes: [] as EpisodeCard[] };
    return mergeSearch(library, cat);
  }, [library, catalogue]);
  const libShowKeys = new Set(library.shows.map((s) => s.feedUrl));
  const libEpisodeKeys = new Set(library.episodes.map((e) => e.id));
  const nothing = trimmed !== '' && catalogue.kind !== 'loading' && merged.shows.length === 0 && merged.episodes.length === 0 && !looksLikeFeedUrl(trimmed);

  const openShow = (feedUrl: string) => { remember(trimmed); router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(feedUrl) } }); };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row items-center gap-row px-screen-x pt-row">
        <View className="flex-1 flex-row items-center bg-surface rounded-row pl-row">
          <View className="w-4 h-4 rounded-pill border-2 border-separator" />
          <TextInput
            placeholderTextColor={c.muted} className="flex-1 px-row py-row text-text text-sm" placeholder={params.hint ?? 'Search shows and episodes, or paste a feed URL'} autoCorrect={false} autoFocus returnKeyType="search"
            value={term} onChangeText={setTerm} onSubmitEditing={() => (term.trim() === '' && params.hint ? searchFor(params.hint) : remember(term))} accessibilityLabel="Search podcasts" />
          <Pressable onPress={() => router.push('/scan')} accessibilityRole="button" accessibilityLabel="Scan a QR code" className="items-center justify-center" style={TAP}>
            <View className="w-5 h-5 border-2 border-muted rounded-sm" />
          </Pressable>
        </View>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Cancel" className="justify-center" style={TAP}>
          <Text className="text-muted text-sm">Cancel</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerClassName="px-screen-x pb-24" keyboardShouldPersistTaps="handled">
        {trimmed === '' ? (
          <View>
            {tryThese.length > 0 ? (
              <>
                <Text className="text-muted text-xs mt-section mb-row">Try searching</Text>
                <View className="flex-row flex-wrap">
                  {tryThese.map((t) => (
                    <Pressable key={t} onPress={() => searchFor(t)} accessibilityRole="button" accessibilityLabel={`Search for ${t}`} className="w-1/2 justify-center pr-row" style={TAP}>
                      <Text className="text-text text-sm" numberOfLines={1}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            <Pressable onPress={() => router.push('/categories')} accessibilityRole="link" accessibilityLabel="Browse categories" className="justify-center mt-section" style={TAP}>
              <Text className="text-muted text-xs">Browse categories →</Text>
            </Pressable>
            <View className="flex-row flex-wrap gap-row">
              {GENRES.slice(0, 4).map((g) => (
                <Pressable key={g.id} onPress={() => router.push({ pathname: '/category/[id]', params: { id: String(g.id) } })} accessibilityRole="button" accessibilityLabel={g.name} className="bg-surface rounded-row justify-center px-section" style={TAP}>
                  <Text className="text-text text-sm">{g.name}</Text>
                </Pressable>
              ))}
            </View>
            {history.length > 0 ? (
              <>
                <View className="flex-row items-center justify-between mt-section">
                  <Text className="text-muted text-xs">Search history</Text>
                  <Pressable onPress={() => { clearHistory(stores.settings); setHistory([]); }} accessibilityRole="button" accessibilityLabel="Clear search history" className="items-center justify-center" style={TAP}>
                    <Text className="text-muted text-sm">✕</Text>
                  </Pressable>
                </View>
                <View className="flex-row flex-wrap gap-row">
                  {history.map((h) => (
                    <Pressable key={h} onPress={() => searchFor(h)} accessibilityRole="button" accessibilityLabel={`Search for ${h}`} className="bg-surface rounded-row justify-center px-section" style={TAP}>
                      <Text className="text-text text-sm" numberOfLines={1}>{h}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        ) : null}
        {looksLikeFeedUrl(trimmed) ? (
          <Pressable className="py-2.5" accessibilityRole="button" onPress={() => openShow(trimmed)}><Text className="text-accent">Open feed {trimmed}</Text></Pressable>
        ) : null}
        {catalogue.kind === 'loading' ? <Loader className="my-2" /> : null}
        {catalogue.kind === 'error' ? <Text className="my-2 text-accent bg-surface p-2 rounded-md">{catalogue.message}</Text> : null}
        {catalogue.kind === 'ok' && catalogue.result.episodeSearch === 'unavailable' ? <Text className="my-2 text-accent bg-surface p-2 rounded-md">Episode search is unavailable right now — shows only.</Text> : null}
        {nothing ? <EmptyState surface="search" /> : null}

        {merged.shows.length > 0 ? <Text className="text-sm font-semibold mt-3 mb-1 text-text">Shows</Text> : null}
        {merged.shows.map((s) => (
          <Pressable key={s.feedUrl} className="flex-row gap-3 py-2" accessibilityRole="button" onPress={() => openShow(s.feedUrl)}>
            {s.imageUrl ? <Image source={{ uri: s.imageUrl }} className="w-14 h-14 rounded-md bg-surface" /> : <View className="w-14 h-14 rounded-md bg-surface" />}
            <View className="flex-1">
              <Text className="text-[15px] font-semibold text-text" numberOfLines={2}>{s.title}</Text>
              <Text className="text-[13px] text-muted" numberOfLines={1}>{s.author}{libShowKeys.has(s.feedUrl) ? ' · in your library' : ''}</Text>
            </View>
          </Pressable>
        ))}
        {merged.episodes.length > 0 ? <Text className="text-sm font-semibold mt-3 mb-1 text-text">Episodes</Text> : null}
        {merged.episodes.map((e) => (
          <EpisodeRow key={`${e.feedUrl}\u0001${e.guid}`} card={e} line={libEpisodeKeys.has(e.id) ? 'In your library' : undefined} onPress={() => { remember(trimmed); if (libEpisodeKeys.has(e.id)) router.push({ pathname: '/episode/[id]', params: { id: e.id } }); else void open(e); }} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
