/** The end-of-episode offer (M5 FR-010): the first Next-up item with its reason and a Play button — nothing plays by itself. */
import { Pressable, Text, View } from 'react-native';
import type { NextUpItem } from '../social/api';

export function EndOffer(props: { item: NextUpItem; onPlay: () => void }): React.ReactElement {
  return (
    <View className="mt-3 p-3 bg-surface rounded-[10px] gap-1" accessibilityLabel="Next up offer">
      <Text className="font-semibold text-text">That's the end. Next up:</Text>
      <Text className="text-sm font-semibold text-text" numberOfLines={2}>{props.item.episode.title}</Text>
      <Text className="text-muted">{props.item.episode.showTitle} · {props.item.label}</Text>
      <Pressable className="self-start bg-accent rounded-3xl px-5 py-2.5 mt-1.5" accessibilityRole="button" onPress={props.onPlay}><Text className="text-text font-semibold">Play it</Text></Pressable>
    </View>
  );
}
