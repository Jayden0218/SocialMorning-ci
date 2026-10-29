// The short message that pops up near the top, then goes away.
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
 *
 * M31 T022 (design-pulse2 `toast`): the toast is Pulse's light pill (`Toast.tsx`) near the foot of
 * the screen, above the tab bar and now bar — `toastBottom(safe)`. It was M17's white pill at the
 * top (`Toast-B`). The lift follows the bars showing (`placement`, from
 * `src/ui/shell/toastPlacement.ts`): 176 over both bars, 108 over the tab bar, 112 on the player. The safe-area inset comes from the context, not `useSafeAreaInsets`, so the host
 * still draws without a provider (the toast tests).
 */
import { useContext, useEffect } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { AccessibilityInfo, Platform } from 'react-native';
import { Box } from '@/ui/lib/box';
import { AboveModals } from '@/ui/lib/above-modals';
import { toastBottom } from '@/design';
import { publishToast, useToastLayer } from '@/ui/shell/toast-context';
import { Toast } from './Toast';

/** Speak a toast on iOS; Android reads the live region itself. */
export function announceToast(message: string): void {
  if (Platform.OS !== 'ios') return;
  try { AccessibilityInfo.announceForAccessibility(message); } catch { /* no screen reader API here */ }
}

/** `placement`: which bars sit under the toast (default both, as on the tab screens); see `toastBottom`. */
export function ToastHost(props: { message: string | undefined; placement?: Parameters<typeof toastBottom>[1] }): React.ReactElement | null {
  const { message, placement } = props;
  const insets = useContext(SafeAreaInsetsContext);
  const bottom = toastBottom(insets?.bottom ?? 0, placement);
  const { sheets } = useToastLayer();
  useEffect(() => { if (message !== undefined) announceToast(message); }, [message]);
  // M31 F14: an open sheet draws the toast inside its own Modal (ActionSheet); this copy would be hidden behind it.
  useEffect(() => { publishToast(message, bottom); }, [message, bottom]);
  useEffect(() => () => publishToast(undefined, 0), []);
  if (message === undefined || sheets > 0) return null;
  return (
    <AboveModals modal={false}>
      <Box className="absolute inset-0" pointerEvents="box-none">
        <Toast text={message} bottom={bottom} />
      </Box>
    </AboveModals>
  );
}
