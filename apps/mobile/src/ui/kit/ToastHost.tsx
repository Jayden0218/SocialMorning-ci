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
 * M17 (`Toast-B`, checked in T106–T111): B's toast is a white pill near the top — under the
 * page's back row, clear of the mini player — with a yellow disc holding a check, then the words
 * in bold. Wave 0 had made it a dark pill at the bottom. The top inset comes from the context,
 * not `useSafeAreaInsets`, so the host still draws without a provider (the toast tests).
 */
import { useContext, useEffect } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { AccessibilityInfo, Platform, type ViewStyle } from 'react-native';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { AboveModals } from '@/ui/lib/above-modals';

/** Speak a toast on iOS; Android reads the live region itself. */
export function announceToast(message: string): void {
  if (Platform.OS !== 'ios') return;
  try { AccessibilityInfo.announceForAccessibility(message); } catch { /* no screen reader API here */ }
}

/** Below the status bar and the page's 44 pt back row (B: 104 pt on a 44 pt inset). */
const BELOW_BACK_ROW = 60;
const DISC = { width: 26, height: 26 };
/** A check drawn from two borders, on the disc. */
const CHECK: ViewStyle = { width: 7, height: 12, borderRightWidth: 2, borderBottomWidth: 2, marginTop: -3, transform: [{ rotate: '45deg' }] };

export function ToastHost(props: { message: string | undefined }): React.ReactElement | null {
  const { message } = props;
  const insets = useContext(SafeAreaInsetsContext);
  useEffect(() => { if (message !== undefined) announceToast(message); }, [message]);
  if (message === undefined) return null;
  return (
    <AboveModals modal={false}>
      {/* M17 (`Toast-B`): a white pill near the top, a yellow disc with a check, bold words. */}
      <Box className="absolute left-screen-x right-screen-x items-center" style={{ top: (insets?.top ?? 0) + BELOW_BACK_ROW }} pointerEvents="none">
        <Box className="flex-row items-center gap-[10px] bg-surface border border-border rounded-pill pl-row pr-[18px] py-row max-w-full" accessibilityLiveRegion="polite">
          <Box className="bg-primary rounded-pill items-center justify-center" style={DISC} accessible={false} importantForAccessibility="no-hide-descendants">
            <Box className="border-onPrimary" style={CHECK} />
          </Box>
          <Text className="text-text text-body font-bold shrink">{message}</Text>
        </Box>
      </Box>
    </AboveModals>
  );
}
