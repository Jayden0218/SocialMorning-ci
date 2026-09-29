// From gluestack/gluestack-ui @ b712c85 (MIT), apps/starter-kit-expo-uniwind/components/ui/safe-area-view. Edits are marked // M9: / // M12:.
'use client';
import React from 'react';
import { SafeAreaView as ContextSafeAreaView, type Edge } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

const Wrapped = withUniwind(ContextSafeAreaView);

/**
 * M12 (NEW-5, found on the iPhone 2026-09-29): this SafeAreaView — unlike React Native's own —
 * always adds the full inset, even inside another one. The root layout wraps every screen, so a
 * screen with its own SafeAreaView got the status-bar inset twice (a ~60 pt empty band). Each
 * edge is now padded once: a screen pads its top and sides by default; the root layout pads the
 * bottom (`edges={['bottom']}` in app/_layout.tsx). A screen may still pass its own `edges`.
 */
export const SCREEN_EDGES: readonly Edge[] = ['top', 'left', 'right'];

export function SafeAreaView(props: React.ComponentProps<typeof Wrapped>): React.ReactElement {
  return <Wrapped edges={SCREEN_EDGES as Edge[]} {...props} />;
}
