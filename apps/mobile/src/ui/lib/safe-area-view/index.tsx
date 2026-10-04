// From gluestack/gluestack-ui @ b712c85 (MIT), apps/starter-kit-expo-uniwind/components/ui/safe-area-view. Edits are marked // M9: / // M12:.
'use client';
import React from 'react';
import { View, type ViewProps } from 'react-native';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

/**
 * M12 (NEW-5, found on the iPhone 2026-09-29): this SafeAreaView — unlike React Native's own —
 * always adds the full inset, even inside another one. The root layout wraps every screen, so a
 * screen with its own SafeAreaView got the status-bar inset twice (a ~60 pt empty band). Each
 * edge is now padded once: a screen pads its top and sides by default; the root layout pads the
 * bottom (`edges={['bottom']}` in app/_layout.tsx). A screen may still pass its own `edges`.
 */
export const SCREEN_EDGES: readonly Edge[] = ['top', 'left', 'right'];

/**
 * M17 (owner, 2026-10-04: "a new screen first has no space at the top, then it has"): the
 * library's native SafeAreaView applies the inset a frame after the screen is drawn on Android,
 * so every new page jumped down. The inset is now padding from `useSafeAreaInsets()`, which
 * expo-router seeds with the window's insets, so it is right on the first frame. Unlike the
 * native view, an edge's inset replaces (not adds to) padding a class gives that edge.
 */
export function SafeAreaView(props: ViewProps & { className?: string; edges?: readonly Edge[] }): React.ReactElement {
  const { edges = SCREEN_EDGES, style, ...rest } = props;
  const inset = useSafeAreaInsets();
  const on = (e: Edge) => edges.includes(e);
  const pad = {
    ...(on('top') ? { paddingTop: inset.top } : {}),
    ...(on('bottom') ? { paddingBottom: inset.bottom } : {}),
    ...(on('left') ? { paddingLeft: inset.left } : {}),
    ...(on('right') ? { paddingRight: inset.right } : {}),
  };
  return <View {...rest} style={[style, pad]} />;
}
