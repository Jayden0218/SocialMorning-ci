// From gluestack/gluestack-ui @ b712c85 (MIT), apps/starter-kit-expo-uniwind/components/ui/divider. Edits are marked // M9:.
// M9: gluestack's shadcn-style colour names are translated to the app's tokens (data-model §1).
'use client';
import React from 'react';
import { tva } from '@gluestack-ui/utils/nativewind-utils';
import { Platform, View } from 'react-native';
import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';

const dividerStyle = tva({
  base: 'bg-separator',
  variants: {
    orientation: {
      vertical: 'w-px h-full',
      horizontal: 'h-px w-auto',
    },
  },
});

type IUIDividerProps = React.ComponentPropsWithoutRef<typeof View> &
  VariantProps<typeof dividerStyle>;

const Divider = React.forwardRef<
  React.ComponentRef<typeof View>,
  IUIDividerProps
>(function Divider({ className, orientation = 'horizontal', ...props }, ref) {
  return (
    <View
      ref={ref}
      {...props}
      aria-orientation={orientation}
      role={Platform.OS === 'web' ? 'separator' : undefined}
      className={dividerStyle({
        orientation,
        class: className,
      })}
    />
  );
});

Divider.displayName = 'Divider';

export { Divider };
