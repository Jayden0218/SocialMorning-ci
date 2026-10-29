// Notifications: Interactions aimed at you, People you follow; System and From hosts open their pages.
/**
 * Notifications (我的通知, M10, owner 2026-09-27): two cards — System (messages from
 * SocialNet; none are sent yet, so it says so) and People (the activity of listeners you
 * follow: listens, comments, clips — M4's Following feed, which used to be a tab) — then
 * that activity below. Opening the page marks it read, as the Following tab did.
 *
 * M17 (`Following-B` for People, `Notifications-B` for System): the Editorial page.
 *
 * M19 T100 (US10, FR-062): a third tab, From hosts — the announcements of the shows you follow,
 * newest first, each shown only from its release time (the server filters). 20 a page.
 *
 * M21 US10 (T108): System and From hosts move to their own pages (`notifications/system.tsx`,
 * `notifications/hosts.tsx`), opened from two cards at the top. The track switches between
 * Interactions — replies, likes, mentions and follows aimed at you (GET /v1/me/notifications),
 * each row opening its target — and People (the feed, as before). Opening
 * Interactions marks them read (POST /v1/me/notifications/seen) after the unread ones are counted.
 *
 * M24 US20 (`Notifications-B`): the page opens on People; People / Interactions are two pills.
 *
 * M22 US3 (FR-011, T016): each interaction row has a ⋯ with "Mute this" — no more notices or
 * pushes from that comment thread or like-post (PUT /v1/me/muted-threads); Settings › Privacy
 * lists them. Rows also read and open the new kinds: comments and reactions on your like,
 * replies and reactions on your status, and a status reaching 100 reactions.
 *
 * M31 W4-C (T052; design-pulse2 `social.html#notifications--people`, `--signed-out`, `--people-empty`, `--feed-offline`, `--interactions`,
 * `--interactions-signed-out`, `--interactions-empty`, `--interactions-error`, `--mute-sheet`, `--toast`; layout pattern Thread): the title
 * bar is low with the People | Interactions switch above its row and the line that says what the view holds; System and From hosts are
 * two 1 x 1 tiles at the top; the activity hangs on the spine, newest first, under an edge label naming the day. A People card is
 * the person, what they did, the kind's mark and the episode (`FeedItem`); an Interaction hangs from a hot dot when unread (the
 * newest glows) with a 3 wide hot edge on its card, from a time tick when read. Loading is ghost rows on the spine; a failed
 * Interactions load is an error card on the spine with Retry; signed out, a lock block with a light Sign in; the mute sheet is the
 * kit sheet with the notice's sentence over one 52 row.
 *
 * Not as drawn: the drawing hides the switch signed out, which would leave "Sign in to see replies, likes, mentions and new
 * followers." unreachable (and the capture step "tap Interactions" with it), so the switch stays; the toast sits where the
 * pushed-page toast sits (the drawing lifts it to 196 over the switch — the shell's toast placement has no entry for this page).
 */
import { reportAndDrop } from '@/telemetry/reportError';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { ScrollView } from '@/ui/lib/scroll-view';
import { usePullRefresh } from '@/ui/kit/PullRefresh';
import { Text } from '@/ui/kit/Text';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { NoticeCards, NoticeEntries, NOTICE, noticeLine, type NoticeSection } from '@/ui/social/NoticeCards';
import { colour, spacing } from '@/design';
import { createFeed, type FeedView } from '@/graph/feed';
import { useSafety } from '@/safety/context';
import type { FeedItem as Item } from '@/social/api';
import { useSocial } from '@/social/context';
import { EmptyState } from '@/ui/kit/EmptyState';
import { FeedItem } from '@/ui/social/FeedItem';
import { useStores, useToast } from '@/ui/shell/providers';
import { EndOfList } from '@/ui/kit/EndOfList';
import { Loader } from '@/ui/kit/Loader';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Avatar } from '@/ui/kit/Avatar';
import { Icon } from '@/ui/kit/Icon';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { noticeTarget, useNotificationsApi, type Notice } from '@/social/notifications-api';
import { m22NoticeTarget, m22NoticeVerb, noticeThread, useM22SocialApi, type NoticeRef } from '@/social/api-m22-social';
import { CenterAt, SignInBlock } from '@/ui/chat/blocks';
import { clockLabel, tickLabel } from '@/ui/chat/nodes';
import { MenuRow } from '@/ui/comments/MenuRows';
import { GhostRows, Tick } from '@/ui/comments/Spine';
import { ageLabel, PageEmpty, ThreadNode } from '@/ui/me/lists';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { DayBlock, groupByDay, NOTIF, NotifCard, SpineColumn, StaleLine, UnreadDot } from '@/ui/notifications/parts';

/** How close to the foot (points) the next page is asked for. */
const NEAR_END = 400;
const nearEnd = (e: NativeSyntheticEvent<NativeScrollEvent>): boolean => {
  const m = e.nativeEvent;
  return m.contentOffset.y + m.layoutMeasurement.height > m.contentSize.height - NEAR_END;
};

/** One interaction: the actor's photo, "Bea replied to your comment", the comment, the episode and when; M22: a ⋯ for "Mute this". */
function InteractionRow(props: { notice: Notice; now: number; onMore?: (n: Notice) => void }): React.ReactElement {
  const n = props.notice;
  const verb = m22NoticeVerb(n.kind);
  const what = `${n.actor.name} ${verb}`;
  const where = n.ref.episodeTitle ? ` · ${n.ref.episodeTitle}` : '';
  const target = m22NoticeTarget(n.kind, n.ref as NoticeRef);
  return (
    <NotifCard testID="notice-card" unread={n.unread}>
      <Box className="flex-row items-start" style={{ gap: spacing.row - 2 }}>
        <Pressable
          onPress={() => { if (target) router.push(target as never); else router.push(noticeTarget(n)); }}
          accessibilityRole="link"
          accessibilityLabel={`${n.unread ? 'New. ' : ''}${what}${n.ref.excerpt ? `: ${n.ref.excerpt}` : ''}`}
          className="flex-1 flex-row items-start"
          style={{ gap: spacing.row - 2 }}
        >
          <Avatar url={n.actor.avatarUrl} name={n.actor.name} size={NOTIF.noticeAvatar} />
          <Box className="flex-1 min-w-0" style={{ gap: 5 }}>
            <Type step="quote" className="text-text" numberOfLines={2}><Text className="text-text font-bold">{n.actor.name}</Text>{` ${verb}`}</Type>
            {n.ref.excerpt ? <Type step="caption" className="text-text2" numberOfLines={2}>{`“${n.ref.excerpt}”`}</Type> : null}
            <Type step="tag" className="text-text3" numberOfLines={1}>{`${ageLabel(Date.parse(n.createdAt), props.now)}${where}`}</Type>
          </Box>
        </Pressable>
        {props.onMore ? (
          <Pressable onPress={() => props.onMore?.(n)} accessibilityRole="button" accessibilityLabel={`More for ${what}`} hitSlop={spacing.gap + 2} className="items-center justify-center">
            <Icon name="ellipsis-horizontal" size={NOTIF.noticeMore} color={colour.text2} />
          </Pressable>
        ) : null}
      </Box>
    </NotifCard>
  );
}

type InteractionsState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: Notice[]; next: string | null };

/** M21 US10: Interactions, newest first, 30 a page; marked read once the first page is in. */
function Interactions(props: { header: React.ReactElement; reserve: number; onUnread: (n: number) => void }): React.ReactElement {
  const api = useNotificationsApi();
  const m22 = useM22SocialApi();
  const toast = useToast();
  // M22 US3: the notice whose ⋯ is open.
  const [menu, setMenu] = useState<Notice | undefined>();
  const muteMenu = () => {
    const thread = menu ? noticeThread(menu.kind, menu.ref as NoticeRef) : undefined;
    setMenu(undefined);
    if (!thread) return;
    m22.muteThread(thread).then(() => toast('Muted. No more notices from this thread.')).catch(() => toast("Couldn't mute — try again when you're online."));
  };
  const { onUnread } = props;
  const [state, setState] = useState<InteractionsState>({ kind: 'loading' });
  const [paging, setPaging] = useState(false);
  // M32 T090: a late answer after leaving the screen changes nothing.
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = useCallback(() => {
    api.list().then((p) => {
      if (!mounted.current) return;
      setState({ kind: 'ok', items: p.items, next: p.next });
      onUnread(p.items.filter((i) => i.unread).length);
      if (p.items.some((i) => i.unread)) void api.markSeen().catch(reportAndDrop('notifications.seen'));
    }).catch(() => { if (mounted.current) setState((s) => (s.kind === 'ok' ? s : { kind: 'error' })); });
  }, [api, onUnread]);
  useEffect(() => { load(); }, [load]);
  const more = () => {
    if (state.kind !== 'ok' || !state.next || paging) return;
    setPaging(true);
    api.list(state.next)
      .then((p) => setState({ kind: 'ok', items: [...state.items, ...p.items], next: p.next }))
      .catch(() => undefined)
      .finally(() => setPaging(false));
  };
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const items = state.kind === 'ok' ? state.items : [];
  const groups = useMemo(() => groupByDay(items, (n) => n.createdAt, new Date()), [items]);
  const newest = items.find((i) => i.unread)?.id;
  return (
    <>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: props.reserve }}
        scrollEventThrottle={100}
        onScroll={(e) => { if (nearEnd(e)) more(); }}
      >
        {props.header}
        {state.kind === 'loading' ? (
          <Box testID="interactions-loading" style={{ marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right }}><GhostRows rows={5} /></Box>
        ) : state.kind === 'error' ? (
          <SpineColumn>
            <DayBlock>
              <NotifCard testID="interactions-error" pad={NOTIF.errPad} gap={NOTIF.errGap}>
                <Type step="row" className="text-text">Couldn't load your interactions right now.</Type>
                <PulseButton label="Retry" accessibilityLabel="Retry" onPress={() => { setState({ kind: 'loading' }); load(); }} height={40} className="self-start" />
              </NotifCard>
            </DayBlock>
          </SpineColumn>
        ) : items.length === 0 ? (
          <PageEmpty top={ME_MOSAIC.row} title="No activity yet" line="Nothing yet. When someone replies to you, likes your comment, mentions you or follows you, it appears here." />
        ) : (
          <SpineColumn>
            {groups.map((g) => (
              <DayBlock key={g.key} label={g.label}>
                {g.items.map((item) => (
                  <ThreadNode
                    key={item.id}
                    lead={item.unread ? <UnreadDot glow={item.id === newest} /> : <Tick text={tickLabel(new Date(item.createdAt), undefined, now)} />}
                  >
                    <InteractionRow notice={item} now={nowMs} {...(noticeThread(item.kind, item.ref as NoticeRef) ? { onMore: setMenu } : {})} />
                  </ThreadNode>
                ))}
              </DayBlock>
            ))}
            {state.next ? <Box className="items-center py-row"><Loader /></Box> : <EndOfList />}
          </SpineColumn>
        )}
      </ScrollView>
      <ActionSheet open={menu !== undefined} onClose={() => setMenu(undefined)} label="Mute this thread">
        {menu ? <Type step="compact" className="text-text2">{`${menu.actor.name} ${m22NoticeVerb(menu.kind)}`}</Type> : null}
        <MenuRow icon="notifications-outline" label="Mute this" detail="No more notices from this thread" onPress={muteMenu} />
        <PulseButton label="Cancel" kind="quiet" onPress={() => setMenu(undefined)} full />
      </ActionSheet>
    </>
  );
}

export default function NotificationsScreen(): React.ReactElement {
  const { api, listener } = useSocial();
  const safetyFilter = useSafety();
  const stores = useStores();
  const feed = useMemo(() => createFeed({ api, cache: stores.feedCache, settings: stores.settings, now: () => Date.now() }), [api, stores]);
  const [view, setView] = useState<FeedView | undefined>(() => feed.cached());
  // F3: what was new when this visit began (before it marks everything read), counted over whatever items are in hand — the cached copy at
  // first, then the fetched page. It was counted once from the cache alone, so a cold cache printed no badge on People for ever.
  const [since] = useState(() => feed.lastOpened());
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { setView(await feed.refresh()); } finally { setRefreshing(false); }
  }, [feed]);
  useFocusEffect(useCallback(() => { feed.markOpened(); void refresh(); }, [feed, refresh]));
  const pull = usePullRefresh(refreshing, () => void refresh());
  useEffect(() => { feed.markOpened(); }, [feed, view]);
  const unread = useMemo(() => feed.unreadSince(view?.items ?? [], since), [feed, view, since]);

  const open = (item: Item) => {
    if (item.kind === 'clipped' && item.refId) router.push({ pathname: '/clip/[id]', params: { id: item.refId } });
    else router.push({ pathname: '/episode/[id]', params: { id: item.episode.id, ...(item.momentMs !== null ? { at: String(item.momentMs) } : {}) } });
  };

  // M12 FR-001 (B2): the cards choose what is listed; People (the feed) first, as before.
  // M21 US10: System and From hosts are cards that open their own pages.
  // M24 US20 (`Notifications-B`): the page opens on People (the feed of people you follow).
  const [section, setSection] = useState<NoticeSection>('people');
  const [mine, setMine] = useState(0);
  // F3: the drawing prints both counts on both choices. Interactions' is peeked here without marking anything seen (opening Interactions marks
  // them read and then counts them itself); a peek that lands after Interactions was opened is dropped.
  const notices = useNotificationsApi();
  const opened = useRef(false);
  useEffect(() => {
    if (!listener) return;
    let live = true;
    notices.list().then((p) => { if (live && !opened.current) setMine(p.items.filter((i) => i.unread).length); }).catch(() => undefined);
    return () => { live = false; };
  }, [notices, listener]);
  const choose = (s: NoticeSection) => { if (s === 'interactions') opened.current = true; setSection(s); };
  const unreadHere = section === 'interactions' ? mine : unread;
  const tiles = (
    <Box testID="notice-header" style={{ paddingTop: NOTIF.tilesBelowStatus, paddingBottom: NOTIF.tilesToSpine }}>
      <NoticeEntries onOpen={(page) => router.push(page === 'system' ? '/notifications/system' : '/notifications/hosts')} />
    </Box>
  );
  const days = useMemo(() => groupByDay(safetyFilter.feed(view?.items ?? []), (i) => i.createdAt, new Date()), [safetyFilter, view]);
  const switcher = <NoticeCards section={section} unread={unread} interactionsUnread={mine} onSelect={choose} />;
  const signInLine = section === 'people' ? 'Sign in to follow people and see what they listen to.' : 'Sign in to see replies, likes, mentions and new followers.';
  const sub = noticeLine(section, unreadHere);

  return (
    <PushedPage title="Notifications" subtitle={sub} extra={switcher} extraAbove={NOTICE.switchHeight + spacing.gap}>
      {(layout) => {
        if (!listener) {
          return (
            <CenterAt top={250}>
              <SignInBlock line={signInLine}>
                <PulseButton label="Sign in" accessibilityLabel="Sign in" onPress={() => router.push('/auth/sign-in')} full />
              </SignInBlock>
            </CenterAt>
          );
        }
        const header = <Box style={{ paddingTop: layout.top }}>{tiles}</Box>;
        if (section === 'interactions') return <Interactions header={header} reserve={layout.reserve} onUnread={setMine} />;
        const lastItem = view?.next === undefined;
        return (
          <Box className="flex-1">
            {pull.backdrop}
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ flexGrow: 1, paddingBottom: layout.reserve }}
              refreshControl={pull.refreshControl}
              scrollEventThrottle={pull.scrollEventThrottle}
              onScroll={(e) => {
                pull.onScroll(e);
                const next = view?.next;
                if (next && !refreshing && nearEnd(e)) {
                  void feed.more(next).then((m) => setView((v) => v ? { ...v, items: [...v.items, ...m.items], ...(m.next ? { next: m.next } : { next: undefined }) } : v));
                }
              }}
            >
              {pull.inline}
              {header}
              {view?.stale ? <StaleLine text={`Couldn't refresh — showing what was fetched ${view.fetchedAt ? `at ${clockLabel(new Date(view.fetchedAt))}` : 'earlier'}`} /> : null}
              {days.length === 0 ? (
                refreshing ? null : (view?.stale ?? false)
                  ? <Box style={{ paddingTop: ME_MOSAIC.row }}><EmptyState surface="feed" offline hasCache={false} block onRetry={() => void refresh()} /></Box>
                  : <PageEmpty top={ME_MOSAIC.row} title="No activity yet" line="No activity yet — follow people from their profile" />
              ) : (
                <SpineColumn>
                  {days.map((day) => (
                    <DayBlock key={day.key} label={day.label}>
                      {day.items.map((item) => (
                        <ThreadNode key={String(item.id)} lead={<Tick text={clockLabel(new Date(item.createdAt))} />}>
                          <FeedItem item={item} onOpen={open} />
                        </ThreadNode>
                      ))}
                    </DayBlock>
                  ))}
                  {/* Owner, 2026-10-05: the bottom of a fetched list says so. */}
                  {lastItem ? <EndOfList /> : null}
                </SpineColumn>
              )}
            </ScrollView>
          </Box>
        );
      }}
    </PushedPage>
  );
}
