/**
 * The large serif title on the sign-in page and its consent sheet (owner, 2026-10-03). The
 * system's own serif — Georgia on iOS, Noto Serif on Android — so no font file ships. Above
 * the 24 pt type scale on purpose: it is the page's one display line. The colour is passed
 * in, so the title is never the default black (token check, M7).
 */
import { Platform, type TextStyle } from 'react-native';

const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

export function display(size: number, color: string): TextStyle {
  return { fontFamily: SERIF, fontWeight: '700', fontSize: size, lineHeight: Math.round(size * 1.15), color };
}
