// Card at episode end: "Next up" episode with a Play button.
/**
 * The end-of-episode offer (M5 FR-010): the first Next-up item with its reason and a Play button — nothing plays by itself.
 *
 * M17 T110 (`EpisodeEnd-B`): a white card — "That's the end. Next up:" as a serif heading, the
 * episode's artwork beside its serif title and show, the reason as an accent tag, and Play it as a
 * full-width yellow pill with a play icon. The label and handler are unchanged.
 *
 * M24 US19 (`EpisodeEnd-B`): the card is the middle of the "Finished" page — `fill` lets it take
 * the free height with Play it pinned to its foot; 24 pt corners, 18 pt padding, a 26 pt heading.
 * Play it is the strong yellow (`play`, fixed whatever the accent theme) with the dark glyph (owner, 2026-10-08: main Play
 * buttons are the strong yellow; list-row discs stay pale).
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { useColours } from '@/ui/kit/useColours';
import { size } from '@/design';
import type { NextUpItem } from '@/social/api';

/** B's pill is 52 pt; the token row height (50) is the nearest. */
const PILL = { minHeight: size.row };

export function EndOffer(props: { item: NextUpItem; onPlay: () => void; fill?: boolean }): React.ReactElement {
  const c = useColours();
  const { episode } = props.item;
  return (
    <Box className={`p-[18px] bg-surface border border-border rounded-[24px] gap-3.5 ${props.fill ? 'flex-1' : ''}`} accessibilityLabel="Next up offer">
      <Text className="text-[26px] leading-[34px] font-display text-text">{"That's the end.\nNext up:"}</Text>
      <Box className="flex-row items-start gap-3.5">
        <Artwork url={episode.imageUrl} size={112} rounded="row" name={episode.showTitle} />
        <Box className="flex-1 gap-1.5">
          <Text className="text-[19px] leading-[25px] font-display-semibold text-text" numberOfLines={3}>{episode.title}</Text>
          <Text className="text-meta font-bold text-text" numberOfLines={1}>{episode.showTitle}</Text>
        </Box>
      </Box>
      <Box className="self-start bg-accentTint rounded-pill px-row py-1.5">
        <Text className="text-xs font-bold text-accent">{props.item.label}</Text>
      </Box>
      <Pressable className={`flex-row items-center justify-center gap-gap bg-play rounded-pill px-section ${props.fill ? 'mt-auto' : 'mt-1'}`} style={PILL} accessibilityRole="button" onPress={props.onPlay}>
        <Icon name="play" size={18} color={c.onPlay} />
        <Text className="text-onPlay text-sm font-bold">Play it</Text>
      </Pressable>
    </Box>
  );
}
