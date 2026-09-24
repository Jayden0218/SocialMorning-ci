/** The end-of-episode offer (M5 FR-010): the first Next-up item with its reason and a Play button — nothing plays by itself. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NextUpItem } from '../social/api';
import { colour } from '../design';

export function EndOffer(props: { item: NextUpItem; onPlay: () => void }): React.ReactElement {
  return (
    <View style={styles.wrap} accessibilityLabel="Next up offer">
      <Text style={styles.h3}>That's the end. Next up:</Text>
      <Text style={styles.title} numberOfLines={2}>{props.item.episode.title}</Text>
      <Text style={styles.muted}>{props.item.episode.showTitle} · {props.item.label}</Text>
      <Pressable style={styles.primary} accessibilityRole="button" onPress={props.onPlay}><Text style={styles.primaryText}>Play it</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, padding: 12, backgroundColor: colour.surface, borderRadius: 10, gap: 4 },
  h3: { fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '600' },
  muted: { color: colour.muted },
  primary: { alignSelf: 'flex-start', backgroundColor: colour.accent, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10, marginTop: 6 },
  primaryText: { color: colour.text, fontWeight: '600' },
});
