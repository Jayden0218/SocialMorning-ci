// The reaction curve stopped: a run of bars left out in the middle, for a page where the app is paused.
/**
 * M31 W6-B (design-pulse2 shell.html `gapCurve(n, h, from, to, cols)`): the maintenance page (40 bars, 150 tall, bars 17-22 empty), the
 * crashed-screen page (40 bars, 120 tall, 15-24 empty, drawn idle) and the appeal page (46 bars, 64 tall, 20-26 empty). It is the kit's
 * `Curve` over a fixed heat shape, so it reads no data, no store and no provider — the error screen sits outside all of them. `idle`
 * draws the bars in the idle colour (`barIdle`, the drawing's white at 20 %, lifted to the 3:1 floor); otherwise they run hot to violet with a glow.
 */
import { Curve } from './Curve';

/** The drawing's heat shape (kit.js `heat()`: a small ripple plus five peaks at 14, 30, 47, 63 and 82), without the random part. */
export const PAUSED_HEAT: readonly number[] = Array.from({ length: 100 }, (_, k) => {
  let v = 0.1 + 0.04 * Math.sin(k * 1.7);
  for (const [c, h] of [[14, 0.5], [30, 1], [47, 0.35], [63, 0.75], [82, 0.5]] as const) v += h * Math.exp(-((k - c) ** 2) / 20);
  return Math.min(1, v);
});

export function GapCurve(props: { count: number; height: number; gapFrom: number; gapTo: number; idle?: boolean; className?: string }): React.ReactElement {
  return (
    <Curve
      data={PAUSED_HEAT}
      count={props.count}
      height={props.height}
      gap={3}
      min={3}
      gapRange={[props.gapFrom, props.gapTo]}
      {...(props.idle === true ? {} : { played: 1, glow: true })}
      {...(props.className ? { className: props.className } : {})}
    />
  );
}
