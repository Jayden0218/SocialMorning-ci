/**
 * Library: where you were, and what you follow.
 *
 * "Continue listening" is first because Story 3 is the thing people abandon
 * a podcast app over — losing your place in a two-hour episode.
 *
 * M7: Discover and Following left this list — they are tabs now, so they cost **1 tap**
 * instead of 2. Search, Inbox, Queue, Downloads and Account stay here at 2 taps, which
 * is what they cost before; nothing got further away (guard G4).
 *
 * M10: the Library is the second tab, at `/library` (Discover took `/`). From a cold
 * start it is still 1 tap, so everything linked here is still 2 (G4).
 */
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, Text, View } from 'react-native';
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
import { BOTTOM_INSET } from '../../src/ui/Screen';

type Row = { feedUrl: string; show: CachedShow | undefined; stale: boolean };

export default function LibraryScreen(): React.ReactElement {
  const stores = useStores();
  const { safety, version: safetyVersion, hiddenFeeds } = useSafety();
  void safetyVersion;
  const { listener, auth } = useSocial();
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
      contentContainerClassName="p-3 gap-2"
      // The inset is derived from two JS constants, so it stays a style rather than a class.
      contentContainerStyle={{ paddingBottom: BOTTOM_INSET }}
      ListHeaderComponent={
        <View className="gap-2 mb-2">
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
            <>
              <NavLink href="/account" label={`Signed in as ${listener.displayName}`} />
              {/* Owner, 2026-09-27: Sign out one tap away, not only inside Account. */}
              <Pressable
                onPress={() => void auth.signOut()}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                className="min-h-12 py-row justify-center border-b-hairline border-separator"
              >
                <Text className="text-sm text-accent">Sign out</Text>
              </Pressable>
            </>
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
          <Pressable className="flex-row gap-3 py-2" accessibilityRole="button">
            {item.show?.imageUrl === undefined ? (
              <View className="w-14 h-14 rounded-md bg-surface" />
            ) : (
              <Image source={{ uri: item.show.imageUrl }} className="w-14 h-14 rounded-md bg-surface" />
            )}
            <View className="flex-1">
              <Text className="text-[15px] font-semibold text-text" numberOfLines={3}>
                {item.show?.title ?? item.feedUrl}
              </Text>
              <Text className="text-[13px] text-muted">
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
