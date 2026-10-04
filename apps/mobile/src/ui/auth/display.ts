// The large serif title style on sign-in pages.
/**
 * The large serif title on the sign-in page and its consent sheet (owner, 2026-10-03). Since M17
 * it is the Editorial serif, Lora Bold, once the fonts have loaded (src/design/fonts.ts);
 * until then, or if they never load, the system's own serif — Georgia on iOS, Noto Serif on
 * Android. Above the 24 pt type scale on purpose: it is the page's one display line. The colour
 * is passed in, so the title is never the default black (token check, M7).
 *
 * M17 (`EmailAuth-B`, `SignUp-B`, `SignIn-B`): the B titles mix two weights and a tighter
 * spacing — `semibold` picks Lora SemiBold, `tracking` sets the letter spacing,
 * `leading` the line height (B's own, tighter than the 1.15 default).
 */
import { Platform, type TextStyle } from 'react-native';
import { fontsStore } from '@/design/fonts';

const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

/** The serif's full height (ascent + descent) as a share of its size: Lora, read from its font file. */
export const SERIF_MIN_LEADING = 1.29;

export function display(size: number, color: string, opts: { semibold?: boolean; tracking?: number; leading?: number } = {}): TextStyle {
  // Owner, 2026-10-04 (cut-off titles on Android): Lora is 1.28 × its size tall (32.2 above the
  // baseline + 8.8 below at 32 pt) and Android clips text to its line height, so a line is never
  // shorter than SERIF_MIN_LEADING × size, whatever the caller asks.
  const lineHeight = Math.max(opts.leading ?? Math.round(size * 1.15), Math.ceil(size * SERIF_MIN_LEADING));
  const letterSpacing = opts.tracking ?? 0;
  // A custom face carries its own weight (a fontWeight on top makes Android fake a bold).
  if (fontsStore.get()) return { fontFamily: opts.semibold ? 'Lora-SemiBold' : 'Lora-Bold', fontWeight: 'normal', fontSize: size, lineHeight, letterSpacing, color };
  return { fontFamily: SERIF, fontWeight: opts.semibold ? '600' : '700', fontSize: size, lineHeight, letterSpacing, color };
}
