/** Sleep timer (US3, FR-015..017): the fixed choices, the remaining time while it runs, cancel. */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SleepChoice } from '@socialmorning/player-core';
import { usePlayer } from '../playback/store';
import { mmss } from './format';

const CHOICES: SleepChoice[] = [5, 10, 15, 30, 45, 60, 'endOfEpisode'];

export function SleepTimerControl(): React.ReactElement {
  const player = usePlayer();
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const timer = player.sleepTimer();
  const remaining = player.sleepRemainingMs();
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>Sleep</Text>
        {CHOICES.map((c) => (
          <Pressable key={String(c)} onPress={() => player.setSleepTimer(c)} accessibilityRole="button">
            <Text style={[styles.chip, (c === 'endOfEpisode' ? timer.kind === 'endOfEpisode' : false) && styles.chipOn]}>{c === 'endOfEpisode' ? 'End of episode' : `${c} min`}</Text>
          </Pressable>
        ))}
      </View>
      {timer.kind === 'minutes' && remaining !== undefined ? (
        <View style={styles.row}>
          <Text style={styles.status}>Pausing in {mmss(remaining)}</Text>
          <Pressable onPress={() => player.setSleepTimer('off')} accessibilityRole="button"><Text style={styles.link}>Cancel</Text></Pressable>
        </View>
      ) : timer.kind === 'endOfEpisode' ? (
        <View style={styles.row}>
          <Text style={styles.status}>Stops when this episode ends</Text>
          <Pressable onPress={() => player.setSleepTimer('off')} accessibilityRole="button"><Text style={styles.link}>Cancel</Text></Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 4, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  label: { fontWeight: '600' },
  chip: { borderWidth: 1, borderColor: '#999', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, color: '#333', fontSize: 13 },
  chipOn: { backgroundColor: '#222', color: '#fff', borderColor: '#222' },
  status: { color: '#444' },
  link: { color: '#0645ad', fontSize: 13 },
});
