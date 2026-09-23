/**
 * The Following screen (M4 US2, clarified: a screen off the Library home). Refreshes on
 * open and on pull; shows the last copy marked stale when offline; opening it clears the
 * unread count on the Library link.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Link, router, useFocusEffect } from 'expo-router';
import { useSafety } from '../src/safety/context';
import { useSocial } from '../src/social/context';
import { useStores } from '../src/ui/providers';
import { createFeed, type FeedView } from '../src/graph/feed';
import { FeedItem } from '../src/ui/FeedItem';
import type { FeedItem as Item } from '../src/social/api';
import { EmptyState } from '../src/ui/EmptyState';

export default function FollowingScreen(): React.ReactElement {
  const { api, listener } = useSocial();
  const safetyFilter = useSafety();
  const stores = useStores();
  const feed = useMemo(() => createFeed({ api, cache: stores.feedCache, settings: stores.settings, now: () => Date.now() }), [api, stores]);
  const [view, setView] = useState<FeedView | undefined>(() => feed.cached());
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { setView(await feed.refresh()); } finally { setRefreshing(false); }
  }, [feed]);
  useFocusEffect(useCallback(() => { feed.markOpened(); void refresh(); }, [feed, refresh]));
  useEffect(() => { feed.markOpened(); }, [feed, view]);

  const open = (item: Item) => {
    if (item.kind === 'clipped' && item.refId) router.push({ pathname: '/clip/[id]', params: { id: item.refId } });
    else router.push({ pathname: '/episode/[id]', params: { id: item.episode.id, ...(item.momentMs !== null ? { at: String(item.momentMs) } : {}) } });
  };

  if (!listener) return <View style={styles.body}><Text>Sign in to follow people.</Text><Link href="/auth/sign-in" style={styles.link}>Sign in</Link></View>;
  return (
    <FlatList
      data={safetyFilter.feed(view?.items ?? [])}
      keyExtractor={(i) => String(i.id)}
      contentContainerStyle={styles.body}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      ListHeaderComponent={view?.stale ? <Text style={styles.stale}>Couldn't refresh — showing what was fetched {view.fetchedAt ? new Date(view.fetchedAt).toLocaleTimeString() : 'earlier'}.</Text> : undefined}
      ListEmptyComponent={!refreshing ? (
        <View>
          <EmptyState surface="feed" offline={view?.stale ?? false} hasCache={(view?.items.length ?? 0) > 0} onRetry={() => void refresh()} />
          <Text style={styles.muted}>Tap a name on any comment or clip to open a profile.</Text>
        </View>
      ) : undefined}
      renderItem={({ item }) => <FeedItem item={item} onOpen={open} />}
      onEndReached={() => {
        const next = view?.next;
        if (!next || refreshing) return;
        void feed.more(next).then((m) => setView((v) => v ? { ...v, items: [...v.items, ...m.items], ...(m.next ? { next: m.next } : { next: undefined }) } : v));
      }}
    />
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 8 },
  stale: { color: '#8a5a00', backgroundColor: '#fff4d6', padding: 8, borderRadius: 6 },
  muted: { color: '#666', marginBottom: 6 },
  link: { color: '#1a4fd6', marginTop: 8 },
});
