/**
 * Search (M1, reworked in M5 US2): the listener's library first — instant, offline —
 * then the catalogue's shows and episodes (`/v1/search`), merged so a library hit is
 * never repeated. A pasted feed URL still opens directly (the M1 path).
 */
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { mergeSearch } from '@socialmorning/social-core';
import { useSocial } from '../src/social/context';
import { useStores } from '../src/ui/providers';
import { ApiError, type EpisodeCard, type SearchResult, type ShowCard } from '../src/social/api';
import { looksLikeFeedUrl, searchLibrary } from '../src/discover/local-search';
import { useDiscover } from '../src/discover/useDiscover';
import { EpisodeRow } from '../src/ui/EpisodeRow';

type CatalogueState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; result: SearchResult } | { kind: 'error'; message: string };

export default function SearchScreen(): React.ReactElement {
  const router = useRouter();
  const stores = useStores();
  const { api } = useSocial();
  const { open } = useDiscover();
  const [term, setTerm] = useState('');
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

  const openShow = (feedUrl: string) => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(feedUrl) } });

  return (
    <View style={styles.fill}>
      <TextInput style={styles.input} placeholder="Search shows and episodes, or paste a feed URL" autoCorrect={false} autoFocus value={term} onChangeText={setTerm} accessibilityLabel="Search podcasts" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {looksLikeFeedUrl(trimmed) ? (
          <Pressable style={styles.urlRow} accessibilityRole="button" onPress={() => openShow(trimmed)}><Text style={styles.link}>Open feed {trimmed}</Text></Pressable>
        ) : null}
        {catalogue.kind === 'loading' ? <ActivityIndicator style={styles.spinner} /> : null}
        {catalogue.kind === 'error' ? <Text style={styles.notice}>{catalogue.message}</Text> : null}
        {catalogue.kind === 'ok' && catalogue.result.episodeSearch === 'unavailable' ? <Text style={styles.notice}>Episode search is unavailable right now — shows only.</Text> : null}
        {nothing ? <Text style={styles.notice}>Nothing matches “{trimmed}”.</Text> : null}

        {merged.shows.length > 0 ? <Text style={styles.h2}>Shows</Text> : null}
        {merged.shows.map((s) => (
          <Pressable key={s.feedUrl} style={styles.row} accessibilityRole="button" onPress={() => openShow(s.feedUrl)}>
            {s.imageUrl ? <Image source={{ uri: s.imageUrl }} style={styles.art} /> : <View style={styles.art} />}
            <View style={styles.grow}>
              <Text style={styles.title} numberOfLines={2}>{s.title}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{s.author}{libShowKeys.has(s.feedUrl) ? ' · in your library' : ''}</Text>
            </View>
          </Pressable>
        ))}
        {merged.episodes.length > 0 ? <Text style={styles.h2}>Episodes</Text> : null}
        {merged.episodes.map((e) => (
          <EpisodeRow key={`${e.feedUrl}\u0001${e.guid}`} card={e} line={libEpisodeKeys.has(e.id) ? 'In your library' : undefined} onPress={() => (libEpisodeKeys.has(e.id) ? router.push({ pathname: '/episode/[id]', params: { id: e.id } }) : void open(e))} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  input: { margin: 12, padding: 12, borderWidth: 1, borderColor: '#ccc', borderRadius: 8 },
  body: { paddingHorizontal: 12, paddingBottom: 96 },
  spinner: { marginVertical: 8 },
  notice: { marginVertical: 8, color: '#8a5a00', backgroundColor: '#fff4d6', padding: 8, borderRadius: 6 },
  h2: { fontSize: 16, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  urlRow: { paddingVertical: 10 },
  link: { color: '#1a4fd6' },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 8 },
  art: { width: 56, height: 56, borderRadius: 6, backgroundColor: '#eee' },
  grow: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  subtitle: { fontSize: 13, color: '#666' },
});
