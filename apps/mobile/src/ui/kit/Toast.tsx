// A toast: a light pill with one line and, optionally, one action word.
/**
 * M31 T022 (design-pulse2 `kit.js` `toast`, `.toast`): 50 tall, 14 from each side, radius 16, the
 * light `text` fill with void words (Geist 500 14), 16 of padding on the left and 8 on the right.
 * The action word is Geist 700 in #b0243f (5.92 on the light fill) with 10 of padding each side, a
 * 44 pt tap area (hitSlop) and its own name. `bottom` is the distance from the screen's bottom
 * edge: `toastBottom(safe)` in src/design/tokens.ts (176 on a 34 pt inset, above the bars).
 * It is a live region (Android) and the host speaks it on iOS (`announceToast`, ToastHost.tsx).
 */
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { bars, radius } from '@/design';
import { Type } from './Type';

export function Toast(props: { text: string; action?: string; onAction?: () => void; bottom: number }): React.ReactElement {
  return (
    <Box
      testID="toast"
      accessibilityLiveRegion="polite"
      className="absolute bg-text flex-row items-center"
      style={{ left: bars.toastSide, right: bars.toastSide, bottom: props.bottom, height: bars.toast, borderRadius: radius.toast, paddingLeft: 16, paddingRight: 8, gap: 10, zIndex: 85 }}
    >
      <Type step="note" className="text-void flex-1" numberOfLines={2}>{props.text}</Type>
      {props.action && props.onAction ? (
        <Pressable onPress={props.onAction} accessibilityRole="button" accessibilityLabel={props.action} hitSlop={bars.dot * 2} style={{ paddingHorizontal: 10 }}>
          <Type step="note" className="text-toastAction font-bold">{props.action}</Type>
        </Pressable>
      ) : null}
    </Box>
  );
}
