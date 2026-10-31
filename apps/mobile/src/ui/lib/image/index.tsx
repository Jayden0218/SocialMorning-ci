// From gluestack/gluestack-ui @ b712c85 (MIT), apps/starter-kit-expo-uniwind/components/ui/image. Edits are marked // M9:.
import React from 'react';
import { createImage } from '@gluestack-ui/core/image/creator';
import { Platform, Image as RNImage } from 'react-native';
import { tva } from '@gluestack-ui/utils/nativewind-utils';
import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';

const imageStyle = tva({
  base: 'max-w-full',
  variants: {
    size: {
      '2xs': 'h-6 w-6',
      'xs': 'h-10 w-10',
      'sm': 'h-16 w-16',
      'md': 'h-20 w-20',
      'lg': 'h-24 w-24',
      'xl': 'h-32 w-32',
      '2xl': 'h-64 w-64',
      'full': 'h-full w-full',
      'none': '',
    },
  },
});

const UIImage = createImage({ Root: RNImage });

type ImageProps = VariantProps<typeof imageStyle> &
  React.ComponentProps<typeof UIImage>;
const Image = React.forwardRef<
  React.ComponentRef<typeof UIImage>,
  ImageProps & { className?: string }
>(function Image({ size, className, ...props }, ref) {
  // M9: no default size — every caller sets its own (Artwork's size prop).
  return (
    <UIImage
      className={imageStyle({ size, class: className })}
      {...props}
      // Port of the 2026-10-04 lag audit (branch perf): gluestack's Image calls console.warn on
      // EVERY render without an `alt` — 48,294 warnings in one Debug session. The label, if any,
      // is the alt; a decorative image gets "" (no warning, nothing read aloud).
      alt={props.alt ?? props.accessibilityLabel ?? ''}
      ref={ref}
      // M9: upstream's @ts-expect-error was unused under our types (strict), so removed.
      // M9 (found on the iPhone): upstream set `undefined` here on native, AFTER the caller's
      // props, so every image sized by `style` drew at its full pixel size. Native keeps it.
      // M31 (web build): the caller's own style goes AFTER the class-size reset. Before, the reset replaced it, so on web
      // every image sized by `style` (Artwork, the Launch promotion, a Moments cover) lost its position and size and
      // collapsed to 30 x 30 — found by the wave-1 capture; native is untouched.
      style={
        Platform.OS === 'web'
          ? [{ height: 'revert-layer', width: 'revert-layer' }, props.style]
          : props.style
      }
    />
  );
});

Image.displayName = 'Image';
export { Image };
