// A centred dialog: a title, a line, and one or two buttons.
/**
 * M31 T022 (design-pulse2 `kit.js` `dialog`, `.dialog`): raise2 fill, 28 radius, a 1 px line, 28 from
 * each side, 22 of padding, 12 between parts, a 60 % black scrim. The title is Unbounded 700 20
 * (Heading), the line Geist 400 15/22 in text2, the buttons 48 tall, side by side and equally wide
 * (stacked when there are three or more) — `quiet` for Cancel, `light` for the action, `hot` for a
 * destructive one ("Delete"; the word tells it apart, never the colour alone).
 * A native modal: it covers the screen from wherever it is mounted. The scrim, Back (Android) and a
 * screen reader's escape call `onClose`; it fades in over 240 ms (at once with Reduce Motion).
 */
import { useEffect, useState } from 'react';
import { Animated, Modal } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { bars, colour, motion, radius, spacing } from '@/design';
import { PulseButton, type PulseButtonKind } from './PulseButton';
import { Type } from './Type';
import { useReducedMotion } from './useReducedMotion';

export type DialogButton = { label: string; kind?: PulseButtonKind; onPress: () => void; busy?: boolean };

export function Dialog(props: {
  open: boolean;
  title: string;
  body?: string;
  /** Left to right; the last is the action. */
  buttons: readonly DialogButton[];
  /** Scrim, Back and escape. */
  onClose: () => void;
}): React.ReactElement | null {
  const still = useReducedMotion();
  const [fade] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!props.open) return;
    if (still) { fade.setValue(1); return; }
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: motion.move, useNativeDriver: true }).start();
  }, [props.open, still, fade]);
  if (!props.open) return null;
  const stacked = props.buttons.length > 2;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={props.onClose}>
      <Animated.View style={{ flex: 1, justifyContent: 'center', opacity: fade }}>
        <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Close" className="absolute inset-0 bg-scrim" />
        <Box
          testID="dialog"
          accessibilityViewIsModal
          accessibilityLabel={props.title}
          onAccessibilityEscape={props.onClose}
          className="border border-line"
          style={{ marginHorizontal: bars.dialogSide, padding: bars.dialogPad, gap: spacing.row, borderRadius: radius.dialog, backgroundColor: colour.raise2 }}
        >
          <Type step="heading" className="text-text" accessibilityRole="header">{props.title}</Type>
          {props.body ? <Type step="body" className="text-text2">{props.body}</Type> : null}
          <Box className={stacked ? 'gap-gap' : 'flex-row gap-row'} style={{ marginTop: 6 }}>
            {props.buttons.map((b) => (
              <Box key={b.label} className={stacked ? '' : 'flex-1'}>
                <PulseButton label={b.label} kind={b.kind ?? 'quiet'} onPress={b.onPress} busy={b.busy === true} full />
              </Box>
            ))}
          </Box>
        </Box>
      </Animated.View>
    </Modal>
  );
}
