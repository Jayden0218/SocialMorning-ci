// The crashed-screen page: a paused curve with a "!" in its gap, the reassurance low, and Try again at the foot.
/**
 * M31 W6-B (T071; design-pulse2 shell.html `error-boundary--screen`, "ErrorScreen-B"): Stage. The idle curve (40 bars, 120 tall, a
 * gap at 15-24) 170 down, a 52 hot disc with a "!" in the gap, "Something went wrong" in Unbounded 34 and the reassurance at 17
 * 120 up from the foot, and Try again as the full-width light pill (52) 40 up. It is drawn by app/_layout.tsx's `ErrorBoundary`,
 * which sits OUTSIDE every provider: so it reads no store, no router and no toast, only the safe-area context (null-safe) and the
 * kit's pure parts. The crash's trace is written by the boundary itself (`reportError('screen.crash')`).
 */
import { useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { bars, colour, gutter } from '@/design';
import { GapCurve } from '@/ui/kit/GapCurve';
import { PageGlow } from '@/ui/kit/PageGlow';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { CRASH, below, pausedType } from './measures';

export function ErrorScreen(props: { retry: () => void }): React.ReactElement {
  const insets = useContext(SafeAreaInsetsContext);
  const { width } = useWindowDimensions();
  const side = gutter(width);
  const top = insets?.top ?? 0;
  const foot = (insets?.bottom ?? 0) + bars.pushedGap;
  return (
    <Box className="flex-1 bg-void" testID="error-screen">
      <PageGlow tone="ember" top={CRASH.glowTop} strength={CRASH.glowStrength} />
      <Box className="absolute" style={{ left: side, right: side, top: below(top, CRASH.curveTop) }} accessible={false} importantForAccessibility="no-hide-descendants">
        <GapCurve idle count={CRASH.curveCount} height={CRASH.curveHeight} gapFrom={CRASH.gapFrom} gapTo={CRASH.gapTo} />
      </Box>
      <Box
        testID="error-disc"
        className="absolute bg-hot items-center justify-center rounded-pill"
        style={{ left: '50%', marginLeft: -CRASH.disc / 2, top: below(top, CRASH.discTop), width: CRASH.disc, height: CRASH.disc, shadowColor: colour.hot, shadowOpacity: 1, shadowRadius: 15, shadowOffset: { width: 0, height: 0 } }}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <Type step="figure" className="text-void" style={pausedType.bang}>!</Type>
      </Box>
      <Box className="absolute" style={{ left: side, right: side, bottom: foot + CRASH.wordsBottom - CRASH.buttonsBottom, gap: CRASH.wordsGap }}>
        <Type step="figure" className="text-text" accessibilityRole="header">Something went wrong</Type>
        <Type step="body" className="text-text2 font-medium" style={pausedType.line17}>This screen stopped working. Your listening and downloads are safe.</Type>
      </Box>
      <Box className="absolute" style={{ left: side, right: side, bottom: foot }}>
        <PulseButton label="Try again" kind="light" height={CRASH.button} full onPress={props.retry} />
      </Box>
    </Box>
  );
}
