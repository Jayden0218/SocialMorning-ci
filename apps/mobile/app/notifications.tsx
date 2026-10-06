// Notifications: Interactions aimed at you, People you follow; System and From hosts open their pages.
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
 *
 * M19 T100 (US10, FR-062): a third tab, From hosts — the announcements of the shows you follow,
 * newest first, each shown only from its release time (the server filters). A white card: the
 * show's artwork and title, the text, up to 9 pictures in a three-column grid, and the time;
 * tapping the card opens the show. 20 a page; the list ends with "No more to fetch".
 *
 * M21 US10 (T108): System and From hosts move to their own pages (`notifications/system.tsx`,
 * `notifications/hosts.tsx`), opened from two cards at the top. The track switches between
 * Interactions — replies, likes, mentions and follows aimed at you (GET /v1/me/notifications),
 * each row opening its target — and People (the feed, as before). Interactions is first. Opening
 * Interactions marks them read (POST /v1/me/notifications/seen) after the unread ones are counted.
 */
import { router, useFocusEffect } from 'expo-router';
import { Link } from '@/design/tailwind';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList } from '@/ui/lib/flat-list';
import { usePullRefresh } from '@/ui/kit/PullRefresh';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { useColours } from '@/ui/kit/useColours';
import { NoticeCards, NoticeEntries, noticeLine, type NoticeSection } from '@/ui/social/NoticeCards';
import { Card, CardDivider } from '@/ui/kit/Card';
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
import { Pressable } from '@/ui/lib/pressable';
import { Loader } from '@/ui/kit/Loader';
import { Avatar } from '@/ui/kit/Avatar';
import { ago } from '@/ui/kit/format';
import { noticeTarget, noticeVerb, useNotificationsApi, type Notice } from '@/social/notifications-api';

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

/** One interaction: the actor's photo, "Bea replied to your comment", the comment, the episode and when. */
function InteractionRow(props: { notice: Notice; now: number }): React.ReactElement {
  const n = props.notice;
  const what = `${n.actor.name} ${noticeVerb(n.kind)}`;
  const where = n.ref.episodeTitle ? ` · ${n.ref.episodeTitle}` : '';
  return (
    <Pressable
      onPress={() => router.push(noticeTarget(n))}
      accessibilityRole="link"
      accessibilityLabel={`${n.unread ? 'New. ' : ''}${what}${n.ref.excerpt ? `: ${n.ref.excerpt}` : ''}`}
      className="flex-row gap-row py-row items-start"
      style={{ minHeight: hit.min }}
    >
      <Avatar url={n.actor.avatarUrl} name={n.actor.name} size={40} />
      <Box className="flex-1 gap-0.5">
        <Text className="text-text text-body" numberOfLines={2}><Text className="text-text text-body font-bold">{n.actor.name}</Text> {noticeVerb(n.kind)}</Text>
        {n.ref.excerpt ? <Text className="text-muted text-meta" numberOfLines={2}>{n.ref.excerpt}</Text> : null}
        <Text className="text-muted text-xs" numberOfLines={1}>{ago(Date.parse(n.createdAt), props.now)}{where}</Text>
      </Box>
      {n.unread ? <Box className="w-2 h-2 rounded-pill bg-accent mt-2" accessible={false} /> : null}
    </Pressable>
  );
}

type InteractionsState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: Notice[]; next: string | null };

/** M21 US10: Interactions, newest first, 30 a page; marked read once the first page is in. */
function Interactions(props: { header: React.ReactElement; onUnread: (n: number) => void }): React.ReactElement {
  const api = useNotificationsApi();
  const { onUnread } = props;
  const [state, setState] = useState<InteractionsState>({ kind: 'loading' });
  const [paging, setPaging] = useState(false);
  const load = useCallback(() => {
    api.list().then((p) => {
      setState({ kind: 'ok', items: p.items, next: p.next });
      onUnread(p.items.filter((i) => i.unread).length);
      if (p.items.some((i) => i.unread)) void api.markSeen().catch(() => undefined);
    }).catch(() => setState((s) => (s.kind === 'ok' ? s : { kind: 'error' })));
  }, [api, onUnread]);
  useEffect(load, [load]);
  const more = () => {
    if (state.kind !== 'ok' || !state.next || paging) return;
    setPaging(true);
    api.list(state.next)
      .then((p) => setState({ kind: 'ok', items: [...state.items, ...p.items], next: p.next }))
      .catch(() => undefined)
      .finally(() => setPaging(false));
  };
  const now = Date.now();
  return (
    <FlatList
      className="flex-1 bg-background"
      data={state.kind === 'ok' ? state.items : []}
      keyExtractor={(n) => n.id}
      contentContainerClassName="px-screen-x pt-gap pb-24 flex-grow"
      ListHeaderComponent={props.header}
      ListEmptyComponent={
        state.kind === 'loading' ? <Box className="items-center p-4"><Loader /></Box>
          : state.kind === 'error' ? (
            <Box className="gap-row">
              <Text className="text-text text-body">Couldn't load your interactions right now.</Text>
              <Pressable onPress={() => { setState({ kind: 'loading' }); load(); }} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center self-start" style={{ minHeight: hit.min }}><Text className="text-accent text-body font-semibold">Retry</Text></Pressable>
            </Box>
          )
          : <EmptyPicture icon="chatbubbles-outline" line="Nothing yet. When someone replies to you, likes your comment, mentions you or follows you, it appears here." />
      }
      ListFooterComponent={state.kind === 'ok' && state.items.length > 0 ? (state.next ? <Box className="items-center py-row"><Loader /></Box> : <EndOfList />) : undefined}
      renderItem={({ item, index }) => (
        <Box>
          {index > 0 ? <CardDivider /> : null}
          <InteractionRow notice={item} now={now} />
        </Box>
      )}
      onEndReached={more}
    />
  );
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
  // M21 US10: Interactions first; System and From hosts are cards that open their own pages.
  const [section, setSection] = useState<NoticeSection>('interactions');
  const [mine, setMine] = useState(0);
  const unreadHere = section === 'interactions' ? mine : unread;
  const cards = (
    <Box className="mb-section">
      <NoticeEntries iconColour={c.muted} onOpen={(page) => router.push(page === 'system' ? '/notifications/system' : '/notifications/hosts')} />
      <NoticeCards section={section} unread={unread} interactionsUnread={mine} iconColour={c.muted} selectedIconColour={c.onPrimary} onSelect={setSection} />
      <Text className="text-muted text-xs mt-gap">{noticeLine(section, unreadHere)}</Text>
    </Box>
  );
  const days = useMemo(() => byDay(safetyFilter.feed(view?.items ?? []), new Date()), [safetyFilter, view]);

  if (section === 'interactions') {
    if (!listener) {
      return (
        <>
        <PageHeader title="Notifications" />
        <Box className="flex-1 bg-background px-screen-x pt-gap">
          {cards}
          <Text className="text-muted text-body">Sign in to see replies, likes, mentions and new followers.</Text>
        </Box>
        </>
      );
    }
    return (
      <>
      <PageHeader title="Notifications" />
      <Interactions header={cards} onUnread={setMine} />
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
