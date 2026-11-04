// From gluestack/gluestack-ui @ b712c85 (MIT), apps/starter-kit-expo-uniwind/components/ui/text. Edits are marked // M9:.
import React, { createContext, useContext, useSyncExternalStore } from 'react';

import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';
import { Text as RNText } from 'react-native';
import { textStyle } from './styles';
// M17 (research R5): the Editorial faces, picked from the weight class once they have loaded.
import { familyFor, fontsStore, type Face } from '@/design/fonts';

/** A nested Text with no weight class of its own takes its parent's face, as RN's fontWeight is inherited. */
const ParentFace = createContext<Face | undefined>(undefined);
const WEIGHT = / font-(display|display-semibold|medium|semibold|bold|extrabold|black|normal) /;

/** Custom faces carry their own weight; a fontWeight on top makes Android draw a fake bold. */
const FACE_STYLE = new Map<string, { fontFamily: string; fontWeight: 'normal' }>();
const faceStyle = (family: string) => {
  let s = FACE_STYLE.get(family);
  if (!s) { s = { fontFamily: family, fontWeight: 'normal' }; FACE_STYLE.set(family, s); }
  return s;
};

/** 038 FR-001: the weight each face stands for. While the fonts are not in, the system font is drawn at this weight, never at regular. */
const FACE_WEIGHT: Record<Face, FallbackWeight> = {
  'Unbounded-SemiBold': '600', 'Unbounded-Bold': '700', 'Unbounded-ExtraBold': '800',
  'Geist-Regular': '400', 'Geist-Medium': '500', 'Geist-SemiBold': '600', 'Geist-Bold': '700',
  'GeistMono-Regular': '400', 'GeistMono-Medium': '500', 'GeistMono-SemiBold': '600',
};
type FallbackWeight = '400' | '500' | '600' | '700' | '800';
const FALLBACK_STYLE = new Map<Face, { fontFamily: undefined; fontWeight: FallbackWeight }>();
const fallbackStyle = (face: Face) => {
  let s = FALLBACK_STYLE.get(face);
  if (!s) { s = { fontFamily: undefined, fontWeight: FACE_WEIGHT[face] }; FALLBACK_STYLE.set(face, s); }
  return s;
};

/**
 * M24 US18 (design-settings G1, G2): the face for a part that draws words but is not this Text —
 * a button's label, a text field, a heading. `undefined` until the fonts are in, so the system
 * font stays until then, as for Text — but at the face's weight (038 FR-001), so a title never falls back to regular.
 */
export function useFace(className: string | undefined, fallback?: Face): { fontFamily: string | undefined; fontWeight: 'normal' | FallbackWeight } {
  const fonts = useSyncExternalStore(fontsStore.subscribe, fontsStore.get, fontsStore.get);
  const classes = ` ${className ?? ''} `;
  const face = fallback !== undefined && !WEIGHT.test(classes) ? fallback : familyFor(classes);
  return fonts ? faceStyle(face) : fallbackStyle(face);
}

type ITextProps = React.ComponentProps<typeof RNText> &
  VariantProps<typeof textStyle>;

const Text = React.forwardRef<React.ComponentRef<typeof RNText>, ITextProps>(
  function Text(
    {
      className,
      isTruncated,
      bold,
      underline,
      strikeThrough,
      // M9: no default size — a nested Text inherits its parent's, as react-native's does.
      size,
      sub,
      italic,
      highlight,
      style,
      ...props
    },
    ref
  ) {
    const fonts = useSyncExternalStore(fontsStore.subscribe, fontsStore.get, fontsStore.get);
    const parent = useContext(ParentFace);
    const classes = ` ${className ?? ''}${bold ? ' font-bold' : ''} `;
    const own: Face = WEIGHT.test(classes) || parent === undefined ? familyFor(classes) : parent;
    // Until the fonts are in (or if they never load) the system font is used, at the face's weight (038 FR-001).
    const face = fonts ? faceStyle(own) : fallbackStyle(own);
    return (
      <ParentFace.Provider value={own}>
      <RNText
        className={textStyle({
          isTruncated: isTruncated as boolean,
          bold: bold as boolean,
          underline: underline as boolean,
          strikeThrough: strikeThrough as boolean,
          size,
          sub: sub as boolean,
          italic: italic as boolean,
          highlight: highlight as boolean,
          class: className,
        })}
        style={face ? [face, style] : style}
        {...props}
        ref={ref}
      />
      </ParentFace.Provider>
    );
  }
);

Text.displayName = 'Text';

export { Text };
