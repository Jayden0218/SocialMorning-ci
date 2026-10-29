// Card at episode end: "Next up" episode with a Play button.
/**
 * The end-of-episode offer (M5 FR-010): the first Next-up item with its reason and a Play button — nothing plays by itself.
 *
 * M31 T024 (design-pulse2 `player--episode-end-offer`): the card takes the controls' place. Raise,
 * radius 24, a 1 px line, 14 of padding, 12 between its parts; the page puts it 116 from the bottom, 16 in from each side; the cover (64, radius 16), "That's the end. Next up:" in
 * Unbounded 15, the next title (Geist 600 14), its reason in hot-text mono ("FROM YOUR QUEUE", or
 * the related label), and "Play it" — a light pill 44 tall (the fixed `play` token, so the accent theme never changes it) with a void play glyph. The label and
 * handler are unchanged. The ring above is fully lit and the tray stays.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import type { NextUpItem } from '@/social/api';
import { PLAYER } from './measures';

export function EndOffer(props: { item: NextUpItem; onPlay: () => void }): React.ReactElement {
  const c = useColours();
  const { episode } = props.item;
  return (
    <Box className="flex-row items-center bg-raise border border-line rounded-card" style={{ padding: PLAYER.offerPad, gap: PLAYER.titleRowGap }} accessibilityLabel="Next up offer">
      <Artwork url={episode.imageUrl} size={PLAYER.offerCover} rounded="row" name={episode.showTitle} />
      <Box className="flex-1">
        <Type step="lede" className="text-text" style={{ fontSize: PLAYER.offerTitle, lineHeight: PLAYER.offerTitleLine }}>{"That's the end.\nNext up:"}</Type>
        <Type step="compact" className="text-text" style={{ marginTop: PLAYER.showGap }} numberOfLines={2}>{episode.title}</Type>
        <Type step="mono" className="text-hotText" style={{ fontSize: PLAYER.tileDetail, lineHeight: PLAYER.tileDetailLine, marginTop: PLAYER.offerLabelGap }} numberOfLines={1}>{props.item.label.toUpperCase()}</Type>
      </Box>
      <Pressable className="flex-row items-center justify-center gap-hair bg-play rounded-pill" style={{ height: PLAYER.offerPlay, paddingHorizontal: PLAYER.offerPlayPad }} accessibilityRole="button" accessibilityLabel="Play it" onPress={props.onPlay}>
        <Icon name="play" size={PLAYER.offerPlayGlyph} color={c.onPlay} />
        <Type step="row" className="text-onPlay">Play it</Type>
      </Pressable>
    </Box>
  );
}
