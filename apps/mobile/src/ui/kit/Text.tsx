// The app's plain Text with the font-size cap already on it (use Type for a step of the scale).
/**
 * M31 R2 (fontscale2 README): a raw `<Text>` grows without limit at 200 % system text and breaks its box. This is the gluestack
 * Text (`@/ui/lib/text`) with `maxFontSizeMultiplier` defaulting to `TYPE_CAP` (1.3, as `Type`); a caller's own value wins.
 * Every other prop and the ref pass through. The guard `__tests__/m31-r2-text-cap.test.ts` fails for a `<Text` that has neither.
 */
import React from 'react';
import { Text as BaseText } from '@/ui/lib/text';
import { TYPE_CAP } from './Type';

type TextProps = React.ComponentProps<typeof BaseText>;

export const Text = React.forwardRef<React.ComponentRef<typeof BaseText>, TextProps>(function Text(props, ref) {
  return <BaseText maxFontSizeMultiplier={TYPE_CAP} {...props} ref={ref} />;
});
Text.displayName = 'Text';
