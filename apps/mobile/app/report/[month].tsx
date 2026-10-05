// Your month in listening: minutes, shows, episodes, comments, clips, top 3 shows and episodes; Share.
/**
 * M19 T081 (US8, FR-060): the monthly report (月记) for one month, `YYYY-MM` in the link. The
 * serif "Your September 2026" title; the minutes as one big serif number on a yellow card; the
 * shows, episodes, comments and clips as four white cards; then the top 3 shows and the top 3
 * episodes as rows (a show opens its page; an episode opens its page when this phone has it). A month with nothing in it says so instead of a page of zeros (scenario 2).
 *
 * Share sends a few lines of text through the phone's share sheet (React Native `Share`): no
 * image library is added (no new dependencies), and the text names no other listener. The
 * server's PNG card (`/v1/me/report/card.png`) is not used yet.
 */
import { useCallback, useState } from 'react';
import { Share } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit, tabular } from '@/design';
import { useSocial } from '@/social/context';
import { monthName, useM19Api, type MonthReport } from '@/social/m19-api';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Loader } from '@/ui/kit/Loader';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { useColours } from '@/ui/kit/useColours';
import { EmptyPicture } from '@/ui/me/parts';
import { useStores, useToast } from '@/ui/shell/providers';
import { plural } from '@socialmorning/social-core';

const TAP = { minHeight: hit.min };
/** B's primary pill: 52 pt. */
const PILL = { minHeight: 52 };
/** The eyebrow on the yellow card: spaced capitals. */
const CAPS = { letterSpacing: 1.2, textTransform: 'uppercase' as const };

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; report: MonthReport };

/** "12 h 5 min", or "45 min" under an hour. */
function hoursMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** The text the share sheet sends: totals and top shows only — never another listener. */
function reportText(r: MonthReport): string {
  const lines = [
    `My ${monthName(r.month)} on SocialNet`,
    `${hoursMinutes(r.minutes)} of listening · ${plural(r.shows, 'show')} · ${plural(r.episodes, 'episode')}`,
  ];
  if (r.topShows.length > 0) lines.push(`Top shows: ${r.topShows.map((s) => s.title).join(', ')}`);
  if (r.comments > 0 || r.clips > 0) lines.push(`${plural(r.comments, 'comment')} · ${plural(r.clips, 'clip')}`);
  return lines.join('\n');
}

function Count(props: { value: number; label: string }): React.ReactElement {
  return (
    <Box className="flex-1 bg-surface border border-border rounded-row p-row gap-0.5" accessible accessibilityLabel={`${props.value} ${props.label}`}>
      <Text className="text-text text-hero font-display" style={tabular}>{props.value}</Text>
      <Text className="text-muted text-xs">{props.label}</Text>
    </Box>
  );
}

export default function ReportScreen(): React.ReactElement {
  const { month } = useLocalSearchParams<{ month: string }>();
  const { listener } = useSocial();
  const stores = useStores();
  const c = useColours(stores.settings);
  const m19 = useM19Api();
  const toast = useToast();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(() => {
    if (!listener) return;
    m19.report(String(month)).then((report) => setState({ kind: 'ok', report })).catch(() => setState((s) => (s.kind === 'ok' ? s : { kind: 'error' })));
  }, [listener, m19, month]);
  useFocusEffect(load);

  const header = <PageHeader title={`Your ${monthName(String(month))}`} subtitle="Your month in listening" />;
  if (!listener) return <>{header}<Box className="flex-1 bg-background px-screen-x"><Text className="text-muted text-body">Sign in to see your month in listening.</Text></Box></>;
  if (state.kind === 'loading') return <>{header}<Box className="flex-1 bg-background items-center p-4"><Loader /></Box></>;
  if (state.kind === 'error') {
    return (
      <>
      {header}
      <Box className="flex-1 bg-background px-screen-x gap-row">
        <Text className="text-text text-body">Couldn't load this report right now.</Text>
        <Pressable onPress={() => { setState({ kind: 'loading' }); load(); }} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center self-start" style={TAP}><Text className="text-accent text-body font-semibold">Retry</Text></Pressable>
      </Box>
      </>
    );
  }
  const r = state.report;
  if (r.minutes === 0 && r.episodes === 0) {
    return <>{header}<Box className="flex-1 bg-background px-screen-x"><EmptyPicture icon="calendar-outline" line="Nothing here — you didn't listen that month." /></Box></>;
  }
  return (
    <>
    {header}
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-gap pb-24 gap-section">
      <Box className="bg-primary rounded-row p-section" accessible accessibilityLabel={`${hoursMinutes(r.minutes)} of listening`}>
        <Text className="text-onPrimary text-xs font-bold" style={CAPS}>Listening time</Text>
        <Text className="text-onPrimary font-display text-[56px] leading-[72px]" style={tabular}>{Math.round(r.minutes)}</Text>
        <Text className="text-onPrimary text-body">{`minutes · ${hoursMinutes(r.minutes)}`}</Text>
      </Box>

      <Box className="gap-gap">
        <Box className="flex-row gap-gap">
          <Count value={r.shows} label={r.shows === 1 ? 'show' : 'shows'} />
          <Count value={r.episodes} label={r.episodes === 1 ? 'episode' : 'episodes'} />
        </Box>
        <Box className="flex-row gap-gap">
          <Count value={r.comments} label={r.comments === 1 ? 'comment' : 'comments'} />
          <Count value={r.clips} label={r.clips === 1 ? 'clip' : 'clips'} />
        </Box>
      </Box>

      {r.topShows.length > 0 ? (
        <Box className="gap-row">
          <Text className="text-text text-base font-display" accessibilityRole="header">Top shows</Text>
          {r.topShows.slice(0, 3).map((s, i) => (
            <Pressable key={s.feedUrl} onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })} accessibilityRole="link" accessibilityLabel={`${i + 1}. ${s.title}, ${hoursMinutes(s.minutes)}`} className="flex-row gap-row p-row items-center bg-surface border border-border rounded-row" style={TAP}>
              <Text className="text-accent text-base font-display w-6 text-center">{i + 1}</Text>
              <Artwork url={s.imageUrl} size={52} rounded="row" name={s.title} />
              <Box className="flex-1 gap-0.5">
                <Text className="text-text text-sm font-display" numberOfLines={2}>{s.title}</Text>
                <Text className="text-muted text-xs">{hoursMinutes(s.minutes)}</Text>
              </Box>
              <Icon name="chevron-forward" size={16} color={c.muted} />
            </Pressable>
          ))}
        </Box>
      ) : null}

      {r.topEpisodes.length > 0 ? (
        <Box className="gap-row">
          <Text className="text-text text-base font-display" accessibilityRole="header">Top episodes</Text>
          {r.topEpisodes.slice(0, 3).map((e, i) => (
            <Pressable key={e.id} onPress={() => { if (stores.feeds.getEpisode(e.id)) router.push({ pathname: '/episode/[id]', params: { id: e.id } }); else toast("That episode isn't on this phone. Follow its show to open it."); }} accessibilityRole="link" accessibilityLabel={`${i + 1}. ${e.title}, ${e.showTitle}, ${hoursMinutes(e.minutes)}`} className="flex-row gap-row p-row items-center bg-surface border border-border rounded-row" style={TAP}>
              <Text className="text-accent text-base font-display w-6 text-center">{i + 1}</Text>
              <Artwork url={e.imageUrl} size={52} rounded="row" name={e.showTitle} />
              <Box className="flex-1 gap-0.5">
                <Text className="text-text text-sm font-display" numberOfLines={2}>{e.title}</Text>
                <Text className="text-muted text-xs" numberOfLines={1}>{`${e.showTitle} · ${hoursMinutes(e.minutes)}`}</Text>
              </Box>
              <Icon name="chevron-forward" size={16} color={c.muted} />
            </Pressable>
          ))}
        </Box>
      ) : null}

      <Pressable onPress={() => { void Share.share({ message: reportText(r) }).catch(() => undefined); }} accessibilityRole="button" accessibilityLabel={`Share your ${monthName(r.month)}`} className="flex-row gap-gap items-center justify-center rounded-pill bg-primary" style={PILL}>
        <Icon name="share-outline" size={18} color={c.onPrimary} />
        <Text className="text-onPrimary text-body font-bold">Share</Text>
      </Pressable>
    </ScrollView>
    </>
  );
}
