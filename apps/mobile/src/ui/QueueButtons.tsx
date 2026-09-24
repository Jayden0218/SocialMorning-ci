/** "Add to queue" / "Play next" (US2, FR-008/011), through player-core's enqueue. */
import { enqueue } from '@socialmorning/player-core';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useStores, useToast } from './providers';
import { colour } from '../design';

export function QueueButtons(props: { episodeId: string; onQueued?: () => void }): React.ReactElement {
  const stores = useStores();
  const toast = useToast();
  const add = (where: 'end' | 'front') => {
    const r = enqueue(stores.queue.list(), props.episodeId, where);
    if (r.refused) { toast('The queue is full (300). Remove something first.'); return; }
    stores.queue.replace(r.queue, Date.now());
    if (r.evicted) toast('The queue was full — the last item was dropped.');
    toast(where === 'end' ? 'Added to the queue' : 'Playing next');
    props.onQueued?.();
  };
  return (
    <View style={styles.row}>
      <Pressable style={styles.button} onPress={() => add('end')} accessibilityRole="button"><Text style={styles.text}>Add to queue</Text></Pressable>
      <Pressable style={styles.button} onPress={() => add('front')} accessibilityRole="button"><Text style={styles.text}>Play next</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginVertical: 4 },
  button: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colour.separator },
  text: { fontWeight: '600' },
});
