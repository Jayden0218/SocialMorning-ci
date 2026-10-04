// From gluestack/gluestack-ui @ b712c85 (MIT), apps/starter-kit-expo-uniwind/components/ui/image. Edits are marked // M9:.
import React from 'react';
import { createImage } from '@gluestack-ui/core/image/creator';
import { Platform, Image as RNImage } from 'react-native';
import { tva } from '@gluestack-ui/utils/nativewind-utils';
import { requireOptionalNativeModule } from 'expo';
import { withUniwind } from 'uniwind';
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

/**
 * The lag audit (2026-10-04): React Native's Image has no disk cache and decodes covers at full
 * size, so every page re-fetched and faded in its artwork. expo-image caches in memory and on
 * disk and downsamples. It is a NATIVE module: an app built before it was added does not have it,
 * so it is used only when the build contains it, and React Native's Image otherwise. Jest keeps
 * React Native's Image (the tests read its props).
 */
function pickRoot(): React.ComponentType<React.ComponentProps<typeof RNImage>> {
  if (Platform.OS === 'web' || process.env['JEST_WORKER_ID'] !== undefined) return RNImage;
  if (!requireOptionalNativeModule('ExpoImage')) return RNImage;
  const { Image: ExpoImage } = require('expo-image') as typeof import('expo-image');
  return withUniwind(ExpoImage) as unknown as React.ComponentType<React.ComponentProps<typeof RNImage>>;
}

const UIImage = createImage({ Root: pickRoot() });

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
      // Owner, 2026-10-04 (the lag audit): gluestack's Image calls console.warn on EVERY render
      // without an `alt` — 48,294 warnings in one Debug session. The label, if any, is the alt;
      // a decorative image gets "" (no warning, nothing read aloud).
      alt={props.alt ?? props.accessibilityLabel ?? ''}
      ref={ref}
      // M9: upstream's @ts-expect-error was unused under our types (strict), so removed.
      // M9 (found on the iPhone): upstream set `undefined` here on native, AFTER the caller's
      // props, so every image sized by `style` drew at its full pixel size. Native keeps it.
      style={
        Platform.OS === 'web'
          ? { height: 'revert-layer', width: 'revert-layer' }
          : props.style
      }
    />
  );
});

Image.displayName = 'Image';
export { Image };
