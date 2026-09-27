/**
 * "Continue listening" — the top of the Library, and the answer to Story 3's
 * whole complaint: coming back and not finding your place.
 *
 * Hidden when the last episode is finished; there is nothing to continue.
 */
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { usePlayer } from '../playback/store';
import { toPlayable } from '../storage/playable';
import { mmss } from './format';
import { useStores } from './providers';

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
    <View className="p-3 gap-1 border-hairline border-separator rounded-[10px] bg-surface">
      <Text className="text-xs uppercase text-muted tracking-[0.5px]">Continue listening</Text>
      <Text className="text-sm font-bold text-text" numberOfLines={2}>
        {episode.title}
      </Text>
      <Text className="text-[13px] text-muted">
        {episode.showTitle === '' ? mmss(offsetMs) : `${episode.showTitle} · ${mmss(offsetMs)}`}
      </Text>
      <Pressable
        className="self-start mt-1.5 py-2 px-[18px] rounded-pill bg-accent"
        accessibilityRole="button"
        accessibilityLabel={`Continue ${episode.title}`}
        onPress={() => {
          player.load(episode, 'play');
          router.push('/player');
        }}
      >
        <Text className="text-onAccent font-bold">Play</Text>
      </Pressable>
    </View>
  );
}
