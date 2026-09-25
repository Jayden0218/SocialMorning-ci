/**
 * "Continue listening" — the top of the Library, and the answer to Story 3's
 * whole complaint: coming back and not finding your place.
 *
 * Hidden when the last episode is finished; there is nothing to continue.
 */
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePlayer } from '../playback/store';
import { toPlayable } from '../storage/playable';
import { mmss } from './format';
import { useStores } from './providers';
import { colour } from '../design';

export function ContinueListening(): React.ReactElement | null {
  const stores = useStores();
  const player = usePlayer();
  const router = useRouter();

  const session = stores.session.get();
  if (session?.episodeId === undefined) return null;

  const episode = toPlayable(stores, session.episodeId);
  if (episode === undefined) return null;

  const saved = stores.positions.get(session.episodeId);
  if (saved?.finished === true) return null;

  const offsetMs = saved?.offsetMs ?? 0;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Continue listening</Text>
      <Text style={styles.title} numberOfLines={2}>
        {episode.title}
      </Text>
      <Text style={styles.subtitle}>
        {episode.showTitle === '' ? mmss(offsetMs) : `${episode.showTitle} · ${mmss(offsetMs)}`}
      </Text>
      <Pressable
        style={styles.play}
        accessibilityRole="button"
        accessibilityLabel={`Continue ${episode.title}`}
        onPress={() => {
          player.load(episode, 'play');
          router.push('/player');
        }}
      >
        <Text style={styles.playText}>Play</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colour.separator,
    borderRadius: 10,
    backgroundColor: colour.surface,
  },
  label: { fontSize: 12, textTransform: 'uppercase', color: colour.muted, letterSpacing: 0.5 },
  title: { fontSize: 16, fontWeight: '700', color: colour.text },
  subtitle: { fontSize: 13, color: colour.muted },
  play: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: colour.accent,
  },
  playText: { color: colour.text, fontWeight: '700' },
});
