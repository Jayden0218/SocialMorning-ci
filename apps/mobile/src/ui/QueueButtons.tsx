/** "Add to queue" / "Play next" (US2, FR-008/011), through player-core's enqueue. */
import { enqueue } from '@socialmorning/player-core';
import { Pressable, Text, View } from 'react-native';
import { useStores, useToast } from './providers';

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
    <View className="flex-row gap-2.5 my-1">
      <Pressable className="py-2 px-3.5 rounded-pill border border-separator" onPress={() => add('end')} accessibilityRole="button"><Text className="font-semibold text-text">Add to queue</Text></Pressable>
      <Pressable className="py-2 px-3.5 rounded-pill border border-separator" onPress={() => add('front')} accessibilityRole="button"><Text className="font-semibold text-text">Play next</Text></Pressable>
    </View>
  );
}
