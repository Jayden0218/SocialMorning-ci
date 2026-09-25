/** Discover's three sections (M5 US1), reused by the Discover screen and the zero-subscription home. */
import { StyleSheet, Text, View } from 'react-native';
import type { Discover, EpisodeCard } from '../social/api';
import { PickCard } from './PickCard';
import { EpisodeRow } from './EpisodeRow';
import { colour } from '../design';

export function DiscoverSections(props: { body: Discover; stale: boolean; fetchedAt?: number; onOpen: (card: EpisodeCard) => void; maxPicks?: number }): React.ReactElement {
  const { body } = props;
  const picks = props.maxPicks !== undefined ? body.picks.slice(0, props.maxPicks) : body.picks;
  return (
    <View style={styles.wrap}>
      {props.stale ? <Text style={styles.stale}>Couldn't refresh — showing what was fetched {props.fetchedAt ? new Date(props.fetchedAt).toLocaleTimeString() : 'earlier'}.</Text> : null}
      <Text style={styles.h2}>{body.date ? `Picks for ${body.date}` : "Today's picks"}</Text>
      {picks.length === 0 ? <Text style={styles.muted}>No picks yet.</Text> : picks.map((p) => <PickCard key={p.key} item={p} onPress={() => props.onOpen(p.episode)} />)}
      {props.maxPicks === undefined ? (
        <>
          <Text style={styles.h2}>Listened and talked about</Text>
          {body.talkedAbout.length === 0 ? <Text style={styles.muted}>Nothing yet — you could be first.</Text> : body.talkedAbout.map((i) => <EpisodeRow key={i.key} card={i.episode} line={i.reason} onPress={() => props.onOpen(i.episode)} />)}
          {body.trending.length > 0 ? (
            <>
              <Text style={styles.h2}>Trending on the chart</Text>
              <Text style={styles.muted}>From the public podcast chart, not from listeners here.</Text>
              {body.trending.map((i) => <EpisodeRow key={i.key} card={i.episode} onPress={() => props.onOpen(i.episode)} />)}
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  h2: { fontSize: 18, fontWeight: '600', marginTop: 12, marginBottom: 4, color: colour.text },
  muted: { color: colour.muted },
  stale: { color: colour.accent, backgroundColor: colour.surface, padding: 8, borderRadius: 6 },
});
