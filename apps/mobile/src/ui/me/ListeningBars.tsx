// Listening data's bar chart: minutes per day or month as 120 tall bars; tap one to read its minutes.
/**
 * M31 W3-C (T041; design-pulse2 `discover.html` `lBars`, `listenBody`, `me-listening--screen`, `--30-days`). The chart is
 * a row of bars, 120 tall, 3 apart, each a flex share with a 3 radius; a bar is `8 + 110 × (minutes ÷ the busiest)`
 * tall, a day with no minutes a 3 high tick. The bars carry information (minutes), so they are the 3:1 `barIdle` white, not
 * the drawing's #3A3A44 (1.7:1); the tapped bar is hot. Under it one line reads the tapped bar — "Fri 16 Oct: 48 min" —
 * or "Tap a bar to see its minutes." and, under that, the first and last bars named ("Today" for the newest day).
 * A tap anywhere in a bar's column picks it (the chart is one control for a screen reader: an image with the summary,
 * as before — the bars are 10–25 wide, so each is not its own 48 pt button).
 */
import { useState } from 'react';
import { Box } from '@/ui/lib/box';
import { Type } from '@/ui/kit/Type';
import { chartSpoken, minutesLabel, pointLabel } from '@/me/listening-chart';
import type { Listening } from '@/me/listening-api';
import { ME_TYPE } from './measures';

/** The chart's drawn numbers. */
export const BARS = { height: 120, gap: 3, radius: 3, floor: 8, span: 110, tick: 3 } as const;

/** A bar's height: the floor plus the span times its share of the busiest; a quiet day is a tick. */
export function barHeight(minutes: number, busiest: number): number {
  if (minutes <= 0 || busiest <= 0) return BARS.tick;
  return Math.round(BARS.floor + BARS.span * Math.min(1, minutes / busiest));
}

/** The column under a touch `x` of a chart `width` wide with `n` bars. */
export function columnAt(x: number, width: number, n: number): number | undefined {
  if (n === 0 || width <= 0 || x < 0 || x > width) return undefined;
  return Math.min(n - 1, Math.floor((x / width) * n));
}

export function ListeningBars(props: { points: Listening['days']; unit: 'day' | 'month' }): React.ReactElement {
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | undefined>();
  const busiest = Math.max(0, ...props.points.map((p) => p.minutes));
  // M31 F9 (me-listening--all-time): the all-time chart opens on its last month, read out; the 30-day chart waits for a tap.
  const shown = picked !== undefined ? picked : props.unit === 'month' && props.points.length > 0 ? props.points.length - 1 : undefined;
  const chosen = shown !== undefined ? props.points[shown] : undefined;
  const first = props.points[0];
  const last = props.points[props.points.length - 1];
  return (
    <Box style={{ gap: 12 }}>
      <Box
        testID="listening-bars"
        className="flex-row items-end"
        style={{ height: BARS.height, gap: BARS.gap }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={chartSpoken(props.points, props.unit)}
        onStartShouldSetResponder={() => true}
        onResponderRelease={(e) => {
          const at = columnAt(e.nativeEvent.locationX, width, props.points.length);
          if (at !== undefined) setPicked(at === picked ? undefined : at);
        }}
      >
        {props.points.map((p, i) => (
          <Box
            key={p.day}
            testID="listening-bar"
            className={i === shown ? 'flex-1 bg-hot' : 'flex-1 bg-barIdle'}
            pointerEvents="none"
            style={{ height: barHeight(p.minutes, busiest), borderRadius: BARS.radius }}
          />
        ))}
      </Box>
      {/* The tapped bar's value, or a hint until one is tapped. */}
      <Type step="caption" className="text-text2" accessibilityLiveRegion="polite">
        {chosen ? `${pointLabel(chosen.day)}: ${minutesLabel(chosen.minutes)}` : 'Tap a bar to see its minutes.'}
      </Type>
      {first && last ? (
        <Box className="flex-row justify-between">
          <Type step="caption" className="text-text3" style={ME_TYPE.node12}>{pointLabel(first.day)}</Type>
          <Type step="caption" className="text-text3" style={ME_TYPE.node12}>{props.unit === 'day' ? 'Today' : pointLabel(last.day)}</Type>
        </Box>
      ) : null}
    </Box>
  );
}
