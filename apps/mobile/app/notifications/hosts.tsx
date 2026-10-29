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
 * Not as drawn: the drawing says a picture opens full size; here a tap anywhere on the card opens the show, as before (the page has
 * never had a picture viewer, and the card is one button).
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/kit/Text';
import { Pressable } from '@/ui/lib/pressable';
import { Image } from '@/ui/lib/image';
import { Artwork } from '@/ui/kit/Artwork';
import { Loader } from '@/ui/kit/Loader';
import { EndOfList } from '@/ui/kit/EndOfList';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { CenterAt, ErrBlock, SignInBlock } from '@/ui/chat/blocks';
import { GhostRows, Tick } from '@/ui/comments/Spine';
import { COMMENTS } from '@/ui/comments/measures';
import { typeStyle } from '@/design';
import { PageEmpty, ThreadNode } from '@/ui/me/lists';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { DayBlock, NOTIF, NotifCard, SpineColumn } from '@/ui/notifications/parts';
import { useSocial } from '@/social/context';
import { useM19Api, type HostNotice } from '@/social/m19-api';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const NEAR_END = 400;

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
      <NotifCard testID="host-card" gap={10}>
        <Box className="flex-row items-center" style={{ gap: 10 }}>
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
      </NotifCard>
    </Pressable>
  );
}

type HostsState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: HostNotice[]; next?: string };

/** M19 T100: the From hosts list, paged by `before`. */
function HostNotices(props: { reserve: number; top: number }): React.ReactElement {
  const m19 = useM19Api();
  const [state, setState] = useState<HostsState>({ kind: 'loading' });
  const [paging, setPaging] = useState(false);
  const load = useCallback(() => {
    m19.hostNotices().then((p) => setState({ kind: 'ok', items: p.items, ...(p.next ? { next: p.next } : {}) })).catch(() => setState((s) => (s.kind === 'ok' ? s : { kind: 'error' })));
  }, [m19]);
  useEffect(load, [load]);
  const more = () => {
    if (state.kind !== 'ok' || !state.next || paging) return;
    setPaging(true);
    m19.hostNotices(state.next)
      .then((p) => setState({ kind: 'ok', items: [...state.items, ...p.items], ...(p.next ? { next: p.next } : {}) }))
      .catch(() => undefined)
      .finally(() => setPaging(false));
  };
  const items = state.kind === 'ok' ? state.items : [];
  // This week, then earlier: the edge label names the run, the tick the date.
  const groups = useMemo(() => {
    const now = Date.now();
    const out: { label: string; items: HostNotice[] }[] = [];
    for (const n of items) {
      const label = now - Date.parse(n.releaseAt) < WEEK ? 'This week' : 'Earlier';
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(n); else out.push({ label, items: [n] });
    }
    return out;
  }, [items]);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const m = e.nativeEvent;
    if (m.contentOffset.y + m.layoutMeasurement.height > m.contentSize.height - NEAR_END) more();
  };
  if (state.kind === 'error') {
    return (
      <CenterAt top={250}>
        <ErrBlock line="Couldn't load announcements right now.">
          <PulseButton label="Retry" accessibilityLabel="Retry" onPress={() => { setState({ kind: 'loading' }); load(); }} />
        </ErrBlock>
      </CenterAt>
    );
  }
  return (
    <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1, paddingTop: props.top, paddingBottom: props.reserve }} scrollEventThrottle={100} onScroll={onScroll}>
      {state.kind === 'loading' ? (
        <Box testID="hosts-loading" style={{ marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right }}><GhostRows rows={5} /></Box>
      ) : items.length === 0 ? (
        <PageEmpty top={ME_MOSAIC.row * 2} title="No announcements yet" line="No announcements yet. When a show you follow posts one, it appears here." />
      ) : (
        <SpineColumn>
          {groups.map((g) => (
            <DayBlock key={g.label} label={g.label}>
              {g.items.map((n) => (
                <ThreadNode key={n.id} lead={<Tick text={dateOf(n)} />}>
                  <HostNoticeCard notice={n} />
                </ThreadNode>
              ))}
            </DayBlock>
          ))}
          {/* Owner, 2026-10-05: the bottom of a fetched list says so. */}
          {state.next ? <Box className="items-center py-row"><Loader /></Box> : <EndOfList />}
        </SpineColumn>
      )}
    </ScrollView>
  );
}

export default function HostNoticesScreen(): React.ReactElement {
  const { listener } = useSocial();
  return (
    <PushedPage title="From hosts" subtitle="Shows you follow">
      {(layout) => listener ? <HostNotices reserve={layout.reserve} top={layout.top} /> : (
        <CenterAt top={240}>
          <SignInBlock line="Sign in to see announcements from the shows you follow.">
            <PulseButton label="Sign in" accessibilityLabel="Sign in" onPress={() => router.push('/auth/sign-in')} full />
          </SignInBlock>
        </CenterAt>
      )}
    </PushedPage>
  );
}
