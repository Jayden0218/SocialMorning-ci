// A ring that fills round a circle in the hot-to-violet pulse: the sleep timer's rings and clock track.
/**
 * M31 T024 (design-pulse2 `listen.html` `arcSvg`): an SVG circle drawn from 12 o'clock clockwise, `w` thick,
 * on a track colour, `fraction` of the way round in a hot → violet gradient (or one flat colour
 * when `colour` is given). Decoration — the control around it carries the name and the state.
 */
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colour } from '@/design';

export function Arc(props: { size: number; fraction: number; width?: number; track?: string; tint?: string; hot?: string; gradientId?: string }): React.ReactElement {
  const w = props.width ?? 10;
  const r = (props.size - w) / 2;
  const circ = 2 * Math.PI * r;
  const id = props.gradientId ?? 'arc';
  const f = Math.min(1, Math.max(0, props.fraction));
  return (
    <Svg width={props.size} height={props.size} viewBox={`0 0 ${props.size} ${props.size}`} style={{ transform: [{ rotate: '-90deg' }] }} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={props.hot ?? colour.hot} />
          <Stop offset="1" stopColor={colour.violet} />
        </LinearGradient>
      </Defs>
      <Circle cx={props.size / 2} cy={props.size / 2} r={r} fill="none" stroke={props.track ?? colour.line} strokeWidth={w} />
      {f > 0 ? (
        <Circle cx={props.size / 2} cy={props.size / 2} r={r} fill="none" stroke={props.tint ?? `url(#${id})`} strokeWidth={w} strokeLinecap="round" strokeDasharray={`${(circ * f).toFixed(1)} ${circ.toFixed(1)}`} />
      ) : null}
    </Svg>
  );
}
