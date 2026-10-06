// Listening data: minutes per day for 30 days or per month for all time, as bars, with your top shows.
/**
 * M21 US9 (T101). From the profile's "Listened" card on your own profile. 30 days / All time
 * switch (`Segmented`); the total in the serif; the bars as our own SVG in the accent colour, one
 * series so no legend, the axis labelled 0 and a round top, the first and last bars named below,
 * and a tapped bar says its day and minutes. Then the top shows of the range, each opening its
 * show. Nothing in the range says so in words (scenario 1), never a row of empty bars.
 * The numbers are the server's (`GET /v1/me/listening`): the union across your phones per day.
 */
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import Svg, { Line, Rect } from 'react-native-svg';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit, tabular } from '@/design';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Segmented } from '@/ui/kit/Segmented';
import { Loader } from '@/ui/kit/Loader';
import { Icon } from '@/ui/kit/Icon';
import { useColours } from '@/ui/kit/useColours';
import { EmptyPicture } from '@/ui/me/parts';
import { useSocial } from '@/social/context';
import { useListeningApi, type Listening, type ListeningRange } from '@/me/listening-api';
import { barBoxes, chartSpoken, minutesLabel, niceMax, pointLabel } from '@/me/listening-chart';

const TAP = { minHeight: hit.min };
const CHART_H = 160;
const RANGES = [
  { value: '30d' as const, label: '30 days', accessibilityLabel: 'Last 30 days' },
  { value: 'all' as const, label: 'All time' },
];

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; data: Listening };

function Bars(props: { points: Listening['days']; unit: 'day' | 'month' }): React.ReactElement {
  const c = useColours();
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | undefined>();
  const top = niceMax(Math.max(0, ...props.points.map((p) => p.minutes)));
  const boxes = barBoxes(props.points.map((p) => p.minutes), width, CHART_H, top);
  const chosen = picked !== undefined ? props.points[picked] : undefined;
  const first = props.points[0];
  const last = props.points[props.points.length - 1];
  return (
    <Box className="gap-1.5">
      {/* The tapped bar's value, or a hint until one is tapped. */}
      <Text className={chosen ? 'text-text text-sm font-semibold' : 'text-muted text-xs'} accessibilityLiveRegion="polite">
        {chosen ? `${pointLabel(chosen.day)}: ${minutesLabel(chosen.minutes)}` : 'Tap a bar to see its minutes.'}
      </Text>
      <Box className="flex-row gap-1.5">
        <Box className="justify-between items-end" style={{ height: CHART_H }}>
          <Text className="text-muted text-xs" style={tabular}>{minutesLabel(top)}</Text>
          <Text className="text-muted text-xs" style={tabular}>0</Text>
        </Box>
        <Box className="flex-1" style={{ height: CHART_H }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={chartSpoken(props.points, props.unit)}>
          {width > 0 ? (
            <Svg width={width} height={CHART_H}>
              <Line x1={0} y1={0.5} x2={width} y2={0.5} stroke={c.separator} strokeWidth={1} />
              {boxes.map((b, i) => (
                <Rect key={`b${i}`} x={b.x} y={b.y} width={b.width} height={b.height} rx={Math.min(2, b.width / 2)} fill={i === picked ? c.text : c.accent} />
              ))}
              {/* Taps land on the whole column, not only the bar. */}
              {boxes.map((b, i) => (
                <Rect key={`t${i}`} x={b.x} y={0} width={b.width + 2} height={CHART_H} fill="transparent" onPress={() => setPicked(i === picked ? undefined : i)} />
              ))}
              <Line x1={0} y1={CHART_H - 0.5} x2={width} y2={CHART_H - 0.5} stroke={c.border} strokeWidth={1} />
            </Svg>
          ) : null}
        </Box>
      </Box>
      {first && last ? (
        <Box className="flex-row justify-between pl-8">
          <Text className="text-muted text-xs">{pointLabel(first.day)}</Text>
          <Text className="text-muted text-xs">{props.unit === 'day' ? 'Today' : pointLabel(last.day)}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

export default function ListeningDataScreen(): React.ReactElement {
  const { listener } = useSocial();
  const api = useListeningApi();
  const c = useColours();
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

  const header = <PageHeader title="Listening data" />;
  if (!listener) return <>{header}<Box className="flex-1 bg-background px-screen-x"><Text className="text-muted text-body">Sign in to see your listening data.</Text></Box></>;
  return (
    <>
    {header}
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-gap pb-24 gap-section">
      <Segmented items={RANGES} value={range} onChange={setRange} />
      {state.kind === 'loading' ? <Box className="items-center p-4"><Loader /></Box> : null}
      {state.kind === 'error' ? (
        <Box className="gap-row">
          <Text className="text-text text-body">Couldn't load your listening data right now.</Text>
          <Pressable onPress={() => { load(); }} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center self-start" style={TAP}><Text className="text-accent text-body font-semibold">Retry</Text></Pressable>
        </Box>
      ) : null}
      {state.kind === 'ok' && state.data.totalMinutes === 0 ? (
        <EmptyPicture icon="bar-chart-outline" line={range === '30d' ? 'No listening in the last 30 days. Play an episode and your minutes show up here.' : 'No listening yet. Play an episode and your minutes show up here.'} />
      ) : null}
      {state.kind === 'ok' && state.data.totalMinutes > 0 ? (
        <>
          <Box className="gap-0.5" accessible accessibilityLabel={`${minutesLabel(state.data.totalMinutes)} listened ${range === '30d' ? 'in the last 30 days' : 'in all'}`}>
            <Text className="text-muted text-xs">{range === '30d' ? 'Last 30 days' : 'All time'}</Text>
            <Text className="text-text text-hero font-display" style={tabular}>{minutesLabel(state.data.totalMinutes)}</Text>
          </Box>
          <Bars points={state.data.days} unit={range === '30d' ? 'day' : 'month'} />
          {state.data.topShows.length > 0 ? (
            <Box className="gap-row">
              <Text className="text-text text-base font-display" accessibilityRole="header">Top shows</Text>
              {state.data.topShows.map((s, i) => (
                <Pressable key={s.feedUrl} onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })} accessibilityRole="link" accessibilityLabel={`${i + 1}. ${s.title}, ${minutesLabel(s.minutes)}`} className="flex-row gap-row p-row items-center bg-surface border border-border rounded-row" style={TAP}>
                  <Text className="text-accent text-base font-display w-6 text-center">{i + 1}</Text>
                  <Box className="flex-1 gap-0.5">
                    <Text className="text-text text-sm font-display" numberOfLines={2}>{s.title}</Text>
                    <Text className="text-muted text-xs">{minutesLabel(s.minutes)}</Text>
                  </Box>
                  <Icon name="chevron-forward" size={16} color={c.muted} />
                </Pressable>
              ))}
            </Box>
          ) : null}
        </>
      ) : null}
    </ScrollView>
    </>
  );
}
