/** Listening stats (M4 FR-012): time listened, episodes finished, top shows — last 7 days and all time. */
import { StyleSheet, Text, View } from 'react-native';
import type { ProfileStats } from '../social/api';
import { colour } from '../design';

export function hms(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(s % 60).padStart(2, '0')} s`;
}

function Window(props: { title: string; w: ProfileStats }): React.ReactElement {
  return (
    <View style={styles.window}>
      <Text style={styles.h3}>{props.title}</Text>
      <Text accessibilityLabel={`${props.title}: time listened`}>Time listened: <Text style={styles.num}>{hms(props.w.listenedMs)}</Text></Text>
      <Text>Episodes finished: <Text style={styles.num}>{props.w.finished}</Text></Text>
      {props.w.topShows.length > 0 ? (
        <View>
          <Text style={styles.muted}>Top shows</Text>
          {props.w.topShows.map((s) => <Text key={s.feedUrl}>· {s.showTitle ?? s.feedUrl} — {hms(s.listenedMs)}</Text>)}
        </View>
      ) : null}
    </View>
  );
}

export function StatsBlock(props: { stats: { last7: ProfileStats; all: ProfileStats } | null; own: boolean }): React.ReactElement {
  if (props.stats === null) return <Text style={styles.muted}>{props.own ? 'Your listening is private.' : 'Listening is private.'}</Text>;
  return (
    <View style={styles.wrap}>
      <Window title="Last 7 days" w={props.stats.last7} />
      <Window title="All time" w={props.stats.all} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  window: { gap: 2 },
  h3: { fontWeight: '600', color: colour.text },
  num: { fontVariant: ['tabular-nums'], fontWeight: '600', color: colour.text },
  muted: { color: colour.muted },
});
