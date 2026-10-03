// The large serif title style on sign-in pages.
/**
 * The large serif title on the sign-in page and its consent sheet (owner, 2026-10-03). Since M17
 * it is the Editorial serif, Fraunces Bold, once the fonts have loaded (src/design/fonts.ts);
 * until then, or if they never load, the system's own serif — Georgia on iOS, Noto Serif on
 * Android. Above the 24 pt type scale on purpose: it is the page's one display line. The colour
 * is passed in, so the title is never the default black (token check, M7).
 *
 * M17 (`EmailAuth-B`, `SignUp-B`, `SignIn-B`): the B titles mix two weights and a tighter
 * spacing — `semibold` picks Fraunces SemiBold, `tracking` sets the letter spacing,
 * `leading` the line height (B's own, tighter than the 1.15 default).
 */
import { Platform, type TextStyle } from 'react-native';
import { fontsStore } from '@/design/fonts';

const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

export function display(size: number, color: string, opts: { semibold?: boolean; tracking?: number; leading?: number } = {}): TextStyle {
  const lineHeight = opts.leading ?? Math.round(size * 1.15);
  const letterSpacing = opts.tracking ?? 0;
  // A custom face carries its own weight (a fontWeight on top makes Android fake a bold).
  if (fontsStore.get()) return { fontFamily: opts.semibold ? 'Fraunces-SemiBold' : 'Fraunces-Bold', fontWeight: 'normal', fontSize: size, lineHeight, letterSpacing, color };
  return { fontFamily: SERIF, fontWeight: opts.semibold ? '600' : '700', fontSize: size, lineHeight, letterSpacing, color };
}
