// From hosts: announcements from the shows you follow, newest first; a card opens its show.
/**
 * M19 T100 (US10, FR-062): the announcements of the shows you follow, newest first, each shown
 * only from its release time (the server filters). The show's artwork and title, the text, up to 9
 * pictures, and the time; tapping the card opens the show. 20 a page; the list ends with "No more to fetch".
 *
 * M21 US10 (T108): moved out of the Notifications page's third tab into its own page, opened
 * from the "From hosts" card at the top of Notifications. Same cards, same paging.
 *
 * M31 W4-C (T052; design-pulse2 `social.html#notifications-hosts--screen`, `--signed-out`, `--empty`, `--load-failed`; layout pattern Thread):
 * the announcements hang on the spine, each ticked by its date, under an edge label ("This week", then "Earlier"). A card is raise (radius
 * 18, padding 12, 10 between parts): the show's cover (36, radius 10), "Show title ›" in Geist 600 14 with the date and time in mono 11,
 * the words in Geist 15 / 22, and the pictures as 120 x 90 thumbnails in a row. The title bar is low: "From hosts", "Shows you follow".
 *
 * Spec 039 (Feed lane, `design/B-Notifications.dc.html`): a `FeedPage`; "This week" and "Earlier" are small caps headings over the cards (no spine, no tick, no
 * edge label); a failed load is an `InlineNotice` with Retry; load more is the list's `onEndReached`.
 *
 * Not as drawn: the drawing says a picture opens full size; here a tap anywhere on the card opens the show, as before (the page has
 * never had a picture viewer, and the card is one button).
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/kit/Text';
import { Pressable } from '@/ui/lib/pressable';
import { Image } from '@/ui/lib/image';
import { Artwork } from '@/ui/kit/Artwork';
import { Loader } from '@/ui/kit/Loader';
import { EndOfList } from '@/ui/kit/EndOfList';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { InlineNotice } from '@/ui/kit/layout';
import { SignInBlock } from '@/ui/chat/blocks';
import { COMMENTS } from '@/ui/comments/measures';
import { spacing, typeStyle } from '@/design';
import { Day, EmptyBlock, ItemCard } from '@/ui/notifications/cards';
import { NOTIF } from '@/ui/notifications/parts';
import { FeedLoading, FeedPage } from '@/ui/feed/FeedPage';
import { useSocial } from '@/social/context';
import { useM19Api, type HostNotice } from '@/social/m19-api';
import { nowMs as clockMs } from '@/ui/kit/clock';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const NO_NOTICES: HostNotice[] = [];

const dateOf = (n: HostNotice): string => new Date(n.releaseAt).toLocaleDateString([], { day: 'numeric', month: 'short' });
const timeOf = (n: HostNotice): string => new Date(n.releaseAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** M19 T100: one announcement; the whole card opens the show. */
function HostNoticeCard(props: { notice: HostNotice }): React.ReactElement {
  const n = props.notice;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(n.feedUrl) } })}
      accessibilityRole="link"
      accessibilityLabel={`${n.showTitle}: ${n.body}${n.images.length > 0 ? `. ${n.images.length} ${n.images.length === 1 ? 'picture' : 'pictures'}` : ''}. Open the show`}
    >
      <ItemCard testID="host-card">
        <Box className="flex-row items-center" style={{ gap: spacing.row - 2 }}>
          <Artwork url={n.imageUrl} size={NOTIF.hostCover} name={n.showTitle} />
          <Box className="flex-1 min-w-0">
            <Box className="flex-row">
              <Text className="text-text font-semibold text-pulse-compact flex-shrink" style={typeStyle('compact')} numberOfLines={1}>{n.showTitle}</Text>
              <Text className="text-text font-semibold text-pulse-compact" style={typeStyle('compact')} accessible={false}>{' ›'}</Text>
            </Box>
            <Type step="tag" className="text-text3">{`${dateOf(n)} · ${timeOf(n)}`}</Type>
          </Box>
        </Box>
        <Type step="body" className="text-text">{n.body}</Type>
        {n.images.length > 0 ? (
          <Box className="flex-row flex-wrap" style={{ gap: NOTIF.pictureGap }}>
            {n.images.slice(0, 9).map((u) => <Image key={u} source={{ uri: u }} className="bg-raise2" style={{ width: NOTIF.pictureW, height: NOTIF.pictureH, borderRadius: COMMENTS.picture.radius }} accessible={false} />)}
          </Box>
        ) : null}
      </ItemCard>
    </Pressable>
  );
}

type HostsState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: HostNotice[]; next?: string };

export default function HostNoticesScreen(): React.ReactElement {
  const { listener } = useSocial();
  const m19 = useM19Api();
  const [state, setState] = useState<HostsState>({ kind: 'loading' });
  const [paging, setPaging] = useState(false);
  const load = useCallback(() => {
    if (!listener) return;
    m19.hostNotices().then((p) => setState({ kind: 'ok', items: p.items, ...(p.next ? { next: p.next } : {}) })).catch(() => setState((s) => (s.kind === 'ok' ? s : { kind: 'error' })));
  }, [m19, listener]);
  useEffect(load, [load]);
  const more = () => {
    if (state.kind !== 'ok' || !state.next || paging) return;
    setPaging(true);
    m19.hostNotices(state.next)
      .then((p) => setState({ kind: 'ok', items: [...state.items, ...p.items], ...(p.next ? { next: p.next } : {}) }))
      .catch(() => undefined)
      .finally(() => setPaging(false));
  };
  const items = state.kind === 'ok' ? state.items : NO_NOTICES;
  // This week, then earlier: a small caps heading over each run.
  const groups = useMemo(() => {
    const now = clockMs();
    const out: { label: string; items: HostNotice[] }[] = [];
    for (const n of items) {
      const label = now - Date.parse(n.releaseAt) < WEEK ? 'This week' : 'Earlier';
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(n); else out.push({ label, items: [n] });
    }
    return out;
  }, [items]);
  const empty = !listener ? (
    <SignInBlock line="Sign in to see announcements from the shows you follow.">
      <PulseButton label="Sign in" accessibilityLabel="Sign in" onPress={() => router.push('/auth/sign-in')} full />
    </SignInBlock>
  ) : state.kind === 'loading' ? (
    <FeedLoading testID="hosts-loading" rows={5} />
  ) : state.kind === 'error' ? undefined : (
    <EmptyBlock title="No announcements yet" line="No announcements yet. When a show you follow posts one, it appears here." />
  );
  return (
    <FeedPage
      title="From hosts"
      subtitle="Shows you follow"
      data={listener && state.kind === 'ok' ? groups : []}
      keyExtractor={(g) => g.label}
      onEndReached={more}
      onEndReachedThreshold={0.5}
      contentStyle={{ flexGrow: 1 }}
      ListHeaderComponent={listener && state.kind === 'error' ? (
        <InlineNotice text="Couldn't load announcements right now." actionLabel="Retry" onAction={() => { setState({ kind: 'loading' }); load(); }} />
      ) : null}
      ListEmptyComponent={empty}
      // Owner, 2026-10-05: the bottom of a fetched list says so.
      ListFooterComponent={state.kind === 'ok' && items.length > 0 ? (state.next ? <Box className="items-center py-row"><Loader /></Box> : <EndOfList />) : undefined}
      renderItem={({ item: g }) => (
        <Day label={g.label}>
          {g.items.map((n) => <HostNoticeCard key={n.id} notice={n} />)}
        </Day>
      )}
    />
  );
}
