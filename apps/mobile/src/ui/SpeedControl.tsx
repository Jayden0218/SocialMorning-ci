/** Playback speed (US3, FR-012/013): −0.1 / +0.1, presets, "set as default". Episode time stays episode time (FR-014). */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePlayer, usePlayerState } from '../playback/store';
import { useToast } from './providers';
import { colour } from '../design';

const PRESETS = [1, 1.2, 1.5, 2];

export function SpeedControl(): React.ReactElement {
  const player = usePlayer();
  usePlayerState(); // re-render on runtime notifications
  const toast = useToast();
  const [, force] = useState(0);
  const rate = player.rate();
  const set = (r: number) => { player.setRate(r); force((n) => n + 1); };
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable onPress={() => set(rate - 0.1)} accessibilityRole="button" accessibilityLabel="Slower"><Text style={styles.step}>−</Text></Pressable>
        <Text style={styles.rate}>{rate.toFixed(1)}×</Text>
        <Pressable onPress={() => set(rate + 0.1)} accessibilityRole="button" accessibilityLabel="Faster"><Text style={styles.step}>+</Text></Pressable>
        {PRESETS.map((p) => (
          <Pressable key={p} onPress={() => set(p)} accessibilityRole="button">
            <Text style={[styles.chip, Math.abs(rate - p) < 0.01 && styles.chipOn]}>{p}×</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={() => { player.setDefaultRate(rate); toast(`${rate.toFixed(1)}× is now the default for new shows`); }} accessibilityRole="button">
        <Text style={styles.link}>Set {rate.toFixed(1)}× as default (this show remembers its own)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 4, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  step: { fontSize: 22, paddingHorizontal: 8 },
  rate: { fontSize: 16, fontWeight: '700', minWidth: 48, textAlign: 'center' },
  chip: { borderWidth: 1, borderColor: colour.separator, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, color: colour.text },
  chipOn: { backgroundColor: colour.accent, color: colour.text, borderColor: colour.accent },
  link: { color: colour.accent, fontSize: 13 },
});
