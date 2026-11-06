// Notifications: Interactions aimed at you, People you follow; System and From hosts open their pages.
/**
 * Spec 039 US1/US2 (T016, `design/B-Notifications.dc.html`): the page is a `Page` (Back + title). ONE chip row holds People, Interactions (its
 * unread badge) and the links System › and Hosts ›; a failed refresh is an `InlineNotice` with Retry; a day is a small caps heading and an item
 * is ONE card (the person and what they did, the quote, an episode strip, the time at the right). No vertical day label, no spine, no tiles.
 * Pull to refresh (People) and load-more-on-scroll (both lists) go through `Page`'s `scroll` prop. Destinations are unchanged (D2).
 *
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
 * Before spec 039 (the page as M31 drew it, with a spine; the Spec 039 paragraph below is what the page is now) — M31 W4-C (T052; design-pulse2 `social.html#notifications--people`, `--signed-out`, `--people-empty`, `--feed-offline`, `--interactions`,
 * `--interactions-signed-out`, `--interactions-empty`, `--interactions-error`, `--mute-sheet`, `--toast`; layout pattern Thread): the title
 * bar is low with the People | Interactions switch above its row and the line that says what the view holds; System and From hosts are
 * two 1 x 1 tiles at the top; the activity hangs on the spine, newest first, under a section heading naming the day. A People card is
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
import { usePullRefresh } from '@/ui/kit/PullRefresh';
import { Box } from '@/ui/lib/box';
import { type NoticeSection } from '@/ui/social/NoticeCards';
import { spacing } from '@/design';
import { createFeed, type FeedView } from '@/graph/feed';
import { useSafety } from '@/safety/context';
import type { FeedItem as Item } from '@/social/api';
import { useSocial } from '@/social/context';
import { EmptyState } from '@/ui/kit/EmptyState';
import { useStores, useToast } from '@/ui/shell/providers';
import { Loader } from '@/ui/kit/Loader';
import { EndOfList } from '@/ui/kit/EndOfList';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Avatar } from '@/ui/kit/Avatar';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { InlineNotice, Page } from '@/ui/kit/layout';
import { noticeTarget, useNotificationsApi, type Notice } from '@/social/notifications-api';
import { m22NoticeTarget, m22NoticeVerb, noticeThread, useM22SocialApi, type NoticeRef } from '@/social/api-m22-social';
import { SignInBlock } from '@/ui/chat/blocks';
import { clockLabel } from '@/ui/chat/nodes';
import { MenuRow } from '@/ui/comments/MenuRows';
import { GhostRows } from '@/ui/comments/Spine';
import { groupByDay, NOTIF } from '@/ui/notifications/parts';
import { BackButton, Day, EmptyBlock, FeedCard, NoticeChips, NoticeItemCard } from '@/ui/notifications/cards';
import { nowMs as clockMs } from '@/ui/kit/clock';

/** How close to the foot (points) the next page is asked for. */
const NEAR_END = 400;
const NO_NOTICES: Notice[] = [];
const nearEnd = (e: NativeSyntheticEvent<NativeScrollEvent>): boolean => {
  const m = e.nativeEvent;
  return m.contentOffset.y + m.layoutMeasurement.height > m.contentSize.height - NEAR_END;
};

/** One interaction: the actor's photo, "Bea replied to your comment", the comment, the episode and when; M22: a ⋯ for "Mute this". */
function InteractionRow(props: { notice: Notice; glow: boolean; onMore?: (n: Notice) => void }): React.ReactElement {
  const n = props.notice;
  const verb = m22NoticeVerb(n.kind);
  const what = `${n.actor.name} ${verb}`;
  const target = m22NoticeTarget(n.kind, n.ref as NoticeRef);
  return (
    <NoticeItemCard
      unread={n.unread}
      glow={props.glow}
      who={n.actor.name}
      verb={verb}
      avatar={<Avatar url={n.actor.avatarUrl} name={n.actor.name} size={NOTIF.noticeAvatar} />}
      time={clockLabel(new Date(n.createdAt))}
      excerpt={n.ref.excerpt}
      episodeTitle={n.ref.episodeTitle}
      label={`${n.unread ? 'New. ' : ''}${what}${n.ref.excerpt ? `: ${n.ref.excerpt}` : ''}`}
      onOpen={() => { if (target) router.push(target as never); else router.push(noticeTarget(n)); }}
      moreLabel={`More for ${what}`}
      {...(props.onMore ? { onMore: () => props.onMore?.(n) } : {})}
    />
  );
}

type InteractionsState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: Notice[]; next: string | null };

/** M21 US10: Interactions, newest first, 30 a page; marked read once the first page is in. */
function Interactions(props: { onUnread: (n: number) => void; moreRef: { current: (() => void) | undefined } }): React.ReactElement {
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
  // The page's scroll view asks for the next page through this.
  const { moreRef } = props;
  useEffect(() => { moreRef.current = more; });
  useEffect(() => () => { moreRef.current = undefined; }, [moreRef]);
  const items = state.kind === 'ok' ? state.items : NO_NOTICES;
  const groups = useMemo(() => groupByDay(items, (n) => n.createdAt, new Date(clockMs())), [items]);
  const newest = items.find((i) => i.unread)?.id;
  return (
    <>
      {state.kind === 'loading' ? (
        <Box testID="interactions-loading"><GhostRows rows={5} /></Box>
      ) : state.kind === 'error' ? (
        <InlineNotice text="Couldn't load your interactions right now." actionLabel="Retry" onAction={() => { setState({ kind: 'loading' }); load(); }} />
      ) : items.length === 0 ? (
        <EmptyBlock title="No activity yet" line="Nothing yet. When someone replies to you, likes your comment, mentions you or follows you, it appears here." />
      ) : (
        <>
          {groups.map((g) => (
            <Day key={g.key} label={g.label}>
              {g.items.map((item) => (
                <InteractionRow key={item.id} notice={item} glow={item.id === newest} {...(noticeThread(item.kind, item.ref as NoticeRef) ? { onMore: setMenu } : {})} />
              ))}
            </Day>
          ))}
          {state.next ? <Box className="items-center py-row"><Loader /></Box> : <EndOfList />}
        </>
      )}
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
  const feed = useMemo(() => createFeed({ api, cache: stores.feedCache, settings: stores.settings, now: clockMs }), [api, stores]);
  const [view, setView] = useState<FeedView | undefined>(() => feed.cached());
  // F3: what was new when this visit began (before it marks everything read), counted over whatever items are in hand — the cached copy at
  // first, then the fetched page. It was counted once from the cache alone, so a cold cache printed no badge on People for ever.
  const [since] = useState(() => feed.lastOpened());
  const [refreshing, setRefreshing] = useState(false);
  // Only a pull opens the platform refresh gap (iOS moves the page down while `refreshing` is true): the refresh that opening the page
  // starts must not, or the title sits ~120 pt low until it ends (simulator run 42195300126).
  const [pulling, setPulling] = useState(false);
  const refresh = useCallback(async (pulled = false) => {
    setRefreshing(true);
    if (pulled) setPulling(true);
    try { setView(await feed.refresh()); } finally { setRefreshing(false); setPulling(false); }
  }, [feed]);
  useFocusEffect(useCallback(() => { feed.markOpened(); void refresh(); }, [feed, refresh]));
  useEffect(() => { feed.markOpened(); }, [feed, view]);
  const unread = useMemo(() => feed.unreadSince(view?.items ?? [], since), [feed, view, since]);

  const open = (item: Item) => {
    if (item.kind === 'clipped' && item.refId) router.push({ pathname: '/clip/[id]', params: { id: item.refId } });
    else router.push({ pathname: '/episode/[id]', params: { id: item.episode.id, ...(item.momentMs !== null ? { at: String(item.momentMs) } : {}) } });
  };

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
  const moreRef = useRef<(() => void) | undefined>(undefined);
  const pull = usePullRefresh(pulling, () => void refresh(true));
  const days = useMemo(() => groupByDay(safetyFilter.feed(view?.items ?? []), (i) => i.createdAt, new Date(clockMs())), [safetyFilter, view]);
  const signInLine = section === 'people' ? 'Sign in to follow people and see what they listen to.' : 'Sign in to see replies, likes, mentions and new followers.';
  const chips = (
    <NoticeChips section={section} unread={unread} interactionsUnread={mine} onSelect={choose} onOpen={(page) => router.push(page === 'system' ? '/notifications/system' : '/notifications/hosts')} />
  );
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (section === 'interactions') { if (nearEnd(e)) moreRef.current?.(); return; }
    pull.onScroll(e);
    const next = view?.next;
    if (next && !refreshing && nearEnd(e)) {
      void feed.more(next).then((m) => setView((v) => v ? { ...v, items: [...v.items, ...m.items], ...(m.next ? { next: m.next } : { next: undefined }) } : v));
    }
  };

  const body = (): React.ReactNode => {
    if (!listener) {
      return (
        <Box style={{ paddingTop: spacing.group }}>
          <SignInBlock line={signInLine}>
            <PulseButton label="Sign in" accessibilityLabel="Sign in" onPress={() => router.push('/auth/sign-in')} full />
          </SignInBlock>
        </Box>
      );
    }
    if (section === 'interactions') return <Interactions onUnread={setMine} moreRef={moreRef} />;
    const lastItem = view?.next === undefined;
    const shown = view?.stale && days.length > 0
      ? <InlineNotice text={view.fetchedAt ? `Offline · fetched ${clockLabel(new Date(view.fetchedAt))}` : 'Offline · showing what was fetched earlier'} actionLabel="Retry" onAction={() => void refresh()} />
      : null;
    if (days.length === 0) {
      return refreshing ? null : (view?.stale ?? false)
        ? <EmptyState surface="feed" offline hasCache={false} block onRetry={() => void refresh()} />
        : <EmptyBlock title="No activity yet" line="No activity yet — follow people from their profile" />;
    }
    return (
      <>
        {shown}
        {days.map((day) => (
          <Day key={day.key} label={day.label}>
            {day.items.map((item) => <FeedCard key={String(item.id)} item={item} onOpen={open} />)}
          </Day>
        ))}
        {/* Owner, 2026-10-05: the bottom of a fetched list says so. */}
        {lastItem ? <EndOfList /> : <Box className="items-center py-row"><Loader /></Box>}
      </>
    );
  };

  return (
    <Page title="Notifications" leading={<BackButton />} now scroll={{ ...(section === 'people' && listener ? { refreshControl: pull.refreshControl } : {}), onScroll, scrollEventThrottle: section === 'people' ? pull.scrollEventThrottle : 100 }}>
      {section === 'people' ? pull.inline : null}
      {chips}
      {body()}
    </Page>
  );
}
