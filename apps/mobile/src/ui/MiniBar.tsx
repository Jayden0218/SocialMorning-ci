/**
 * The bar that says something is loaded. It is also the listener's way back
 * to the player from anywhere, which is why it sits in the root layout.
 */
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePlayer, usePlayerState } from '../playback/store';
import { useStores } from './providers';

export function MiniBar(): React.ReactElement | null {
  const player = usePlayer();
  const state = usePlayerState();
  const stores = useStores();

  if (state.kind === 'idle') return null;
  if (state.kind === 'error') {
    return (
      <View style={styles.bar}>
        <Text style={styles.title} numberOfLines={1}>
          {state.message}
        </Text>
      </View>
    );
  }

  const episode = stores.feeds.getEpisode(state.episodeId);
  const isPlaying = state.kind === 'playing' || state.kind === 'buffering';

  return (
    <View style={styles.bar}>
      <Link href="/player" style={styles.grow}>
        <Text style={styles.title} numberOfLines={1}>
          {episode?.title ?? 'Now playing'}
        </Text>
      </Link>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        onPress={() => (isPlaying ? player.pause() : player.play())}
      >
        <Text style={styles.button}>{isPlaying ? 'Pause' : 'Play'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    backgroundColor: '#fafafa',
  },
  grow: { flex: 1 },
  title: { fontSize: 15 },
  button: { fontSize: 15, fontWeight: '600', paddingHorizontal: 8 },
});
