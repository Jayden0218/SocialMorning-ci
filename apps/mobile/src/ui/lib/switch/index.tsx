// From gluestack/gluestack-ui @ b712c85 (MIT), apps/starter-kit-expo-uniwind/components/ui/switch. Edits are marked // M9:.
// M9: gluestack's shadcn-style colour names are translated to the app's tokens (data-model §1).
'use client';
import React from 'react';
import { Switch as RNSwitch } from 'react-native';
import { createSwitch } from '@gluestack-ui/core/switch/creator';
import { tva } from '@gluestack-ui/utils/nativewind-utils';
import { withStyleContext } from '@gluestack-ui/utils/nativewind-utils';
import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';
import { colour } from '@/design/tokens';

const UISwitch = createSwitch({
  Root: withStyleContext(RNSwitch),
});

const switchStyle = tva({
  base: 'data-[focus=true]:outline-0 data-[focus=true]:ring-2 data-[focus=true]:ring-accent web:cursor-pointer disabled:cursor-not-allowed data-[disabled=true]:opacity-40 data-[invalid=true]:border-accent data-[invalid=true]:rounded-xl data-[invalid=true]:border-2',

  variants: {
    size: {
      sm: 'scale-[0.75]',
      md: '',
      lg: 'scale-[1.25]',
    },
  },
});

type ISwitchProps = React.ComponentProps<typeof UISwitch> &
  VariantProps<typeof switchStyle>;
const Switch = React.forwardRef<
  React.ComponentRef<typeof UISwitch>,
  ISwitchProps
>(function Switch({ className: _className, size = 'md', ...props }, ref) {
  return (
    <UISwitch
      ref={ref}
      // M9: UniWind types a Switch's className as `never` and ignores it on native, so the
      // library's classes cannot colour it. The token colours go on as props instead, and a
      // caller's own trackColor / thumbColor still wins.
      trackColor={{ false: colour.separator, true: colour.primary }}
      thumbColor={colour.background}
      {...props}
      style={[{ transform: [{ scale: size === 'sm' ? 0.75 : size === 'lg' ? 1.25 : 1 }] }, props.style]}
    />
  );
});

Switch.displayName = 'Switch';
export { Switch };
