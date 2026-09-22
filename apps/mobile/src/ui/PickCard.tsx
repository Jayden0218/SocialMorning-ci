/** An editorial pick (M5 FR-001): the episode with the owner's one-line "why". */
import { StyleSheet, Text, View } from 'react-native';
import type { DiscoverItem } from '../social/api';
import { EpisodeRow } from './EpisodeRow';

export function PickCard(props: { item: DiscoverItem; onPress: () => void }): React.ReactElement {
  return (
    <View style={styles.card}>
      <EpisodeRow card={props.item.episode} onPress={props.onPress} />
      {props.item.why ? <Text style={styles.why}>“{props.item.why}”</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#f6f2ea', borderRadius: 10, paddingHorizontal: 12, marginBottom: 8 },
  why: { fontStyle: 'italic', color: '#5a4a2a', paddingBottom: 10 },
});
