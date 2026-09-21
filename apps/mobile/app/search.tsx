/**
 * Search (FR-001). Debounced at 300 ms because Apple's endpoint is rate
 * limited at roughly twenty requests a minute and a keystroke is not a query.
 */
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { searchShows, type CatalogShow } from '../src/catalog/apple';

export default function SearchScreen(): React.ReactElement {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [shows, setShows] = useState<CatalogShow[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  // What the results on screen are actually for, so "no matches" never names
  // a term the listener has already changed.
  const [searchedFor, setSearchedFor] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = term.trim();
    if (trimmed === '') {
      setShows([]);
      setSearchedFor('');
      setFailed(undefined);
      return;
    }

    const controller = new AbortController();
    const mine = ++requestId.current;
    setSearching(true);
    const timer = setTimeout(() => {
      searchShows(trimmed, controller.signal)
        .then((results) => {
          if (mine !== requestId.current) return;
          setShows(results);
          setSearchedFor(trimmed);
          setFailed(undefined);
        })
        .catch((error: unknown) => {
          if (mine !== requestId.current) return;
          setShows([]);
          setSearchedFor(trimmed);
          setFailed(error instanceof Error ? error.message : 'Search failed.');
        })
        .finally(() => {
          if (mine === requestId.current) setSearching(false);
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  return (
    <View style={styles.fill}>
      <TextInput
        style={styles.input}
        placeholder="Search podcasts"
        autoCorrect={false}
        autoFocus
        value={term}
        onChangeText={setTerm}
        accessibilityLabel="Search podcasts"
      />
      {searching ? <ActivityIndicator style={styles.spinner} /> : null}
      {failed === undefined ? null : <Text style={styles.message}>{failed}</Text>}
      {/* Story 1 scenario 5: say there were no matches, do not show a blank screen. */}
      {!searching && failed === undefined && searchedFor !== '' && shows.length === 0 ? (
        <Text style={styles.message}>No podcasts match “{searchedFor}”</Text>
      ) : null}
      <FlatList
        data={shows}
        keyExtractor={(show) => String(show.catalogId)}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/show/[feedUrl]',
                params: { feedUrl: encodeURIComponent(item.feedUrl) },
              })
            }
          >
            {item.artworkUrl === undefined ? (
              <View style={styles.artPlaceholder} />
            ) : (
              <Image source={{ uri: item.artworkUrl }} style={styles.art} />
            )}
            <View style={styles.grow}>
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {item.author}
              </Text>
              {item.episodeCount === undefined ? null : (
                <Text style={styles.subtitle}>{item.episodeCount} episodes</Text>
              )}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  input: { margin: 12, padding: 12, borderWidth: 1, borderColor: '#ccc', borderRadius: 8 },
  spinner: { marginVertical: 8 },
  message: { margin: 12, color: '#555' },
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingVertical: 8 },
  art: { width: 56, height: 56, borderRadius: 6, backgroundColor: '#eee' },
  artPlaceholder: { width: 56, height: 56, borderRadius: 6, backgroundColor: '#eee' },
  grow: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  subtitle: { fontSize: 13, color: '#666' },
});
