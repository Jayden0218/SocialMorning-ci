// One episode in a list: cover, title, show, length and date.
/**
 * One catalogue episode (M5): artwork, title, show · length · date, an optional line under it.
 * M17 (`Episode-B`, data-model §2 display-m): the title in the serif (serif SemiBold 16),
 * the meta at the 13 pt step; same props, same tap.
 */
import { Artwork } from '@/ui/kit/Artwork';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import type { EpisodeCard } from '@/social/api';
import { mmss } from '@/ui/kit/format';

export function EpisodeRow(props: { card: EpisodeCard; line?: string; onPress: () => void; disabled?: boolean; /** M8 FR-027: the reason must be part of what a screen reader speaks. */ label?: string }): React.ReactElement {
  const { card } = props;
  const meta = [card.showTitle, card.durationMs !== undefined ? mmss(card.durationMs) : undefined, card.publishedAt ? card.publishedAt.slice(0, 10) : undefined].filter(Boolean).join(' · ');
  return (
    <Pressable className="flex-row gap-row py-row border-b-hairline border-separator" onPress={props.onPress} disabled={props.disabled} accessibilityRole="button" accessibilityLabel={props.label ?? `${card.title}, ${card.showTitle}`}>
      {/* M12 B5: through Artwork, so Next up gets the initial, the fade and the token radius. */}
      <Artwork url={card.imageUrl} size={56} name={card.showTitle} />
      <Box className="flex-1 gap-0.5">
        <Text className="text-sm font-display-semibold text-text" numberOfLines={3}>{card.title}</Text>
        <Text className="text-muted text-meta" numberOfLines={1}>{meta}</Text>
        {props.line ? <Text className="text-text text-body" numberOfLines={2}>{props.line}</Text> : null}
      </Box>
    </Pressable>
  );
}
