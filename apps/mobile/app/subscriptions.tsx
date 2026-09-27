/**
 * My subscriptions (M10): the shows you follow — the list the Library tab used to be,
 * opened from the Updates tab's "My subscriptions" button. Refreshes in the background;
 * a feed that fails keeps its cached copy and says so (Principle IV).
 */
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList } from '../src/ui/lib/flat-list';
import { Pressable } from '../src/ui/lib/pressable';
import { Text } from '../src/ui/lib/text';
import { Box } from '../src/ui/lib/box';
import { refreshAll } from '../src/feeds/refresh-all';
import { useSafety } from '../src/safety/context';
import type { CachedShow } from '../src/storage/types';
import { Artwork } from '../src/ui/Artwork';
import { EmptyState } from '../src/ui/EmptyState';
import { shortDate } from '../src/ui/format';
import { useStores } from '../src/ui/providers';

type Row = { feedUrl: string; show: CachedShow | undefined; stale: boolean };

export default function SubscriptionsScreen(): React.ReactElement {
  const stores = useStores();
  const { safety, hiddenFeeds } = useSafety();
  const [rows, setRows] = useState<Row[]>([]);
  const read = useCallback((stale: Set<string>): Row[] =>
    stores.subscriptions.list().map(({ feedUrl }) => ({ feedUrl, show: stores.feeds.getShow(feedUrl), stale: stale.has(feedUrl) })), [stores]);
  useFocusEffect(useCallback(() => {
    let live = true;
    setRows(read(new Set()));
    void refreshAll(stores, Date.now()).then((r) => { if (live) setRows(read(new Set(r.stale))); });
    return () => { live = false; };
  }, [read, stores]));

  return (
    <FlatList
      className="flex-1 bg-background"
      data={rows}
      keyExtractor={(r) => r.feedUrl}
      contentContainerClassName="px-screen-x py-row pb-24"
      ListEmptyComponent={<EmptyState surface="library" />}
      renderItem={({ item }) => {
        const latest = stores.feeds.listEpisodes(item.feedUrl)[0]?.publishedAt;
        const line = [latest === undefined ? 'No episodes yet' : `Latest ${shortDate(latest)}`, item.stale ? 'offline copy' : undefined,
          safety.isHidden('show', item.feedUrl) ? 'reported' : hiddenFeeds.has(item.feedUrl) ? 'hidden from discovery' : undefined].filter(Boolean).join(' · ');
        return (
          <Link href={{ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(item.feedUrl) } }} asChild>
            <Pressable className="flex-row gap-row py-row items-center" accessibilityRole="button" accessibilityLabel={`${item.show?.title ?? item.feedUrl}. ${line}`}>
              <Artwork url={item.show?.imageUrl} size={56} rounded="row" />
              <Box className="flex-1">
                <Text className="text-text text-sm font-semibold" numberOfLines={2}>{item.show?.title ?? item.feedUrl}</Text>
                <Text className="text-muted text-xs">{line}</Text>
              </Box>
            </Pressable>
          </Link>
        );
      }}
    />
  );
}
