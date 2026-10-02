/**
 * The app's one toast (FR-015 of M1, drawn by AppProviders). M16a T015 (FR-010, gluestack audit
 * P0): the box carried only `accessibilityLiveRegion="polite"`, which is Android-only — VoiceOver
 * never spoke a toast. iOS now gets `AccessibilityInfo.announceForAccessibility`, the same call
 * gluestack's own ToastTitle makes. The host stays here rather than moving to gluestack's Toast:
 * AppProviders sits OUTSIDE <GluestackUIProvider> (it must — the sheets need its stores), so
 * gluestack's `useToast` would throw for the 20 callers inside it.
 *
 * On iOS the box is lifted above native modals too (../lib/above-modals), so a toast raised on a
 * page opened from Search is seen — not drawn underneath it. VoiceOver is not trapped in it.
 */
import { useEffect } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { AboveModals } from './lib/above-modals';

/** Speak a toast on iOS; Android reads the live region itself. */
export function announceToast(message: string): void {
  if (Platform.OS !== 'ios') return;
  try { AccessibilityInfo.announceForAccessibility(message); } catch { /* no screen reader API here */ }
}

export function ToastHost(props: { message: string | undefined }): React.ReactElement | null {
  const { message } = props;
  useEffect(() => { if (message !== undefined) announceToast(message); }, [message]);
  if (message === undefined) return null;
  return (
    <AboveModals modal={false}>
      <Box className="absolute left-3 right-3 bottom-24 bg-surface border border-separator rounded-lg p-3" accessibilityLiveRegion="polite">
        <Text className="text-text">{message}</Text>
      </Box>
    </AboveModals>
  );
}
