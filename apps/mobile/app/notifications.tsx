/**
 * Notifications (我的通知, M10, owner 2026-09-27): two cards — System (messages from
 * SocialNet; none are sent yet, so it says so) and People (the activity of listeners you
 * follow: listens, comments, clips — M4's Following feed, which used to be a tab) — then
 * that activity below. Opening the page marks it read, as the Following tab did.
 */
import { router, useFocusEffect } from 'expo-router';
import { Link } from '../src/design/tailwind';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList } from '../src/ui/lib/flat-list';
import { RefreshControl } from '../src/ui/lib/refresh-control';
import { Text } from '../src/ui/lib/text';
import { Box } from '../src/ui/lib/box';
import { useColours } from '../src/ui/useColours';
import { NoticeCards, type NoticeSection } from '../src/ui/NoticeCards';
import { createFeed, type FeedView } from '../src/graph/feed';
import { useSafety } from '../src/safety/context';
import type { FeedItem as Item } from '../src/social/api';
import { useSocial } from '../src/social/context';
import { EmptyState } from '../src/ui/EmptyState';
import { FeedItem } from '../src/ui/FeedItem';
import { EmptyPicture } from '../src/ui/me/parts';
import { useStores } from '../src/ui/providers';

export default function NotificationsScreen(): React.ReactElement {
  const { api, listener } = useSocial();
  const safetyFilter = useSafety();
  const stores = useStores();
  const feed = useMemo(() => createFeed({ api, cache: stores.feedCache, settings: stores.settings, now: () => Date.now() }), [api, stores]);
  const [view, setView] = useState<FeedView | undefined>(() => feed.cached());
  // Counted once, before this visit marks everything read.
  const [unread] = useState(() => feed.unread(feed.cached()?.items ?? []));
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

  const c = useColours(stores.settings);
  // M12 FR-001 (B2): the cards choose what is listed; People (the feed) first, as before.
  const [section, setSection] = useState<NoticeSection>('people');
  const cards = <NoticeCards section={section} unread={unread} iconColour={c.text} onSelect={setSection} />;

  if (section === 'system') {
    return (
      <Box className="flex-1 bg-background px-screen-x pt-section">
        {cards}
        <EmptyPicture icon="notifications-outline" line="No messages from SocialNet yet — announcements and account notices will appear here" />
      </Box>
    );
  }

  if (!listener) {
    return (
      <Box className="flex-1 bg-background px-screen-x pt-section">
        {cards}
        <Text className="text-muted text-sm">Sign in to follow people and see what they listen to.</Text>
        <Link href="/auth/sign-in" className="text-accent text-sm mt-row" accessibilityRole="link">Sign in</Link>
      </Box>
    );
  }
  return (
    <FlatList
      className="flex-1 bg-background"
      data={safetyFilter.feed(view?.items ?? [])}
      keyExtractor={(i) => String(i.id)}
      contentContainerClassName="px-screen-x pt-section pb-24 gap-2 flex-grow"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      ListHeaderComponent={
        <Box>
          {cards}
          {view?.stale ? <Text className="text-accent bg-surface p-2 rounded-row">Couldn't refresh — showing what was fetched {view.fetchedAt ? new Date(view.fetchedAt).toLocaleTimeString() : 'earlier'}.</Text> : null}
        </Box>
      }
      ListEmptyComponent={!refreshing ? (
        (view?.stale ?? false)
          ? <EmptyState surface="feed" offline hasCache={false} onRetry={() => void refresh()} />
          : <EmptyPicture icon="sparkles-outline" line="No activity yet — follow people from their profile" />
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
