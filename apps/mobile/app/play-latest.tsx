/**
 * `socialmorning://play-latest` (M10b US9) — what Siri's "Play my latest SocialNet episode"
 * opens: the first unfinished episode in the queue, else the newest in Updates. It plays and
 * goes to the player; with nothing to play it says so.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { latestToPlay } from '../src/outside/now-playing';
import { usePlayer } from '../src/playback/store';
import { useSafety } from '../src/safety/context';
import { toPlayable } from '../src/storage/playable';
import { EmptyPicture } from '../src/ui/me/parts';
import { useStores } from '../src/ui/providers';

export default function PlayLatest(): React.ReactElement {
  const stores = useStores();
  const player = usePlayer();
  const { hiddenFeeds } = useSafety();
  const [nothing, setNothing] = useState(false);
  useEffect(() => {
    const id = latestToPlay(stores, hiddenFeeds);
    const playable = id ? toPlayable(stores, id) : undefined;
    if (!playable) { setNothing(true); return; }
    player.load(playable, 'play');
    router.replace('/player');
  }, [stores, player, hiddenFeeds]);
  return (
    <View className="flex-1 bg-background">
      {nothing ? <EmptyPicture icon="play-circle-outline" line="Nothing new to play — follow a show or add to your queue" /> : <Text className="text-muted text-sm p-section">Starting…</Text>}
    </View>
  );
}
