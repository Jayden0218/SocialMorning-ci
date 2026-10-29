// The heat bars: where people reacted along an episode, as a row of bars; played ones turn hot to violet.
/**
 * M31 T022 (design-pulse2 `kit.js` `PK.bars`): `count` bars drawn from the 100 heat buckets
 * (every `round(100 / count)`-th), each `min + (height - min) * v` tall. The played bars run hot to
 * violet, graded across the played part; the rest are `barIdle` (white at 40 % — the drawings'
 * 18–28 % fail the 3:1 floor for information, see PAIRS; the Moments curve too: it shows where people reacted). `glow` adds the hot glow to played bars,
 * `hotRange` lights a run of bars hot with the drawn glow, 8 blur at 70 % (the Moments card), `flat` draws the empty state's flat line.
 * With `onSeek` a touch or drag along the bars asks for that fraction of the episode, and the bars
 * are one adjustable control for a screen reader; without it they are decoration or a described image.
 */
import { useMemo, useRef } from 'react';
import { PanResponder } from 'react-native';
import { Box } from '@/ui/lib/box';
import { colour, glow as glowToken } from '@/design';
import { playedColour, playedCount } from './pulse-math';
import { useColours } from './useColours';

/**
 * `n` bars spread over ALL of `data`: bar `k` reads bucket `floor(k * length / n)`. At 50 bars over
 * 100 buckets that is every second one, as the drawing; at 70 it reaches the last bucket too. (The
 * drawing's helper takes every `round(100 / n)`-th and cuts at `n` — at 70 that is only the first 70
 * buckets, so a moment late in an episode would have no bars under it. M31 L7.) Empty data → zeros.
 */
export function spread(data: readonly number[], n: number): number[] {
  if (data.length === 0) return Array.from({ length: n }, () => 0);
  return Array.from({ length: n }, (_, k) => {
    const v = data[Math.min(data.length - 1, Math.floor((k * data.length) / n))]!;
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
  });
}

export function Curve(props: {
  /** The heat buckets, 0–1 each (100 of them; any length is sampled). */
  data: readonly number[];
  count?: number;
  height?: number;
  /** How much is played, 0–1. */
  played?: number;
  gap?: number;
  /** The shortest a bar is drawn. */
  min?: number;
  glow?: boolean;
  /** Bars `from` to `to` (indexes among the drawn bars) are hot, whatever is played. */
  hotRange?: readonly [number, number];
  /** Every bar the same height in the `line` colour — the empty state's flat curve. */
  flat?: boolean;
  /** Bars `from` to `to` are left empty but keep their place: the paused curve of the maintenance, error and appeal pages (shell.html `gapCurve`). */
  gapRange?: readonly [number, number];
  onSeek?: (fraction: number) => void;
  /** The spoken name ("Where people reacted"). Without one the bars are hidden from a screen reader. */
  accessibilityLabel?: string;
  className?: string;
}): React.ReactElement {
  const n = props.count ?? 50;
  const height = props.height ?? 24;
  const min = props.min ?? 3;
  const gap = props.gap ?? 2;
  const c = useColours();
  const heights = useMemo(() => spread(props.data, n), [props.data, n]);
  const done = props.flat ? 0 : playedCount(props.played ?? 0, n);
  const width = useRef(0);
  const seek = props.onSeek;
  const pan = useMemo(() => {
    const at = (x: number) => (width.current > 0 ? Math.min(1, Math.max(0, x / width.current)) : 0);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => seek !== undefined,
      onMoveShouldSetPanResponder: () => seek !== undefined,
      onPanResponderGrant: (e) => seek?.(at(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => seek?.(at(e.nativeEvent.locationX)),
    });
  }, [seek]);
  const label = props.accessibilityLabel;
  return (
    <Box
      className={`flex-row items-end ${props.className ?? ''}`}
      style={{ height, gap }}
      onLayout={(e) => { width.current = e.nativeEvent.layout.width; }}
      {...(seek ? pan.panHandlers : {})}
      {...(label !== undefined
        ? { accessible: true, accessibilityLabel: label, ...(seek ? { accessibilityRole: 'adjustable' as const } : { accessibilityRole: 'image' as const }) }
        : { accessible: false, importantForAccessibility: 'no-hide-descendants' as const })}
    >
      {heights.map((v, k) => {
        const hot = props.hotRange !== undefined && k >= props.hotRange[0] && k <= props.hotRange[1];
        const isPlayed = k < done;
        const gap = props.gapRange !== undefined && k >= props.gapRange[0] && k <= props.gapRange[1];
        const bg = gap ? colour.clear : props.flat ? colour.line : hot ? c.hot : isPlayed ? playedColour(k, done, c.hot) : colour.barIdle;
        const h = props.flat ? height : Math.round(min + (height - min) * v);
        const lit = !gap && ((props.glow === true && isPlayed) || hot);
        return (
          <Box
            key={k}
            testID="curve-bar"
            pointerEvents="none"
            className="flex-1 rounded-tick"
            style={{
              height: h,
              backgroundColor: bg,
              ...(lit ? { shadowColor: c.hot, shadowOpacity: hot ? glowToken.bar.opacity : 0.55, shadowRadius: hot ? glowToken.bar.radius : Math.max(2, Math.round(v * 5)), shadowOffset: { width: 0, height: 0 } } : null),
            }}
          />
        );
      })}
    </Box>
  );
}
