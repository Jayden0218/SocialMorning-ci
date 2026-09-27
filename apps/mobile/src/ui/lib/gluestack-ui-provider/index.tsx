// From gluestack/gluestack-ui @ b712c85 (MIT), apps/starter-kit-expo-uniwind/components/ui/gluestack-ui-provider. Edits are marked // M9:.
// M9: one light theme only — no `mode` and no `Uniwind.setTheme` call (research R2: setTheme
// restarted Android on RN 0.83, uniwind #556). The web-only `script.ts` is not copied.
import React from 'react';
import { View, ViewProps } from 'react-native';
import { OverlayProvider } from '@gluestack-ui/core/overlay/creator';
import { ToastProvider } from '@gluestack-ui/core/toast/creator';

export function GluestackUIProvider(props: {
  children?: React.ReactNode;
  style?: ViewProps['style'];
}) {
  return (
    <View style={[{ flex: 1, height: '100%', width: '100%' }, props.style]}>
      <OverlayProvider>
        <ToastProvider>{props.children}</ToastProvider>
      </OverlayProvider>
    </View>
  );
}
