// Listening data: minutes per day for 30 days or per month for all time, as bars, with your top shows.
/**
 * M21 US9 (T101). From the profile's "Listened" card on your own profile. 30 days / All time
 * switch; the total; the bars, and a tapped bar says its day and minutes. Then the top shows of the range, each opening
 * its show. Nothing in the range says so in words (scenario 1), never a row of empty bars.
 * The numbers are the server's (`GET /v1/me/listening`): the union across your phones per day.
 *
 * Spec 039 (Detail template): a `DetailPage` (Back + "Listening data"); the 30 days | All time switch is the first block under the title row (it was pinned to the foot), a
 * failed load is an `InlineNotice` with Retry, and Top shows are a `Section` with the cards on a `Shelf`.
 *
 * M31 W3-C (T041; design-pulse2 `discover.html` `me-listening--screen`, `--signed-out`, `--empty`, `--30-days`; layout
 * pattern Panel): the pill switch "30 days | All time" (46 tall), the range in mono 11 over the total in Unbounded 800
 * 52 (tabular), the 120 tall bars (`ListeningBars`), then the section heading "Top shows" and a deck of ranked cards
 * (250 × 84: the rank in Unbounded 800 24 hot text, the cover 56, the show and its minutes), each opening its show. A
 * failed load is the error tile (radius 22, a warning mark, a Retry pill); signed out, the empty block with a light
 * Sign in; no minutes yet, the same block with the switch kept above it.
 */
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { spacing, tabular } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Loader } from '@/ui/kit/Loader';
import { DetailPage } from '@/ui/detail/DetailPage';
import { CardShelf } from '@/ui/detail/CardShelf';
import { InlineNotice, Section } from '@/ui/kit/layout';
import { DeckCard } from '@/ui/discover/Deck';
import { Type } from '@/ui/kit/Type';
import { useSocial } from '@/social/context';
import { useStores } from '@/ui/shell/providers';
import { useListeningApi, type Listening, type ListeningRange } from '@/me/listening-api';
import { minutesLabel, totalLabel } from '@/me/listening-chart';
import { ME_TYPE } from '@/ui/me/measures';
import { ListeningBars } from '@/ui/me/ListeningBars';
import { PageEmpty, SegmentSwitch } from '@/ui/me/lists';

const RANGES = [
  { value: '30d' as const, label: '30 days', accessibilityLabel: 'Last 30 days' },
  { value: 'all' as const, label: 'All time' },
];

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; data: Listening };

/** A top show's card (me-listening--all-time): 150 wide, the cover 130 over the rank, name and minutes. */
const SHOW = { width: 150, height: 212, cover: 130 } as const;

export default function ListeningDataScreen(): React.ReactElement {
  const { listener } = useSocial();
  const api = useListeningApi();
  const stores = useStores();
  const [range, setRange] = useState<ListeningRange>('30d');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(() => {
    if (!listener) return;
    let live = true;
    setState({ kind: 'loading' });
    api.listening(range).then((data) => { if (live) setState({ kind: 'ok', data }); }).catch(() => { if (live) setState({ kind: 'error' }); });
    return () => { live = false; };
  }, [api, listener, range]);
  useFocusEffect(load);

  // 039: the range switch is the first thing under the title row (it was pinned to the foot).
  const switcher = <SegmentSwitch items={RANGES} value={range} onChange={setRange} />;

  if (!listener) {
    return (
      <DetailPage title="Listening data">
        <PageEmpty top={0} title="Listening data" line="Sign in to see your listening data." action={{ label: 'Sign in', onPress: () => router.push('/auth/sign-in') }} />
      </DetailPage>
    );
  }
  return (
    <DetailPage title="Listening data">
      {switcher}
      {state.kind === 'loading' ? <Box className="items-center" style={{ padding: spacing.block }}><Loader /></Box> : null}
      {state.kind === 'error' ? <InlineNotice text="Couldn't load your listening data right now." actionLabel="Retry" onAction={() => { load(); }} /> : null}
      {state.kind === 'ok' && state.data.totalMinutes === 0 ? (
        <PageEmpty
          top={0}
          title={range === '30d' ? 'No listening in the last 30 days.' : 'No listening yet.'}
          line="Play an episode and your minutes show up here."
        />
      ) : null}
      {state.kind === 'ok' && state.data.totalMinutes > 0 ? (
        <>
                <Box style={{ gap: spacing.row }}>
                  <Box accessible accessibilityLabel={`${totalLabel(state.data.totalMinutes, range)} listened ${range === '30d' ? 'in the last 30 days' : 'in all'}`}>
                    <Type step="mono" className="text-text3 uppercase" style={[ME_TYPE.mono11, tabular]}>{range === '30d' ? 'Last 30 days' : 'All time'}</Type>
                    <Type step="hero" className="text-text" numberOfLines={1} adjustsFontSizeToFit style={[range === 'all' ? ME_TYPE.total38 : ME_TYPE.total52, tabular]}>{totalLabel(state.data.totalMinutes, range)}</Type>
                  </Box>
                  <ListeningBars points={state.data.days} unit={range === '30d' ? 'day' : 'month'} />
                </Box>
          {state.data.topShows.length > 0 ? (
            <Section title="Top shows">
              <CardShelf width={SHOW.width} height={SHOW.height} label="Top shows">
                {state.data.topShows.map((s, i) => (
                        <DeckCard key={s.feedUrl}>
                          <Pressable onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })} accessibilityRole="link" accessibilityLabel={`${i + 1}. ${s.title}, ${minutesLabel(s.minutes)}`} className="flex-1" style={{ padding: 10, gap: 8 }}>
                            <Artwork url={stores.feeds.getShow(s.feedUrl)?.imageUrl} size={SHOW.cover} name={s.title} />
                            <Box className="flex-row items-baseline" style={{ gap: 8 }}>
                              <Type step="hero" className="text-hotText" style={ME_TYPE.rank24}>{String(i + 1)}</Type>
                              <Type step="compact" className="text-text font-bold flex-1" numberOfLines={2}>{s.title}</Type>
                            </Box>
                            <Type step="caption" className="text-text2" style={ME_TYPE.node12} numberOfLines={1}>{minutesLabel(s.minutes)}</Type>
                          </Pressable>
                        </DeckCard>
                ))}
              </CardShelf>
            </Section>
          ) : null}
        </>
      ) : null}
    </DetailPage>
  );
}
