// From gluestack/gluestack-ui @ b712c85 (MIT), apps/starter-kit-expo-uniwind/components/ui/text. Edits are marked // M9:.
import React, { createContext, useContext, useSyncExternalStore } from 'react';

import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';
import { Text as RNText } from 'react-native';
import { textStyle } from './styles';
// M17 (research R5): the Editorial faces, picked from the weight class once they have loaded.
import { familyFor, fontsStore, type Face } from '../../../design/fonts';

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
    // Until the fonts are in (or if they never load) the system fonts are used, as before M17.
    const face = fonts ? faceStyle(own) : undefined;
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
