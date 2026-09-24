/**
 * Library: where you were, and what you follow.
 *
 * "Continue listening" is first because Story 3 is the thing people abandon
 * a podcast app over — losing your place in a two-hour episode.
 *
 * M7: Discover and Following left this list — they are tabs now, so they cost **1 tap**
 * instead of 2. Search, Inbox, Queue, Downloads and Account stay here at 2 taps, which
 * is what they cost before; nothing got further away (guard G4).
 */
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { refreshAll } from '../../src/feeds/refresh-all';
import { ContinueListening } from '../../src/ui/ContinueListening';
import { shortDate } from '../../src/ui/format';
import { useSafety } from '../../src/safety/context';
import { EmptyState } from '../../src/ui/EmptyState';
import { NavLink } from '../../src/ui/NavLink';
import { useStores } from '../../src/ui/providers';
import { inboxIds } from '../../src/inbox';
import { useSocial } from '../../src/social/context';
import { useDiscover } from '../../src/discover/useDiscover';
import { DiscoverSections } from '../../src/ui/DiscoverSections';
import type { CachedShow } from '../../src/storage/types';
import { colour } from '../../src/design';

type Row = { feedUrl: string; show: CachedShow | undefined; stale: boolean };

export default function LibraryScreen(): React.ReactElement {
  const stores = useStores();
  const { safety, version: safetyVersion, hiddenFeeds } = useSafety();
  void safetyVersion;
  const { listener } = useSocial();
  const [rows, setRows] = useState<Row[]>([]);
  const [tick, setTick] = useState(0);

  const read = useCallback(
    (stale: Set<string>): Row[] =>
      stores.subscriptions.list().map(({ feedUrl }) => ({
        feedUrl,
        show: stores.feeds.getShow(feedUrl),
        stale: stale.has(feedUrl),
      })),
    [stores],
  );

  useFocusEffect(
    useCallback(() => {
      let live = true;
      setRows(read(new Set()));
      // Refresh in the background. Principle IV: a feed that fails keeps its
      // cached copy and shows a badge; it never blanks the library.
      void refreshAll(stores, Date.now()).then((result) => {
        if (!live) return;
        setRows(read(new Set(result.stale)));
        setTick((n) => n + 1);
      });
      return () => {
        live = false;
      };
    }, [read, stores]),
  );

  // M5 (FR-002): a zero-subscription home is Discover first; with subscriptions, a picks strip + the link.
  const discover = useDiscover();
  const noSubscriptions = rows.length === 0;

  return (
    <FlatList
      key={tick}
      data={rows}
      keyExtractor={(row) => row.feedUrl}
      contentContainerStyle={styles.body}
      ListHeaderComponent={
        <View style={styles.header}>
          <ContinueListening />
          {noSubscriptions && discover.view ? <DiscoverSections body={discover.view.body} stale={discover.view.stale} fetchedAt={discover.view.fetchedAt} onOpen={(c) => void discover.open(c)} /> : null}
          <NavLink href="/search" label="Search for a show" />
          {!noSubscriptions && discover.view && discover.view.body.picks.length > 0 ? (
            <DiscoverSections body={discover.view.body} stale={discover.view.stale} fetchedAt={discover.view.fetchedAt} onOpen={(c) => void discover.open(c)} maxPicks={3} />
          ) : null}
          <NavLink href="/inbox" label={`Inbox${(() => { const n = inboxIds(stores).length; return n > 0 ? ` (${n})` : ''; })()}`} />
          <NavLink href="/queue" label="Queue" />
          <NavLink href="/downloads" label="Downloads" />
          {listener === undefined ? (
            <NavLink href="/auth/sign-in" label="Sign in to comment" />
          ) : (
            <Text style={styles.subtitle}>{`Signed in as `}</Text>
          )}
        </View>
      }
      ListEmptyComponent={<EmptyState surface="library" />}
      renderItem={({ item }) => (
        <Link
          href={{
            pathname: '/show/[feedUrl]',
            params: { feedUrl: encodeURIComponent(item.feedUrl) },
          }}
          asChild
        >
          <Pressable style={styles.row} accessibilityRole="button">
            {item.show?.imageUrl === undefined ? (
              <View style={styles.art} />
            ) : (
              <Image source={{ uri: item.show.imageUrl }} style={styles.art} />
            )}
            <View style={styles.grow}>
              <Text style={styles.title} numberOfLines={3}>
                {item.show?.title ?? item.feedUrl}
              </Text>
              <Text style={styles.subtitle}>
                {latestLine(stores.feeds.listEpisodes(item.feedUrl)[0]?.publishedAt, item.stale)}
                {safety.isHidden('show', item.feedUrl) ? ' · reported' : hiddenFeeds.has(item.feedUrl) ? ' · hidden from discovery' : ''}
              </Text>
            </View>
          </Pressable>
        </Link>
      )}
    />
  );
}

function latestLine(publishedAt: number | undefined, stale: boolean): string {
  const latest = publishedAt === undefined ? 'No episodes yet' : `Latest ${shortDate(publishedAt)}`;
  return stale ? `${latest} · offline copy` : latest;
}

const styles = StyleSheet.create({
  body: { padding: 12, gap: 4 },
  header: { gap: 8, marginBottom: 8 },
  link: { fontSize: 16, color: colour.accent, paddingVertical: 4 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 8 },
  art: { width: 56, height: 56, borderRadius: 6, backgroundColor: colour.surface },
  grow: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  subtitle: { fontSize: 13, color: colour.muted },
  empty: { color: colour.muted, paddingVertical: 8 },
});
