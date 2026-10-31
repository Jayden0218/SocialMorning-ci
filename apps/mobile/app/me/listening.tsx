// Listening data: minutes per day for 30 days or per month for all time, as bars, with your top shows.
/**
 * M21 US9 (T101). From the profile's "Listened" card on your own profile. 30 days / All time
 * switch; the total; the bars, and a tapped bar says its day and minutes. Then the top shows of the range, each opening
 * its show. Nothing in the range says so in words (scenario 1), never a row of empty bars.
 * The numbers are the server's (`GET /v1/me/listening`): the union across your phones per day.
 *
 * M31 W3-C (T041; design-pulse2 `discover.html` `me-listening--screen`, `--signed-out`, `--empty`, `--30-days`; layout
 * pattern Panel): the pill switch "30 days | All time" (46 tall), the range in mono 11 over the total in Unbounded 800
 * 52 (tabular), the 120 tall bars (`ListeningBars`), then the edge label "Top shows" and a deck of ranked cards
 * (250 × 84: the rank in Unbounded 800 24 hot text, the cover 56, the show and its minutes), each opening its show. A
 * failed load is the error tile (radius 22, a warning mark, a Retry pill); signed out, the empty block with a light
 * Sign in; no minutes yet, the same block with the switch kept above it.
 */
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, spacing, tabular } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { Loader } from '@/ui/kit/Loader';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { Deck, DeckCard, DeckSection } from '@/ui/discover/Deck';
import { useSocial } from '@/social/context';
import { useStores } from '@/ui/shell/providers';
import { useListeningApi, type Listening, type ListeningRange } from '@/me/listening-api';
import { minutesLabel, totalLabel } from '@/me/listening-chart';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { ME_TYPE } from '@/ui/me/measures';
import { ListeningBars } from '@/ui/me/ListeningBars';
import { DRAWN, emptyTop, PageEmpty, SegmentSwitch } from '@/ui/me/lists';

const RANGES = [
  { value: '30d' as const, label: '30 days', accessibilityLabel: 'Last 30 days' },
  { value: 'all' as const, label: 'All time' },
];

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; data: Listening };

/** The page's body starts 58 from the top of the drawn phone (8 under its status bar); its lane is 28 left, 16 right. */
const BODY_TOP = 58;
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

  const lane = { marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right };
  // M31 F9: the range switch is in the title bar's foot (shell.html `me-listening--all-time`: back, title, then the switch, 44).
  const switcher = <SegmentSwitch items={RANGES} value={range} onChange={setRange} />;

  return (
    <PushedPage title="Listening data" size={26} below={switcher} belowHeight={44}>
      {(layout) => {
        const top = layout.top + (BODY_TOP - DRAWN.status);
        if (!listener) {
          return <Box className="flex-1" style={{ paddingTop: top }}><PageEmpty top={emptyTop(250) - (BODY_TOP - DRAWN.listTop)} title="Listening data" line="Sign in to see your listening data." action={{ label: 'Sign in', onPress: () => router.push('/auth/sign-in') }} /></Box>;
        }
        return (
          <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: top, paddingBottom: layout.reserve, gap: ME_MOSAIC.rowGap }}>
            {state.kind === 'loading' ? <Box className="items-center" style={{ padding: spacing.block }}><Loader /></Box> : null}
            {state.kind === 'error' ? (
              <Box testID="listening-error" className="bg-raise border border-line" style={[lane, { borderRadius: ME_MOSAIC.radius, padding: spacing.section, gap: spacing.row }]} accessibilityLiveRegion="polite">
                <Box className="flex-row items-start" style={{ gap: spacing.row - 2 }}>
                  <Icon name="alert-circle-outline" size={22} color={colour.warn} />
                  <Type step="body" className="text-text font-medium flex-1">Couldn't load your listening data right now.</Type>
                </Box>
                <Pressable onPress={() => { load(); }} accessibilityRole="button" accessibilityLabel="Retry" hitSlop={spacing.hair} className="self-start flex-row items-center bg-raise border border-line rounded-pill" style={{ height: 40, paddingHorizontal: spacing.block - 2, gap: spacing.gap - 2 }}>
                  <Icon name="repeat-outline" size={16} color={colour.text} />
                  <Type step="row" className="text-text">Retry</Type>
                </Pressable>
              </Box>
            ) : null}
            {state.kind === 'ok' && state.data.totalMinutes === 0 ? (
              <PageEmpty
                top={emptyTop(260) - (BODY_TOP - DRAWN.listTop)}
                title={range === '30d' ? 'No listening in the last 30 days.' : 'No listening yet.'}
                line="Play an episode and your minutes show up here."
              />
            ) : null}
            {state.kind === 'ok' && state.data.totalMinutes > 0 ? (
              <>
                <Box style={[lane, { gap: ME_MOSAIC.rowGap }]}>
                  <Box accessible accessibilityLabel={`${totalLabel(state.data.totalMinutes, range)} listened ${range === '30d' ? 'in the last 30 days' : 'in all'}`}>
                    <Type step="mono" className="text-text3 uppercase" style={[ME_TYPE.mono11, tabular]}>{range === '30d' ? 'Last 30 days' : 'All time'}</Type>
                    <Type step="hero" className="text-text" numberOfLines={1} adjustsFontSizeToFit style={[range === 'all' ? ME_TYPE.total38 : ME_TYPE.total52, tabular]}>{totalLabel(state.data.totalMinutes, range)}</Type>
                  </Box>
                  <ListeningBars points={state.data.days} unit={range === '30d' ? 'day' : 'month'} />
                </Box>
                {state.data.topShows.length > 0 ? (
                  <DeckSection label="Top shows">
                    <Deck width={SHOW.width} height={SHOW.height} accessibilityLabel="Top shows">
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
                    </Deck>
                  </DeckSection>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        );
      }}
    </PushedPage>
  );
}
