/** One catalogue episode (M5): artwork, title, show · length · date, an optional line under it. */
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { EpisodeCard } from '../social/api';
import { mmss } from './format';
import { colour } from '../design';

export function EpisodeRow(props: { card: EpisodeCard; line?: string; onPress: () => void; disabled?: boolean; /** M8 FR-027: the reason must be part of what a screen reader speaks. */ label?: string }): React.ReactElement {
  const { card } = props;
  const meta = [card.showTitle, card.durationMs !== undefined ? mmss(card.durationMs) : undefined, card.publishedAt ? card.publishedAt.slice(0, 10) : undefined].filter(Boolean).join(' · ');
  return (
    <Pressable style={styles.row} onPress={props.onPress} disabled={props.disabled} accessibilityRole="button" accessibilityLabel={props.label ?? `${card.title}, ${card.showTitle}`}>
      {card.imageUrl ? <Image source={{ uri: card.imageUrl }} style={styles.art} /> : <View style={styles.art} />}
      <View style={styles.grow}>
        <Text style={styles.title} numberOfLines={3}>{card.title}</Text>
        <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
        {props.line ? <Text style={styles.line} numberOfLines={2}>{props.line}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colour.separator },
  art: { width: 56, height: 56, borderRadius: 8, backgroundColor: colour.surface },
  grow: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600', color: colour.text },
  meta: { color: colour.muted, fontSize: 13 },
  line: { color: colour.text, fontSize: 14 },
});
