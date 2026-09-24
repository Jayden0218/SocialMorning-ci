/**
 * The clip composer (M4 US1, clarified: two buttons while listening). Reads the player's
 * live position for "Start here" / "End here"; Preview plays the range through the
 * runtime's clip mode; Save hands the range to `clips.create`.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePlayer, usePlayerState, type PlayableEpisode } from '../playback/store';
import { canSave, endHere, nudgeEdge, openComposer, problemText, setCaption, startHere, type ComposerState } from '../graph/composer';
import { mmss } from './format';
import { colour } from '../design';

export type ClipComposerProps = {
  episode: PlayableEpisode;
  initialPositionMs: number;
  onSave: (s: ComposerState) => void;
  saving: boolean;
};

export function ClipComposer(props: ClipComposerProps): React.ReactElement {
  const player = usePlayer();
  const state = usePlayerState();
  const position: number = 'positionMs' in state && typeof state.positionMs === 'number' ? state.positionMs : props.initialPositionMs;
  const [s, setS] = useState<ComposerState>(() => openComposer(props.episode.id, props.initialPositionMs, props.episode.durationMs));
  const length = Math.round((s.range.endMs - s.range.startMs) / 1000);
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} numberOfLines={2}>{props.episode.title}</Text>
      <Text style={styles.range} accessibilityLabel="Clip range">{mmss(s.range.startMs)} – {mmss(s.range.endMs)} · {length} s</Text>
      <Text style={styles.muted}>Now at {mmss(position)}</Text>
      <View style={styles.row}>
        <Pressable style={styles.chip} onPress={() => setS(startHere(s, position))} accessibilityRole="button"><Text>Start here</Text></Pressable>
        <Pressable style={styles.chip} onPress={() => setS(nudgeEdge(s, 'start', -1))} accessibilityRole="button" accessibilityLabel="Start 5 seconds earlier"><Text>−5 s</Text></Pressable>
        <Pressable style={styles.chip} onPress={() => setS(nudgeEdge(s, 'start', 1))} accessibilityRole="button" accessibilityLabel="Start 5 seconds later"><Text>+5 s</Text></Pressable>
      </View>
      <View style={styles.row}>
        <Pressable style={styles.chip} onPress={() => setS(endHere(s, position))} accessibilityRole="button"><Text>End here</Text></Pressable>
        <Pressable style={styles.chip} onPress={() => setS(nudgeEdge(s, 'end', -1))} accessibilityRole="button" accessibilityLabel="End 5 seconds earlier"><Text>−5 s</Text></Pressable>
        <Pressable style={styles.chip} onPress={() => setS(nudgeEdge(s, 'end', 1))} accessibilityRole="button" accessibilityLabel="End 5 seconds later"><Text>+5 s</Text></Pressable>
      </View>
      {s.problem ? <Text style={styles.problem}>{problemText[s.problem]}</Text> : null}
      <TextInput
        style={styles.input}
        placeholder="Caption (optional)"
        value={s.caption}
        onChangeText={(t) => setS(setCaption(s, t))}
        maxLength={200}
        multiline
        accessibilityLabel="Caption"
      />
      <Text style={styles.muted}>{s.caption.length} / 200</Text>
      <View style={styles.row}>
        <Pressable style={styles.secondary} onPress={() => player.playClip(props.episode, s.range)} accessibilityRole="button"><Text>Preview</Text></Pressable>
        <Pressable style={[styles.primary, (!canSave(s) || props.saving) && styles.disabled]} disabled={!canSave(s) || props.saving} onPress={() => props.onSave(s)} accessibilityRole="button">
          <Text style={styles.primaryText}>{props.saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 10 },
  title: { fontSize: 18, fontWeight: '600' },
  range: { fontSize: 22, fontVariant: ['tabular-nums'] },
  muted: { color: colour.muted },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: colour.separator, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  problem: { color: colour.accent },
  input: { borderWidth: 1, borderColor: colour.separator, borderRadius: 8, padding: 10, minHeight: 60, fontSize: 16 },
  secondary: { borderWidth: 1, borderColor: colour.separator, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 10 },
  primary: { backgroundColor: colour.accent, borderRadius: 24, paddingHorizontal: 22, paddingVertical: 10 },
  primaryText: { color: colour.text, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
