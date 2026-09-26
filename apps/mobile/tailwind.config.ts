/**
 * Tailwind (NativeWind 4) reads its theme from `src/design/tokens.ts`, so a colour is
 * still written down in one place (M7 FR-002).
 *
 * `colors` REPLACES Tailwind's palette instead of extending it: `bg-red-500` generates
 * nothing, and `scripts/token-check.mjs` fails the gate if one is written anyway.
 * Spacing and radius extend the default scale, so `p-4` (16) and `gap-3` (12) still work.
 */
import type { Config } from 'tailwindcss';
import { hairlineWidth } from 'nativewind/theme';
import { colour, fontSize, radius, spacing } from './src/design/tokens';

const px = (o: Record<string, number>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, `${v}px`]));

export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    colors: { transparent: 'transparent', ...colour },
    fontSize: px(fontSize),
    extend: {
      spacing: px({ 'screen-x': spacing.screenX, row: spacing.row, section: spacing.section }),
      borderRadius: px({ row: radius.row, artwork: radius.artwork, pill: radius.pill }),
      /** `StyleSheet.hairlineWidth`, as `border-hairline` / `border-b-hairline`. */
      borderWidth: { hairline: hairlineWidth() },
    },
  },
  plugins: [],
} satisfies Config;
