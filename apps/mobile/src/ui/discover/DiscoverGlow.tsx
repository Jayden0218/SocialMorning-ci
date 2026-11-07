// The soft hot and violet glow behind the top of Discover, as drawn.
/**
 * M31 L7 (design-pulse2 `kit.js` `glow('#FF4D6D','#7A3CFF',-160,.4)`, used by `discover--screen`):
 * two radial glows, hot at 35 % across and 50 % down, violet at 70 % across and 40 % down, in a box
 * 520 tall that starts 160 above the screen and reaches 30 % past each side, 40 % strong. The drawing
 * blurs a CSS gradient; React Native has no blur filter, so each is a radial gradient (closest-side
 * radii, fading to nothing at 70 %) — the same shape. Decoration only: no word sits on it alone.
 */
import { useId } from 'react';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { useColours } from '@/ui/kit/useColours';

/** The glow's box, from the drawing. */
export const GLOW = { top: -160, height: 520, spread: 0.3, strength: 0.4 } as const;

/**
 * Search draws the same glow with the two colours swapped, 260 above the screen and 25 % strong
 * (design-pulse2 `glow('#7A3CFF','#FF4D6D',-260,.25)`): `swap`, `top` and `strength` say so; the default is Discover's.
 */
export function DiscoverGlow(props: { swap?: boolean; top?: number; strength?: number } = {}): React.ReactElement {
  const { width } = useWindowDimensions();
  const c = useColours();
  const first = props.swap ? colour.violet : c.hot;
  const second = props.swap ? c.hot : colour.violet;
  // Search draws this over Discover; two gradients with one id would paint both with the first's colours (web).
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const w = Math.round(width * (1 + 2 * GLOW.spread));
  return (
    <Box className="absolute inset-0" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" testID="discover-glow">
      <Svg width={w} height={GLOW.height} style={{ position: 'absolute', left: -Math.round(width * GLOW.spread), top: props.top ?? GLOW.top, opacity: props.strength ?? GLOW.strength }}>
        <Defs>
          <RadialGradient id={`dgA${id}`} cx="35%" cy="50%" rx="35%" ry="50%" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={first} stopOpacity="1" />
            <Stop offset="0.7" stopColor={first} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={`dgB${id}`} cx="70%" cy="40%" rx="30%" ry="40%" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={second} stopOpacity="1" />
            <Stop offset="0.7" stopColor={second} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={w} height={GLOW.height} fill={`url(#dgA${id})`} />
        <Rect x="0" y="0" width={w} height={GLOW.height} fill={`url(#dgB${id})`} />
      </Svg>
    </Box>
  );
}
