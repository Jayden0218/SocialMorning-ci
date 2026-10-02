/**
 * The large serif title on the sign-in page and its consent sheet (owner, 2026-10-03). Since M17
 * it is the Editorial serif, Fraunces Bold, once the fonts have loaded (src/design/fonts.ts);
 * until then, or if they never load, the system's own serif — Georgia on iOS, Noto Serif on
 * Android. Above the 24 pt type scale on purpose: it is the page's one display line. The colour
 * is passed in, so the title is never the default black (token check, M7).
 */
import { Platform, type TextStyle } from 'react-native';
import { fontsStore } from '../../design/fonts';

const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

export function display(size: number, color: string): TextStyle {
  const lineHeight = Math.round(size * 1.15);
  // A custom face carries its own weight (a fontWeight on top makes Android fake a bold).
  if (fontsStore.get()) return { fontFamily: 'Fraunces-Bold', fontWeight: 'normal', fontSize: size, lineHeight, color };
  return { fontFamily: SERIF, fontWeight: '700', fontSize: size, lineHeight, color };
}
