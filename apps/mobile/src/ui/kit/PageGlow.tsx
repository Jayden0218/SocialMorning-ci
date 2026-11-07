// The soft two-colour glow behind the top of a page, as the pushed pages' drawings paint it.
/**
 * M31 W3-B (design-pulse2 `kit.js` `glow(a, b, top, strength)`; `listen.html` `pushed()` paints
 * `glow('#FF4D6D','#7A3CFF',-220,.32)`, the error and missing-episode pages `glow('#3A3A44','#24242C',-200,.4)`).
 * Two radial glows, the first at 35 % across and 50 % down, the second at 70 % across and 40 % down,
 * in a box 520 tall that starts `top` above the screen and reaches 30 % past each side. The drawing
 * blurs a CSS gradient; React Native has no blur filter, so each is a radial gradient fading to nothing
 * at 70 % — the same shape (the same device `DiscoverGlow` uses). Decoration only: no word sits on it.
 */
import { useId } from 'react';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';

export const PAGE_GLOW = { height: 520, spread: 0.3, hotTop: -220, hotStrength: 0.32, greyTop: -200, greyStrength: 0.4, blueTop: -180, blueStrength: 0.3 } as const;
/** `blue`: a topic list's page, drawn `glow('#3B82F6','#7A3CFF',-180,.3)` (design-pulse2 `topic--screen`). */
/** `ember`: hot against the line colour, the crashed-screen page (`glow('#FF4D6D','#24242C',-60,.4)`, shell.html `error-boundary--screen`). */
export type GlowTone = 'hot' | 'grey' | 'blue' | 'ember';

/** `flip`: the violet glow first (the status viewer is drawn `glow('#7A3CFF','#FF4D6D',-140,.45)`); hot first by default. */
export function PageGlow(props: { tone?: GlowTone; top?: number; strength?: number; flip?: boolean; /** M31 W6-A: the drawing's own two colours (the gift page paints its pink then violet). */ colours?: readonly [string, string] }): React.ReactElement {
  const { width } = useWindowDimensions();
  const grey = props.tone === 'grey';
  const blue = props.tone === 'blue';
  const ember = props.tone === 'ember';
  const first = grey ? colour.glowGrey : blue ? colour.pinBlue : props.flip === true ? colour.violet : colour.hot;
  const second = grey || ember ? colour.line : blue ? colour.violet : props.flip === true ? colour.hot : colour.violet;
  const top = props.top ?? (grey ? PAGE_GLOW.greyTop : blue ? PAGE_GLOW.blueTop : PAGE_GLOW.hotTop);
  const strength = props.strength ?? (grey ? PAGE_GLOW.greyStrength : blue ? PAGE_GLOW.blueStrength : PAGE_GLOW.hotStrength);
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const w = Math.round(width * (1 + 2 * PAGE_GLOW.spread));
  return (
    <Box className="absolute inset-0" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" testID="page-glow">
      <Svg width={w} height={PAGE_GLOW.height} style={{ position: 'absolute', left: -Math.round(width * PAGE_GLOW.spread), top, opacity: strength }}>
        <Defs>
          <RadialGradient id={`pgA${id}`} cx="35%" cy="50%" rx="35%" ry="50%" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={first} stopOpacity="1" />
            <Stop offset="0.7" stopColor={first} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={`pgB${id}`} cx="70%" cy="40%" rx="30%" ry="40%" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={second} stopOpacity="1" />
            <Stop offset="0.7" stopColor={second} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={w} height={PAGE_GLOW.height} fill={`url(#pgA${id})`} />
        <Rect x="0" y="0" width={w} height={PAGE_GLOW.height} fill={`url(#pgB${id})`} />
      </Svg>
    </Box>
  );
}
