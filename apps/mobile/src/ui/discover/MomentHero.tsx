// The hero at the top of Discover: the first moment of the Moments feed, with its curve and a Play from the moment.
/**
 * Spec 039 (M4, `design/B-Discover.dc.html`). Nothing is new: the moment is the first item of the Moments list the Home screen already
 * reads (`useMoments`), the curve is its own (`moment.curve`, else the episode's heat read, `useEpisodeHeat`), and Play is the Moments
 * card's own `playFull`. The card is the accent fill with void words: the tag "Moment of the day", the time chip (where the moment starts),
 * the episode title, the curve (the moment's bars solid, the rest at 25 %), then Play from the moment and the show.
 * With no moments the page does not draw it (`DiscoverPage`), and nothing waits for it.
 */
import { useMemo } from 'react';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { bars, colour, radius, spacing } from '@/design';
import { spread } from '@/ui/kit/Curve';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { mmss } from '@/ui/kit/format';
import type { Moment } from '@/discover/moments-api';
import { useEpisodeHeat } from './useEpisodeHeat';
import { hotBars } from './moments-logic';

const BARS = 50;
const MIN_BAR = 2;
const NO_HEAT: readonly number[] = Array.from<number>({ length: 100 }).fill(0);

export function MomentHero(props: { moment: Moment; onPlay: (m: Moment) => void }): React.ReactElement {
  const m = props.moment;
  const heat = useEpisodeHeat(m.episodeId, true);
  const at = mmss(m.startMs);
  const data = useMemo(() => (m.curve && m.curve.length > 0 ? m.curve.map((v) => v / 100) : heat.buckets ?? NO_HEAT), [m.curve, heat.buckets]);
  const heights = useMemo(() => spread(data, BARS), [data]);
  const lit = hotBars(m, heat.durationMs, BARS);
  return (
    <Box testID="discover-hero" className="bg-hot" style={{ gap: spacing.section, padding: spacing.screenX, borderRadius: radius.card }}>
      <Box className="flex-row items-center justify-between">
        <Type step="small" className="text-void font-semibold uppercase">Moment of the day</Type>
        <Box className="bg-void/15 rounded-chip" style={{ paddingHorizontal: spacing.hair + 2, paddingVertical: 2 }}>
          <Type step="time" className="text-void">{at}</Type>
        </Box>
      </Box>
      <Pressable onPress={() => props.onPlay(m)} accessibilityRole="button" accessibilityLabel={`Play ${m.episodeTitle} from ${at}`} accessibilityHint={m.showTitle}>
        <Type step="statement" className="text-void font-extrabold" numberOfLines={3}>{m.episodeTitle}</Type>
      </Pressable>
      <Box className="flex-row items-end" style={{ height: bars.circle, gap: 2 }} accessible accessibilityRole="image" accessibilityLabel={`Where people reacted. This moment: ${at}`}>
        {heights.map((v, k) => (
          <Box
            key={k}
            testID="hero-bar"
            pointerEvents="none"
            className={lit && k >= lit[0] && k <= lit[1] ? 'flex-1 bg-void rounded-tick' : 'flex-1 bg-void/25 rounded-tick'}
            style={{ height: Math.round(MIN_BAR + (bars.circle - MIN_BAR) * v) }}
          />
        ))}
      </Box>
      <Box className="flex-row items-center" style={{ gap: spacing.row }}>
        <Pressable
          onPress={() => props.onPlay(m)}
          accessibilityRole="button"
          accessibilityLabel={`Play from ${at}`}
          className="items-center justify-center bg-void"
          style={{ width: bars.circle, height: bars.circle, borderRadius: radius.pill, paddingLeft: 2 }}
        >
          <Icon name="play" size={16} color={colour.text} />
        </Pressable>
        <Type step="small" className="text-void flex-1" numberOfLines={2}>{`${m.showTitle} · play from the moment`}</Type>
      </Box>
    </Box>
  );
}
