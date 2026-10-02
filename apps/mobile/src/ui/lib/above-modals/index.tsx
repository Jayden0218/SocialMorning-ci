// M16a (not from gluestack): the root that lifts sheets, dialogs and toasts above native modals.
/**
 * Phone walk 2026-10-02, bug 1 (FR-001): an episode opened from Search — ⋯ did nothing.
 *
 * Cause, read from the code: gluestack draws every Actionsheet, AlertDialog and Modal through a
 * portal at <GluestackUIProvider> (`@gluestack-ui/core` overlay/aria/Portal.jsx — the items are
 * siblings of the app's root view). Search is a `transparentModal` (2026-10-01), so iOS presents
 * it in its own view controller ON TOP of that root view, and every page pushed from it rides in
 * the same presented controller. The ⋯ sheet opened — in the root view, underneath. On a page
 * pushed normally there is no presented controller, which is why it worked there.
 *
 * Fix: on iOS each overlay's root renders inside react-native-screens' `FullWindowOverlay`, which
 * puts its children straight on the key window above every presented controller (the same tool
 * the screens library ships for this). Touches pass through anywhere the overlay draws nothing
 * (RNSFullWindowOverlay.mm `pointInside:`), and React context is unchanged — only the native
 * view moves. The Search transition is untouched: Search keeps its see-through presentation,
 * Discover under it, the box moving up and Cancel reversing it. Android has no such stacking
 * (its modals are in-window), so it keeps the plain view.
 */
import React from 'react';
import { Platform, View, type ViewProps } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';

export function AboveModals(props: {
  children: React.ReactNode;
  /** VoiceOver stays inside while it is open (a sheet, a dialog); false for a toast. */
  modal?: boolean;
}): React.ReactElement {
  if (Platform.OS !== 'ios') return <>{props.children}</>;
  return <FullWindowOverlay unstable_accessibilityContainerViewIsModal={props.modal ?? true}>{props.children}</FullWindowOverlay>;
}

/** A plain View root, lifted above native modals. Passed as `Root` to the overlay creators. */
export const OverlayRoot = React.forwardRef<React.ComponentRef<typeof View>, ViewProps>(function OverlayRoot(props, ref) {
  return (
    <AboveModals>
      <View ref={ref} {...props} />
    </AboveModals>
  );
});
