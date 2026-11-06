// Where people reacted: the date, the hottest moment (tap = play from it) and the episode's heat curve, in the page's flow.
/**
 * Spec 039 (Detail template): replaces M31 W3-A's cover-to-the-fold `EpisodeStage` on the Episode page. The same two facts, the same one control
 * and the same curve (70 bars, the hot run lit), but as an ordinary block on the page's gutter instead of pills drawn over a 470 tall cover:
 * a row with the date and length on the left and "hottest at m:ss" on the right, then the curve named "Where people reacted".
 */
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { bars, colour, spacing } from '@/design';
import { Curve } from '@/ui/kit/Curve';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { mmss } from '@/ui/kit/format';
import { EPISODE } from './measures';
import type { Hottest } from './stage';

export function EpisodeHeat(props: {
  /** "TUE 27 OCT · 48:10". */
  date: string | undefined;
  hottest: Hottest | undefined;
  /** The 100 heat buckets on the audio's axis. */
  heat: readonly number[];
  onHottest: () => void;
}): React.ReactElement {
  const { hottest } = props;
  return (
    <Box testID="episode-heat" style={{ gap: spacing.row }}>
      <Box testID="episode-pills" className="flex-row items-center justify-between" style={{ gap: spacing.gap }}>
        {props.date !== undefined ? <Type step="mono" className="text-text2 flex-shrink min-w-0" numberOfLines={1}>{props.date}</Type> : <Box />}
        {hottest ? (
          <Pressable
            onPress={props.onHottest}
            accessibilityRole="button"
            accessibilityLabel={`Play from the hottest moment, ${mmss(hottest.atMs)}`}
            className="flex-row items-center justify-center"
            style={{ minHeight: bars.circle, gap: spacing.gap }}
          >
            <Icon name="flame-outline" size={14} color={colour.hotText} />
            <Type step="mono" className="text-hotText" numberOfLines={1}>{`hottest at ${mmss(hottest.atMs)}`}</Type>
          </Pressable>
        ) : null}
      </Box>
      <Box testID="episode-curve">
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
