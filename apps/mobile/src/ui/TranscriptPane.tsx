/** Transcript (US5, FR-022): timed → current line highlighted, tap → seek; untimed → text. */
import { currentLine, type Transcript } from '@socialmorning/player-core';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { mmss } from './format';
import { colour } from '../design';

export function TranscriptPane(props: { transcript: Transcript; positionMs: number; onSeek: (ms: number) => void }): React.ReactElement {
  if ('text' in props.transcript) {
    return (
      <ScrollView style={styles.box} nestedScrollEnabled>
        <Text style={styles.text}>{props.transcript.text}</Text>
      </ScrollView>
    );
  }
  const lines = props.transcript.lines;
  const current = currentLine(lines, props.positionMs);
  return (
    <ScrollView style={styles.box} nestedScrollEnabled>
      <View style={styles.lines}>
        {lines.map((l, i) => (
          <Pressable key={`${l.startMs}-${i}`} onPress={() => props.onSeek(l.startMs)} accessibilityRole="button" style={[styles.line, i === current && styles.current]}>
            <Text style={styles.time}>{mmss(l.startMs)}</Text>
            <Text style={[styles.text, styles.grow, i === current && styles.textCurrent]}>
              {l.speaker ? <Text style={styles.speaker}>{l.speaker}: </Text> : null}{l.text}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', maxHeight: 260, borderWidth: StyleSheet.hairlineWidth, borderColor: colour.separator, borderRadius: 8, padding: 8 },
  lines: { gap: 4 },
  line: { flexDirection: 'row', gap: 8, paddingVertical: 3, paddingHorizontal: 4, borderRadius: 4 },
  current: { backgroundColor: colour.surface },
  time: { color: colour.muted, fontVariant: ['tabular-nums'], width: 52, fontSize: 12, paddingTop: 2 },
  text: { fontSize: 14, lineHeight: 20 },
  grow: { flex: 1 },
  textCurrent: { fontWeight: '600' },
  speaker: { color: colour.muted, fontWeight: '600' },
});
