/** An editorial pick (M5 FR-001): the episode with the owner's one-line "why". */
import { Text, View } from 'react-native';
import type { DiscoverItem } from '../social/api';
import { EpisodeRow } from './EpisodeRow';

export function PickCard(props: { item: DiscoverItem; onPress: () => void }): React.ReactElement {
  return (
    <View className="bg-surface rounded-[10px] px-3 mb-2">
      <EpisodeRow card={props.item.episode} onPress={props.onPress} />
      {props.item.why ? <Text className="italic text-muted pb-2.5">“{props.item.why}”</Text> : null}
    </View>
  );
}
