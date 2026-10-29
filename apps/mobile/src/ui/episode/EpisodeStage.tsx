// The top of the Episode page: the cover to the fold, two glass pills, the episode's heat curve and its counts.
/**
 * M31 W3-A (T040; design-pulse2 `episode--screen`, left phone): "The cover fills the top 470 and fades to void; on it,
 * two glass pills (date · length, and the hottest moment, tap = play from it) and the episode curve (70 bars, 40 tall)
 * with the hot run glowing. Counts in mono under it."
 *
 * Drawn: the cover 470 tall under a veil that runs void 15 % → 40 % (half way) → void (480 tall); the pills at 64 (14
 * under the status bar), 32 tall, radius 16, 12 of padding, mono 12 on void at 45 % — the left in text, the right in
 * hot-text with the flame; the curve at 330, 20 in from each side, 70 bars 40 tall, bars 20–24 hot with a glow; the
 * counts line at 384, mono 12 in text2. RN has no CSS blur, so the glass is the plain void-at-45 % fill (the drawing's
 * `.blur` adds a backdrop blur). Unplayed bars are `barIdle` (40 %, the 3:1 floor for information; the drawing's 30 %).
 *
 * The cover is the episode's own art, else the show's (`Artwork`, drawn square at the stage height and cropped by the
 * box, so a 390-wide stage shows its middle). Everything in the stage is decoration or described: the curve is an image
 * named "Where people reacted"; the hottest pill is the one control.
 */
import { useWindowDimensions } from 'react-native';
import { LinearGradient } from '@/design/tailwind';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { colour } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Curve } from '@/ui/kit/Curve';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { mmss } from '@/ui/kit/format';
import { EPISODE, type EpisodeLayout } from './measures';
import type { Hottest } from './stage';

const VEIL = [EPISODE.veilTop, EPISODE.veilMid, colour.void] as const;
const AT = [0, 0.5, 1] as const;
const PILL = { minHeight: EPISODE.pillHeight, borderRadius: EPISODE.pillRadius, paddingHorizontal: EPISODE.pillPadX, backgroundColor: EPISODE.pillFill };
/** The hottest pill is drawn 32 tall; its tap area reaches 48. */
const PILL_SLOP = { top: 8, bottom: 8, left: 4, right: 4 };

export function EpisodeStage(props: {
  layout: EpisodeLayout;
  coverUrl: string | undefined;
  name: string | undefined;
  /** "TUE 27 OCT · 48:10". */
  date: string | undefined;
  hottest: Hottest | undefined;
  /** The 100 heat buckets on the audio's axis. */
  heat: readonly number[];
  onHottest: () => void;
}): React.ReactElement {
  const { width } = useWindowDimensions();
  const { layout, hottest } = props;
  const side = EPISODE.side;
  // The art is drawn square at the stage's height and centred: its middle shows when the stage is narrower.
  const art = Math.max(width, layout.stageHeight);
  return (
    <Box testID="episode-stage" style={{ height: layout.stageHeight, width }}>
      <Box testID="episode-cover" className="absolute overflow-hidden" style={{ left: 0, right: 0, top: 0, height: layout.stageHeight }} accessible={false} importantForAccessibility="no-hide-descendants">
        <Box style={{ position: 'absolute', left: (width - art) / 2, top: 0 }}>
          <Artwork url={props.coverUrl ?? null} size={art} {...(props.name !== undefined ? { name: props.name } : {})} />
        </Box>
      </Box>
      <LinearGradient testID="episode-veil" colors={VEIL} locations={AT} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: EPISODE.veilHeight + (layout.stageHeight - EPISODE.coverHeight) }} />
      <Box testID="episode-pills" className="absolute flex-row justify-between" style={{ left: side, right: side, top: layout.pillsTop, gap: EPISODE.pillGap }}>
        {props.date !== undefined ? (
          <Box className="flex-row items-center flex-shrink min-w-0" style={PILL}>
            <Type step="mono" className="text-text flex-shrink" numberOfLines={1}>{props.date}</Type>
          </Box>
        ) : <Box />}
        {hottest ? (
          <Pressable
            onPress={props.onHottest}
            accessibilityRole="button"
            accessibilityLabel={`Play from the hottest moment, ${mmss(hottest.atMs)}`}
            hitSlop={PILL_SLOP}
            className="flex-row items-center"
            style={[PILL, { gap: EPISODE.pillGap }]}
          >
            <Icon name="flame-outline" size={14} color={colour.hotText} />
            <Type step="mono" className="text-hotText" numberOfLines={1}>{`hottest at ${mmss(hottest.atMs)}`}</Type>
          </Pressable>
        ) : null}
      </Box>
      <Box testID="episode-curve" className="absolute" style={{ left: side, right: side, top: layout.curveTop }}>
        <Curve
          data={props.heat}
          count={EPISODE.curveBars}
          height={EPISODE.curveHeight}
          min={EPISODE.curveMin}
          {...(hottest ? { hotRange: hottest.range } : {})}
          accessibilityLabel={hottest ? `Where people reacted. Most reactions near ${mmss(hottest.atMs)}.` : 'Where people reacted'}
        />
      </Box>
    </Box>
  );
}
