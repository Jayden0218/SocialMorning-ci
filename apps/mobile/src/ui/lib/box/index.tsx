// From gluestack/gluestack-ui @ b712c85 (MIT), apps/starter-kit-expo-uniwind/components/ui/box. Edits are marked // M9:.
import React from 'react';
import { View, ViewProps } from 'react-native';

import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';
import { boxStyle } from './styles';

type IBoxProps = ViewProps &
  VariantProps<typeof boxStyle> & { className?: string };

const Box = React.forwardRef<React.ComponentRef<typeof View>, IBoxProps>(
  function Box({ className, ...props }, ref) {
    return (
      <View ref={ref} {...props} className={boxStyle({ class: className })} />
    );
  }
);

Box.displayName = 'Box';
export { Box };
