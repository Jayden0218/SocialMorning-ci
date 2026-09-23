/**
 * The queue (US2): ordered list, move up / down / top, remove, play now. Buttons rather
 * than drag in M2 (research R3). The list re-reads the store on focus and after every
 * change; the runtime consumes the front item when an episode ends.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { move, remove } from '@socialmorning/player-core';
import { usePlayer } from '../src/playback/store';
import { toPlayable } from '../src/storage/playable';
import { mmss } from '../src/ui/format';
import { useStores } from '../src/ui/providers';
import { EmptyState } from '../src/ui/EmptyState';

export default function QueueScreen(): React.ReactElement {
  const stores = useStores();
  const player = usePlayer();
  const router = useRouter();
  const [ids, setIds] = useState<string[]>([]);
  const reload = useCallback(() => setIds(stores.queue.list()), [stores]);
  useFocusEffect(reload);

  const write = (next: readonly string[]) => { stores.queue.replace(next, Date.now()); reload(); };

  return (
    <FlatList
      data={ids}
      keyExtractor={(id) => id}
      contentContainerStyle={styles.body}
      ListHeaderComponent={<Text style={styles.muted}>{ids.length} of 300 · plays in order when the current episode ends</Text>}
      ListEmptyComponent={<EmptyState surface="queue" />}
      renderItem={({ item, index }) => {
        const episode = stores.feeds.getEpisode(item);
        const show = episode ? stores.feeds.getShow(episode.feedUrl) : undefined;
        const download = stores.downloads.get(item);
        return (
          <View style={styles.item}>
            <Text style={styles.title} numberOfLines={2}>{index + 1}. {episode?.title ?? item}</Text>
            <Text style={styles.muted}>
              {[show?.title, episode?.durationMs !== undefined ? mmss(episode.durationMs) : undefined, download?.state === 'complete' ? 'Downloaded' : 'Streams'].filter(Boolean).join(' · ')}
            </Text>
            <View style={styles.actions}>
              <Pressable disabled={index === 0} onPress={() => write(move(ids, item, index - 1))} accessibilityRole="button" accessibilityLabel="Move up"><Text style={[styles.link, index === 0 && styles.off]}>↑</Text></Pressable>
              <Pressable disabled={index === ids.length - 1} onPress={() => write(move(ids, item, index + 1))} accessibilityRole="button" accessibilityLabel="Move down"><Text style={[styles.link, index === ids.length - 1 && styles.off]}>↓</Text></Pressable>
              <Pressable disabled={index === 0} onPress={() => write(move(ids, item, 0))} accessibilityRole="button" accessibilityLabel="Move to top"><Text style={[styles.link, index === 0 && styles.off]}>Top</Text></Pressable>
              <Pressable onPress={() => write(remove(ids, item))} accessibilityRole="button" accessibilityLabel="Remove from the queue"><Text style={styles.danger}>Remove</Text></Pressable>
              <Pressable
                onPress={() => {
                  const playable = toPlayable(stores, item);
                  if (!playable) return;
                  write(remove(ids, item));
                  player.load(playable, 'play');
                  router.push('/player');
                }}
                accessibilityRole="button"
              >
                <Text style={styles.link}>Play now</Text>
              </Pressable>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  body: { padding: 12, gap: 4 },
  item: { paddingVertical: 8, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  title: { fontSize: 15, fontWeight: '600' },
  muted: { color: '#666', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  link: { color: '#0645ad', fontSize: 15 },
  off: { opacity: 0.3 },
  danger: { color: '#b00020', fontSize: 15 },
});
