/**
 * An editorial pick (M5 FR-001): the episode with the owner's one-line "why".
 *
 * M17 (`Home-B` pick card): a bordered white card; the "why" is a serif quote in the text colour.
 */
import { Text } from '@/ui/lib/text';
import type { DiscoverItem } from '@/social/api';
import { Card } from '@/ui/kit/Card';
import { EpisodeRow } from '@/ui/episode/EpisodeRow';

export function PickCard(props: { item: DiscoverItem; onPress: () => void }): React.ReactElement {
  return (
    <Card className="mb-2">
      <EpisodeRow card={props.item.episode} onPress={props.onPress} />
      {props.item.why ? <Text className="text-text text-body font-display-semibold py-row">“{props.item.why}”</Text> : null}
    </Card>
  );
}
