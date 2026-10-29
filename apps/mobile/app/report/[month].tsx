// Your month in listening: minutes, shows, episodes, comments, clips, top 3 shows and episodes; Share as a picture.
/**
 * M19 T081 (US8, FR-060): the monthly report (月记) for one month, `YYYY-MM` in the link. The
 * serif "Your September 2026" title; the minutes as one big serif number on a yellow card; the
 * shows, episodes, comments and clips as four white cards; then the top 3 shows and the top 3
 * episodes as rows (a show opens its page; an episode opens its page when this phone has it). A month with nothing in it says so instead of a page of zeros (scenario 2).
 *
 * M21 US9 (T102): Share sends a picture — the month, the hours, the top 3 shows and the app link
 * — with the same lines as text. `react-native-view-shot` is not installed and no native library
 * is added, so the picture is drawn by the server's card renderer (`/v1/share/recap/…`, the way
 * the quote card is, `src/ui/player/QuoteShare.tsx`) from the numbers on this page, downloaded,
 * and handed to the share sheet as a file. Offline, the text alone is shared. It names no other listener.
 *
 * M31 W5-D (T064; design-pulse2 `discover.html` `report--screen`, `--signed-out`, `--empty`, `--error`, `report--share`, `toast--report`, layout pattern Stage):
 * a pushed page, the title bar low ("Your September 2026", "Your month in listening", and the share circle = "Share your September 2026" when
 * there is a report). The Stage: LISTENING TIME in hot-text mono, the minutes as an 88 figure in the hot-to-violet gradient (each digit a step
 * of it) and "minutes · 21 h 24 min" under it; the shows, episodes, comments and clips as four 1 x 1 tiles (Unbounded 800 28); then Decks of
 * ranked cards 250 x 84 (the rank in Unbounded 800 24, hot-text, the cover 56) under TOP SHOWS and TOP EPISODES. Signed out: the empty block
 * with a light Sign in; no listening: "Nothing here — you didn't listen that month."; a failed load: the error tile with Retry.
 *
 * Not as drawn: the title keeps the year ("Your September 2026") — a report of another year would otherwise read the same; the share is
 * the circle in the title bar, no longer a pill at the foot; the empty sentence is one line, as the app's words are.
 */
import { useCallback, useState } from 'react';
import { Share } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, spacing, tabular } from '@/design';
import { useSocial } from '@/social/context';
import { monthName, useM19Api, type MonthReport } from '@/social/m19-api';
import { Loader } from '@/ui/kit/Loader';
import { Artwork } from '@/ui/kit/Artwork';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { mixColour } from '@/ui/kit/pulse-math';
import { useStores, useToast } from '@/ui/shell/providers';
import { plural } from '@socialmorning/social-core';
import { File, Paths } from 'expo-file-system';
import { useListeningApi } from '@/me/listening-api';
import { Deck, DeckCard, DeckSection } from '@/ui/discover/Deck';
import { MosaicGrid, RetryTile, type TileSpec } from '@/ui/discover/Mosaic';
import { PAGE, PAGE_TYPE } from '@/ui/discover/measures';
import { bodyTop } from '@/ui/discover/page-parts';
import { ME_TYPE } from '@/ui/me/measures';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { DRAWN, emptyTop, PageEmpty } from '@/ui/me/lists';

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

/** The figure with each digit a step of the hot-to-violet gradient (`.glowtext`; a gradient on words needs a masked view the app does not ship). */
function GlowFigure(props: { text: string }): React.ReactElement {
  const chars = [...props.text];
  return (
    <Type step="hero" className="text-hotText" style={[PAGE_TYPE.total88, tabular]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} testID="report-figure">
      {chars.map((ch, i) => <Type key={i} step="hero" className="text-hotText" style={[PAGE_TYPE.total88, tabular, { color: mixColour(colour.hot, colour.hotEnd, (i + 0.5) / chars.length) }]}>{ch}</Type>)}
    </Type>
  );
}

export default function ReportScreen(): React.ReactElement {
  const { month } = useLocalSearchParams<{ month: string }>();
  const { listener } = useSocial();
  const stores = useStores();
  const m19 = useM19Api();
  const toast = useToast();
  const listening = useListeningApi();
  const [state, setState] = useState<State>({ kind: 'loading' });
  /** M21 US9: the recap picture, then the share sheet; the text alone when the picture cannot be had. */
  const share = async (r: MonthReport) => {
    const message = `${reportText(r)}\n${listening.appLink()}`;
    toast('Making the picture…');
    try {
      const target = new File(Paths.cache, `recap-${r.month}-${Date.now()}.png`);
      const file = await File.downloadFileAsync(listening.recapCardUrl(r.month, r.minutes, r.topShows.slice(0, 3).map((s) => s.title)), target);
      await Share.share({ url: file.uri, message });
    } catch {
      await Share.share({ message }).catch(() => undefined);
    }
  };
  const load = useCallback(() => {
    if (!listener) return;
    m19.report(String(month)).then((report) => setState({ kind: 'ok', report })).catch(() => setState((s) => (s.kind === 'ok' ? s : { kind: 'error' })));
  }, [listener, m19, month]);
  useFocusEffect(load);

  const r = state.kind === 'ok' ? state.report : undefined;
  const none = r !== undefined && r.minutes === 0 && r.episodes === 0;
  const title = `Your ${monthName(String(month))}`;
  const lane = { marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right };
  const counts: TileSpec[] = r ? ([[r.shows, r.shows === 1 ? 'show' : 'shows'], [r.episodes, r.episodes === 1 ? 'episode' : 'episodes'], [r.comments, r.comments === 1 ? 'comment' : 'comments'], [r.clips, r.clips === 1 ? 'clip' : 'clips']] as const).map(([value, label]) => ({
    key: label,
    w: 1,
    h: 1,
    node: (
      <Box className="flex-1" style={{ padding: PAGE.pad }} accessible accessibilityLabel={`${value} ${label}`}>
        <Type step="hero" className="text-text" style={[PAGE_TYPE.count28, tabular]}>{String(value)}</Type>
        <Type step="caption" className="text-text2" style={{ marginTop: 8 }}>{label}</Type>
      </Box>
    ),
  })) : [];

  return (
    <PushedPage
      title={title}
      subtitle="Your month in listening"
      actions={r && !none ? [{ icon: 'share-outline', label: `Share your ${monthName(r.month)}`, onPress: () => { void share(r); } }] : []}
    >
      {(layout) => {
        const top = bodyTop(layout);
        if (!listener) {
          return <Box className="flex-1" style={{ paddingTop: top }}><PageEmpty top={emptyTop(250) - (PAGE.body - DRAWN.listTop)} title={title} line="Sign in to see your month in listening." action={{ label: 'Sign in', onPress: () => router.push('/auth/sign-in') }} /></Box>;
        }
        if (state.kind === 'loading') return <Box className="flex-1 items-center" style={{ paddingTop: top + spacing.section }}><Loader /></Box>;
        if (state.kind === 'error') {
          return <Box className="flex-1" style={{ paddingTop: top + (120 - PAGE.body) }}><RetryTile line="Couldn't load this report right now." onRetry={() => { setState({ kind: 'loading' }); load(); }} /></Box>;
        }
        if (!r || none) {
          return <Box className="flex-1" style={{ paddingTop: top }}><PageEmpty top={emptyTop(250) - (PAGE.body - DRAWN.listTop)} title="Nothing here — you didn't listen that month." /></Box>;
        }
        return (
          <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: top, paddingBottom: layout.reserve }}>
            <Box style={[lane, { paddingTop: 6, paddingBottom: PAGE.pad + 2, gap: 2 }]} accessible accessibilityLabel={`${hoursMinutes(r.minutes)} of listening`}>
              <Type step="tag" className="text-hotText" style={ME_TYPE.mono11}>LISTENING TIME</Type>
              <GlowFigure text={Math.round(r.minutes).toLocaleString('en-US')} />
              <Type step="body" className="text-text2 font-medium">{`minutes · ${hoursMinutes(r.minutes)}`}</Type>
            </Box>
            <MosaicGrid tiles={counts} />
            <Box style={{ height: PAGE.pad + 2 }} />
            {r.topShows.length > 0 ? (
              <DeckSection label="Top shows">
                <Deck width={PAGE.top.width} height={PAGE.top.height} accessibilityLabel="Top shows">
                  {r.topShows.slice(0, 3).map((s, i) => (
                    <DeckCard key={s.feedUrl}>
                      <Pressable onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })} accessibilityRole="link" accessibilityLabel={`${i + 1}. ${s.title}, ${hoursMinutes(s.minutes)}`} className="flex-1 flex-row items-center" style={{ padding: spacing.row, gap: spacing.row }}>
                        <Type step="hero" className="text-hotText" style={[ME_TYPE.rank24, { width: 22 }]}>{String(i + 1)}</Type>
                        <Artwork url={s.imageUrl} size={PAGE.top.cover} name={s.title} />
                        <Box className="flex-1 min-w-0">
                          <Type step="compact" className="text-text font-bold" numberOfLines={1}>{s.title}</Type>
                          <Type step="caption" className="text-text2" style={PAGE_TYPE.small12} numberOfLines={1}>{hoursMinutes(s.minutes)}</Type>
                        </Box>
                      </Pressable>
                    </DeckCard>
                  ))}
                </Deck>
              </DeckSection>
            ) : null}
            {r.topEpisodes.length > 0 ? (
              <DeckSection label="Top episodes">
                <Deck width={PAGE.top.width} height={PAGE.top.height} accessibilityLabel="Top episodes">
                  {r.topEpisodes.slice(0, 3).map((e, i) => (
                    <DeckCard key={e.id}>
                      <Pressable onPress={() => { if (stores.feeds.getEpisode(e.id)) router.push({ pathname: '/episode/[id]', params: { id: e.id } }); else toast("That episode isn't on this phone. Follow its show to open it."); }} accessibilityRole="link" accessibilityLabel={`${i + 1}. ${e.title}, ${e.showTitle}, ${hoursMinutes(e.minutes)}`} className="flex-1 flex-row items-center" style={{ padding: spacing.row, gap: spacing.row }}>
                        <Type step="hero" className="text-hotText" style={[ME_TYPE.rank24, { width: 22 }]}>{String(i + 1)}</Type>
                        <Artwork url={e.imageUrl} size={PAGE.top.cover} name={e.showTitle} />
                        <Box className="flex-1 min-w-0">
                          <Type step="compact" className="text-text font-bold" numberOfLines={1}>{e.title}</Type>
                          <Type step="caption" className="text-text2" style={PAGE_TYPE.small12} numberOfLines={1}>{`${e.showTitle} · ${hoursMinutes(e.minutes)}`}</Type>
                        </Box>
                      </Pressable>
                    </DeckCard>
                  ))}
                </Deck>
              </DeckSection>
            ) : null}
          </ScrollView>
        );
      }}
    </PushedPage>
  );
}
