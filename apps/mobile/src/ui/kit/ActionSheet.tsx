// The one bottom sheet: a grabber, an optional title and close, then the caller's content.
/**
 * M31 T022 (design-pulse2 `kit.js` `sheet`, `.sheet`; review D6): every sheet in the app is this
 * one, so hand-built Actionsheets can move onto it screen by screen. Drawn: raise2 fill, 32 pt
 * top corners, 20 pt side padding, a 36 × 5 grabber (white at 20 %), the title in Unbounded 700 20
 * with a 36 raise "close" circle on its right, the content 14 apart, 60 % black scrim behind.
 * It is a native modal, so it covers the whole screen from wherever it is mounted (a caller can
 * put it anywhere in a page) and sits above other modals.
 *
 * Behaviour: tapping the scrim, the Back button (Android), a drag down on the grabber, or a screen
 * reader's escape gesture closes it. It slides up over 360 ms (motion.sheet, ease-out to
 * approximate the drawn spring 0.9) — with Reduce Motion it only fades. `snapPoints` (fractions
 * of the screen height, lowest first) hands over to the two-height `Sheet` for lists that need to
 * drag taller; it is drawn with the same fill, corners and grabber.
 */
import { useContext, useEffect, useMemo, useState } from 'react';
import { useLatest } from './useLatest';
import { Animated, Easing, Modal, PanResponder, Platform, useWindowDimensions } from 'react-native';
import { KeyboardAvoidingView } from '@/ui/lib/keyboard-avoiding-view';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { bars, colour, motion, radius, spacing } from '@/design';
import { IconButton } from './PulseButton';
import { registerSheet, useToastLayer } from '@/ui/shell/toast-context';
import { Sheet } from './Sheet';
import { Toast } from './Toast';
import { Type } from './Type';
import { useReducedMotion } from './useReducedMotion';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

/** How far (points) or how fast (points per ms) a drag down must go to close the sheet. */
export const CLOSE_DRAG = 80;
export const CLOSE_FLICK = 0.6;

/** Whether a release at `dy` points (finger travel) and `vy` speed closes the sheet. */
export function closesOnRelease(dy: number, vy: number): boolean {
  return dy > CLOSE_DRAG || vy > CLOSE_FLICK;
}

/** A locked sheet's Back (Android needs a handler on a Modal). */
const NOTHING = (): void => undefined;
const GRAB = { width: bars.sheetGrab, height: bars.dot };
/** 8 (the sheet's top padding) + 5 + 31 = 44 tall; 20 more each side of the 36 wide grabber. Exported for the guard. */
export const GRAB_SLOP = { top: spacing.gap, bottom: 31, left: 20, right: 20 } as const;

export function ActionSheet(props: {
  open: boolean;
  onClose: () => void;
  /** Read when the sheet opens. */
  label: string;
  /** Shown in the title row, with the close circle. Without one there is no title row. */
  title?: string;
  /** Fractions of the screen height: hands over to the two-height `Sheet`. */
  snapPoints?: readonly number[];
  /** The sheet holds a text box: it lifts above the keyboard (M31 W2-B: the composer and report sheets). */
  keyboard?: boolean;
  /** M31 S-C (design-pulse2 `pending-deletion--sheet`: "cannot be swiped away — no close, no backdrop tap"): the scrim, the grabber's drag, Back and the escape gesture do nothing; only the sheet's own buttons leave it. */
  locked?: boolean;
  children?: React.ReactNode;
}): React.ReactElement | null {
  if (props.snapPoints) {
    return (
      <Sheet open={props.open} onClose={props.onClose} label={props.label} snapPoints={props.snapPoints}>
        {props.children}
      </Sheet>
    );
  }
  return <Content {...props} />;
}

function Content(props: { open: boolean; onClose: () => void; label: string; title?: string; keyboard?: boolean; locked?: boolean; children?: React.ReactNode }): React.ReactElement | null {
  const { height: screen } = useWindowDimensions();
  const insets = useContext(SafeAreaInsetsContext);
  const still = useReducedMotion();
  const [mounted, setMounted] = useState(props.open);
  const [rise] = useState(() => new Animated.Value(props.open ? 0 : 1));
  const [drag] = useState(() => new Animated.Value(0));
  const locked = props.locked === true;
  const [sheetH, setSheetH] = useState(0);
  const { message: toastText, bottom: toastAt } = useToastLayer();
  useEffect(() => (mounted ? registerSheet() : undefined), [mounted]);
  const closeNow = useLatest(locked ? () => undefined : props.onClose);
  // Opening mounts the sheet in the same render.
  if (props.open && !mounted) setMounted(true);
  useEffect(() => {
    if (props.open) {
      drag.setValue(0);
      rise.setValue(1);
      Animated.timing(rise, { toValue: 0, duration: still ? motion.tap : motion.sheet, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      return;
    }
    Animated.timing(rise, { toValue: 1, duration: still ? motion.tap : motion.move, useNativeDriver: true }).start(({ finished }) => { if (finished) setMounted(false); });
  }, [props.open, still, rise, drag]);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !locked,
    onMoveShouldSetPanResponder: (_e, g) => !locked && Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_e, g) => drag.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_e, g) => {
      if (closesOnRelease(g.dy, g.vy)) closeNow()();
      else Animated.timing(drag, { toValue: 0, duration: motion.move, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => drag.setValue(0),
  }), [drag, locked, closeNow]);
  if (!mounted) return null;
  // Reduce Motion: fade only — no travel.
  const travel = still ? 0 : screen;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={locked ? NOTHING : props.onClose}>
      <Wrap keyboard={props.keyboard === true}>
        <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: rise.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>
          <Pressable onPress={locked ? undefined : props.onClose} disabled={locked} accessibilityRole="button" accessibilityLabel="Close" accessibilityElementsHidden={locked} importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'} className="absolute inset-0 bg-scrim" />
        </Animated.View>
        <Animated.View
          testID="action-sheet"
          onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
          accessibilityViewIsModal
          accessibilityLabel={props.label}
          onAccessibilityEscape={locked ? undefined : props.onClose}
          style={{
            backgroundColor: colour.raise2,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            paddingTop: spacing.gap,
            paddingHorizontal: spacing.screenX,
            paddingBottom: (insets?.bottom ?? 0) + spacing.gap + 2,
            gap: bars.sheetGap,
            opacity: still ? rise.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) : 1,
            transform: [{ translateY: Animated.add(drag, rise.interpolate({ inputRange: [0, 1], outputRange: [0, travel] })) }],
          }}
        >
          {/* Drawn 5 tall with a 14 gap under it (design-pulse2 `.grab` + `.sheet` gap): the touch target is
              the hitSlop (8 above + 5 + 31 below = 44, 76 wide), not a taller box that pushes the content down. */}
          <Box testID="action-sheet-grab-zone" {...pan.panHandlers} hitSlop={GRAB_SLOP} className="items-center justify-center" style={{ height: bars.dot }}>
            <Box testID="action-sheet-grab" className="rounded-pill bg-grab" style={GRAB} />
          </Box>
          {props.title ? (
            <Box className="flex-row items-center justify-between">
              <Type step="heading" className="text-text flex-1" accessibilityRole="header" numberOfLines={2}>{props.title}</Type>
              <IconButton icon="close" label="Close" onPress={props.onClose} fill size={18} diameter={bars.sheetClose} className="ml-gap" />
            </Box>
          ) : null}
          {props.children}
        </Animated.View>
        {/* M31 F14: a toast raised while this sheet is open is drawn here, above the sheet's top edge (the root host hides its copy). */}
        {toastText !== undefined ? <Toast text={toastText} bottom={Math.max(toastAt, sheetH + spacing.gap)} /> : null}
      </Wrap>
    </Modal>
  );
}

/** The modal's frame: the sheet at the foot; with a text box inside, lifted by the keyboard. */
function Wrap(props: { keyboard: boolean; children: React.ReactNode }): React.ReactElement {
  if (!props.keyboard) return <Box className="flex-1 justify-end">{props.children}</Box>;
  return <KeyboardAvoidingView className="flex-1 justify-end" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>{props.children}</KeyboardAvoidingView>;
}
