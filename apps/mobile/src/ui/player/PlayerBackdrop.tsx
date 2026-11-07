// The player's page: the near-black void with the hot and violet glow, tinted by the show's colour.
/**
 * M31 T024 (design-pulse2 `kit.js` `glow('#FF6B8B','#5B3DF5',-60,.6)`): two soft radial glows
 * (35 % / 70 % across, 50 % / 40 % down) over the void, 60 % strong, drawn with a radial gradient — the
 * drawing blurs a CSS gradient by 40; React Native has no blur filter, and a radial gradient fading to nothing at
 * 70 % reads the same. Round 2: the colours are the drawing's pink #FF6B8B and indigo #5B3DF5 (not the brand
 * hot and violet), and the radii are the drawing's `closest-side` ones (`glowShape`): the first glow's reach is
 * 35 % of the width by 50 % of the height, the second's 30 % by 40 % — it had been 30 % by 35 % for both. The glow is decoration: the words sit on the void or on a raised surface,
 * never on the glow, so the contrast pairs do not depend on it.
 *
 * Owner, 2026-10-01 (kept): when the show's creator set a theme colour in the Studio, it replaces
 * the hot side of the glow. A colour that is not a plain #rrggbb falls back to hot. (A cover-colour
 * library is NOT used: research R2, T020 — the fallback pair is the shipped answer.)
 */
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { useColours } from '@/ui/kit/useColours';
import { useShowExtras } from '@/ui/show/ShowExtras';
import { PLAYER } from './measures';

/** The glow's two centres, as shares of its box (`at 35% 50%` and `at 70% 40%`). */
export const GLOW_A = { cx: 0.35, cy: 0.5 } as const;
export const GLOW_B = { cx: 0.7, cy: 0.4 } as const;
/** CSS `closest-side`: the ellipse reaches the nearest edge on each axis. The gradient is clear at 70 % of it. */
export function glowShape(at: { cx: number; cy: number }): { cx: number; cy: number; rx: number; ry: number } {
  return { cx: at.cx, cy: at.cy, rx: Math.min(at.cx, 1 - at.cx), ry: Math.min(at.cy, 1 - at.cy) };
}
const PCT = (n: number): string => `${Math.round(n * 100)}%`;

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The glow's two colours: the show's theme colour (or the listener's hot) and violet. */
export function glowPair(themeColour: string | null | undefined, hot: string): readonly [string, string] {
  // The drawing's pink and indigo — unless the listener chose another accent, which takes the hot side.
  const own = hot === colour.hot ? PLAYER.glowPink : hot;
  return [themeColour && HEX.test(themeColour.trim()) ? themeColour.trim() : own, PLAYER.glowIndigo];
}

/** `top` and `opacity` are the glow's own (the Episode page's scrolled glow is `glow(…, −300, .3)`); the player's are the defaults. */
export function PlayerBackdrop(props: { feedUrl: string | undefined; top?: number; opacity?: number }): React.ReactElement {
  const c = useColours();
  const { width } = useWindowDimensions();
  const [extras] = useShowExtras(props.feedUrl ?? '');
  const [a, b] = glowPair(extras?.overrides?.themeColour, c.hot);
  // left/right −30 % of the window, as drawn.
  const w = Math.round(width * 1.6);
  const h = PLAYER.glowHeight;
  const sa = glowShape(GLOW_A);
  const sb = glowShape(GLOW_B);
  return (
    <Box className="absolute inset-0 bg-void" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={w} height={h} style={{ position: 'absolute', left: -Math.round(width * 0.3), top: props.top ?? PLAYER.glowTop, opacity: props.opacity ?? PLAYER.glowOpacity }}>
        <Defs>
          <RadialGradient id="glowA" cx={PCT(sa.cx)} cy={PCT(sa.cy)} rx={PCT(sa.rx)} ry={PCT(sa.ry)} gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={a} stopOpacity="1" />
            <Stop offset="0.7" stopColor={a} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="glowB" cx={PCT(sb.cx)} cy={PCT(sb.cy)} rx={PCT(sb.rx)} ry={PCT(sb.ry)} gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={b} stopOpacity="1" />
            <Stop offset="0.7" stopColor={b} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={w} height={h} fill="url(#glowA)" />
        <Rect x="0" y="0" width={w} height={h} fill="url(#glowB)" />
      </Svg>
    </Box>
  );
}
