/** One catalogue episode (M5): artwork, title, show · length · date, an optional line under it. */
import { Image } from './lib/image';
import { Pressable } from './lib/pressable';
import { Text } from './lib/text';
import { Box } from './lib/box';
import type { EpisodeCard } from '../social/api';
import { mmss } from './format';

export function EpisodeRow(props: { card: EpisodeCard; line?: string; onPress: () => void; disabled?: boolean; /** M8 FR-027: the reason must be part of what a screen reader speaks. */ label?: string }): React.ReactElement {
  const { card } = props;
  const meta = [card.showTitle, card.durationMs !== undefined ? mmss(card.durationMs) : undefined, card.publishedAt ? card.publishedAt.slice(0, 10) : undefined].filter(Boolean).join(' · ');
  return (
    <Pressable className="flex-row gap-3 py-2.5 border-b-hairline border-separator" onPress={props.onPress} disabled={props.disabled} accessibilityRole="button" accessibilityLabel={props.label ?? `${card.title}, ${card.showTitle}`}>
      {card.imageUrl ? <Image source={{ uri: card.imageUrl }} className="w-14 h-14 rounded-lg bg-surface" /> : <Box className="w-14 h-14 rounded-lg bg-surface" />}
      <Box className="flex-1 gap-0.5">
        <Text className="text-sm font-semibold text-text" numberOfLines={3}>{card.title}</Text>
        <Text className="text-muted text-[13px]" numberOfLines={1}>{meta}</Text>
        {props.line ? <Text className="text-text text-[14px]" numberOfLines={2}>{props.line}</Text> : null}
      </Box>
    </Pressable>
  );
}
