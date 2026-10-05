// Notifications: System messages and People (what listeners you follow did).
/**
 * Notifications (我的通知, M10, owner 2026-09-27): two cards — System (messages from
 * SocialNet; none are sent yet, so it says so) and People (the activity of listeners you
 * follow: listens, comments, clips — M4's Following feed, which used to be a tab) — then
 * that activity below. Opening the page marks it read, as the Following tab did.
 *
 * M17 (`Following-B` for People, `Notifications-B` for System): the Editorial page — the
 * serif "Notifications" title, the two tabs as one pill track with the tab's line under it,
 * then the activity grouped by day ("Today", "Yesterday", then the date) under a small-capitals
 * label, each day's items in one white card divided by hairlines. System keeps its empty
 * picture under the same track. Loading, pull to refresh, paging and mark-as-read unchanged.
 */
import { router, useFocusEffect } from 'expo-router';
import { Link } from '@/design/tailwind';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList } from '@/ui/lib/flat-list';
import { usePullRefresh } from '@/ui/kit/PullRefresh';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { useColours } from '@/ui/kit/useColours';
import { NoticeCards, noticeLine, type NoticeSection } from '@/ui/social/NoticeCards';
import { Card } from '@/ui/kit/Card';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { hit } from '@/design';
import { createFeed, type FeedView } from '@/graph/feed';
import { useSafety } from '@/safety/context';
import type { FeedItem as Item } from '@/social/api';
import { useSocial } from '@/social/context';
import { EmptyState } from '@/ui/kit/EmptyState';
import { FeedItem } from '@/ui/social/FeedItem';
import { EmptyPicture } from '@/ui/me/parts';
import { useStores } from '@/ui/shell/providers';
import { PageHeader } from '@/ui/kit/PageHeader';
import { EndOfList } from '@/ui/kit/EndOfList';

type Day = { key: string; label: string; items: Item[] };

/** `Following-B`: the feed in day groups, newest first as the server sent it. */
function byDay(items: readonly Item[], now: Date): Day[] {
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const out: Day[] = [];
  for (const item of items) {
    const d = new Date(item.createdAt);
    const key = dayKey(d);
    const last = out[out.length - 1];
    if (last && last.key === key) { last.items.push(item); continue; }
    const label = key === today ? 'Today' : key === yesterday ? 'Yesterday' : d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' as const }) });
    out.push({ key, label, items: [item] });
  }
  return out;
}

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
  const pull = usePullRefresh(refreshing, () => void refresh());
  useEffect(() => { feed.markOpened(); }, [feed, view]);

  const open = (item: Item) => {
    if (item.kind === 'clipped' && item.refId) router.push({ pathname: '/clip/[id]', params: { id: item.refId } });
    else router.push({ pathname: '/episode/[id]', params: { id: item.episode.id, ...(item.momentMs !== null ? { at: String(item.momentMs) } : {}) } });
  };

  const c = useColours(stores.settings);
  // M12 FR-001 (B2): the cards choose what is listed; People (the feed) first, as before.
  const [section, setSection] = useState<NoticeSection>('people');
  const cards = (
    <Box className="mb-section">
      <NoticeCards section={section} unread={unread} iconColour={c.muted} selectedIconColour={c.onPrimary} onSelect={setSection} />
      <Text className="text-muted text-xs mt-gap">{noticeLine(section, unread)}</Text>
    </Box>
  );
  const days = useMemo(() => byDay(safetyFilter.feed(view?.items ?? []), new Date()), [safetyFilter, view]);

  if (section === 'system') {
    return (
      <>
      <PageHeader title="Notifications" />
      <Box className="flex-1 bg-background px-screen-x pt-gap">
        {cards}
        <EmptyPicture icon="notifications-outline" line="No messages from SocialNet yet — announcements and account notices will appear here" />
      </Box>
      </>
    );
  }

  if (!listener) {
    return (
      <>
      <PageHeader title="Notifications" />
      <Box className="flex-1 bg-background px-screen-x pt-gap">
        {cards}
        <Card className="py-section">
          <Text className="text-muted text-body">Sign in to follow people and see what they listen to.</Text>
          <Link href="/auth/sign-in" className="text-accent text-body font-semibold mt-gap py-row" style={{ minHeight: hit.min }} accessibilityRole="link">Sign in</Link>
        </Card>
      </Box>
      </>
    );
  }
  return (
    <>
    <PageHeader title="Notifications" />
    <Box className="flex-1 bg-background">
    {pull.backdrop}
    <FlatList
      className="flex-1"
      data={days}
      // Owner, 2026-10-05: the bottom of a fetched list says so.
      ListFooterComponent={days.length > 0 && !view?.next ? <EndOfList /> : undefined}
      keyExtractor={(d) => d.key}
      contentContainerClassName="px-screen-x pt-gap pb-24 gap-section flex-grow"
      refreshControl={pull.refreshControl}
      onScroll={pull.onScroll}
      scrollEventThrottle={pull.scrollEventThrottle}
      ListHeaderComponent={
        <Box>
          {pull.inline}
          {cards}
          {view?.stale ? <Text className="text-accent text-meta bg-surface border border-border p-row rounded-row">Couldn't refresh — showing what was fetched {view.fetchedAt ? new Date(view.fetchedAt).toLocaleTimeString() : 'earlier'}.</Text> : null}
        </Box>
      }
      ListEmptyComponent={!refreshing ? (
        (view?.stale ?? false)
          ? <EmptyState surface="feed" offline hasCache={false} onRetry={() => void refresh()} />
          : <EmptyPicture icon="sparkles-outline" line="No activity yet — follow people from their profile" />
      ) : undefined}
      renderItem={({ item: day }) => (
        <Box>
          <Eyebrow className="mb-gap">{day.label}</Eyebrow>
          <Card>
            {day.items.map((item, i) => <FeedItem key={String(item.id)} item={item} onOpen={open} last={i === day.items.length - 1} />)}
          </Card>
        </Box>
      )}
      onEndReached={() => {
        const next = view?.next;
        if (!next || refreshing) return;
        void feed.more(next).then((m) => setView((v) => v ? { ...v, items: [...v.items, ...m.items], ...(m.next ? { next: m.next } : { next: undefined }) } : v));
      }}
    />
    </Box>
    </>
  );
}
