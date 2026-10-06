// Opens the phone's own audio-route picker (AirPlay, Bluetooth, the speaker) from our own button.
/**
 * M21 US11 (FR-100, research R3; owner approved at G0, 2026-10-06).
 *   - iOS: `RoutePickerView` is Apple's AVRoutePickerView with clear tints (`ios/AudioRouteModule.swift`).
 *     The app lays it over its own icon, so the button looks like ours and a tap opens Apple's list.
 *   - Android: `showOutputSwitcher()` calls AndroidX MediaRouter's
 *     `SystemOutputSwitcherDialogController.showDialog`; false means the phone had nothing to show,
 *     and the app then hides its button.
 *
 * `requireOptionalNativeModule`, not `requireNativeModule`: in Jest, on the web and in a build made
 * before this module existed there is no native side, and the app simply shows no route button.
 */
import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';

type Native = {
  isAvailable(): boolean;
  /** Android only. */
  showOutputSwitcher?: () => Promise<boolean>;
};

export type RoutePickerProps = { label?: string; style?: StyleProp<ViewStyle> };

const native = (): Native | null => {
  try { return requireOptionalNativeModule<Native>('AudioRoute'); } catch { return null; }
};

/** True when this build has the native module and it says a picker exists. */
export function isAvailable(): boolean {
  const m = native();
  if (m == null) return false;
  try { return m.isAvailable() === true; } catch { return false; }
}

/** Android: opens the system output switcher. False = nothing could be shown (or no module). */
export async function showOutputSwitcher(): Promise<boolean> {
  const m = native();
  if (m == null || typeof m.showOutputSwitcher !== 'function') return false;
  try { return (await m.showOutputSwitcher()) === true; } catch { return false; }
}

let picker: ComponentType<RoutePickerProps> | null | undefined;

/** iOS: the invisible system button, or null when this build has no native view. Looked up once. */
export function routePickerView(): ComponentType<RoutePickerProps> | null {
  if (picker === undefined) {
    try { picker = native() == null ? null : requireNativeView<RoutePickerProps>('AudioRoute'); } catch { picker = null; }
  }
  return picker;
}
