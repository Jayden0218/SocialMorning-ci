// A sheet from the bottom with two heights: drag its top up to grow it, down to shrink or close it.
/**
 * M21 T007 (research R7): the app's own bottom sheet with snap points. gluestack's Actionsheet
 * has one height only; the playlist sheet (US3) opens at half the screen and drags to nearly
 * full. Our own view, never a native iOS sheet (constitution v3, G-M21-11).
 *
 *  - `snapPoints` are fractions of the screen height, lowest first (default 50 % and 92 %).
 *  - A drag on the handle or the header moves the sheet; on release it settles on the nearest
 *    height, a flick counting where it was heading. Released more than `CLOSE_SLACK` under the
 *    lowest height, it closes.
 *  - The body is the caller's: a ScrollView or FlatList inside keeps its own scrolling, because
 *    the drag lives on the top only.
 *  - The backdrop, Android's back button and a screen reader's escape close it; the handle is
 *    also a button ("Make the sheet taller" / "shorter") for anyone who cannot drag.
 *  - Editorial (M24 US18, `QueueSheet-B`): the paper colour, 24 pt top corners, a 40 × 5 handle;
 *    the bottom clears the home bar with `pb-safe` (the root hands the insets to UniWind — guard
 *    G-S1).
 *
 * Built on React Native's PanResponder and Animated (as QueueList's drag and HeatScrubber):
 * Jest has no gesture-handler mocks, and the sheet's one gesture needs nothing more. Animated
 * height runs on the JS driver (height is a layout prop), so the body re-lays out as it moves.
 *
 * Draw it where it can cover the screen: at the root (src/ui/queue/QueueSheetHost.tsx) or as
 * the last child of a page.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, PanResponder, useWindowDimensions } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';

/** Half the screen, then nearly all of it (the player's top edge stays in view). */
export const SNAP_POINTS: readonly number[] = [0.5, 0.92];
/** Points under the lowest height a release must reach before the sheet closes. */
export const CLOSE_SLACK = 48;
/** How far ahead (ms) a flick's speed carries the release point. */
const FLICK_MS = 150;

const HANDLE = { minHeight: hit.min };

/** The sheet's height while dragging: where it started minus the finger's travel, kept on screen. */
export function dragHeight(start: number, dy: number, max: number): number {
  return Math.max(0, Math.min(max, start - dy));
}

/**
 * Where a released sheet goes: the index of the nearest snap height, or -1 to close. `vy` is
 * PanResponder's speed (points per ms, + = down); a flick is projected `FLICK_MS` ahead.
 */
export function settle(heights: readonly number[], current: number, vy: number): number {
  const projected = current - vy * FLICK_MS;
  if (heights.length === 0 || projected < heights[0]! - CLOSE_SLACK) return -1;
  let best = 0;
  for (let i = 1; i < heights.length; i++) {
    if (Math.abs(heights[i]! - projected) < Math.abs(heights[best]! - projected)) best = i;
  }
  return best;
}

export function Sheet(props: {
  open: boolean;
  onClose: () => void;
  /** Fractions of the screen height, lowest first. */
  snapPoints?: readonly number[];
  /** Read when the sheet opens (e.g. "Playlist"). */
  label: string;
  /** Under the handle; dragging it moves the sheet like the handle. */
  header?: React.ReactNode;
  /** Pinned under the body, above the home bar. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
}): React.ReactElement | null {
  const { height: screen } = useWindowDimensions();
  const points = props.snapPoints ?? SNAP_POINTS;
  const heights = useMemo(() => points.map((p) => Math.round(screen * p)), [points, screen]);
  const [shown, setShown] = useState(props.open);
  const [index, setIndex] = useState(0);
  const height = useRef(new Animated.Value(0)).current;

  // The handlers are made once; they read the latest values through refs.
  const live = useRef({ heights, onClose: props.onClose, start: 0 });
  live.current.heights = heights;
  live.current.onClose = props.onClose;

  const snapTo = (i: number) => {
    setIndex(i);
    Animated.spring(height, { toValue: live.current.heights[i] ?? 0, useNativeDriver: false, bounciness: 0, speed: 16 }).start();
  };
  const snapRef = useRef(snapTo);
  snapRef.current = snapTo;

  useEffect(() => {
    if (props.open) {
      setShown(true);
      snapRef.current(0);
      return;
    }
    Animated.timing(height, { toValue: 0, duration: 180, useNativeDriver: false }).start(({ finished }) => { if (finished) setShown(false); });
  }, [props.open, height]);

  // Android's back button closes the sheet, not the page under it.
  useEffect(() => {
    if (!props.open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { live.current.onClose(); return true; });
    return () => sub.remove();
  }, [props.open]);

  const pan = useMemo(() => PanResponder.create({
    // A tap on the handle or a header button stays a tap; a vertical move becomes the drag.
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => { height.stopAnimation((v) => { live.current.start = v; }); },
    onPanResponderMove: (_e, g) => {
      const hs = live.current.heights;
      height.setValue(dragHeight(live.current.start, g.dy, hs[hs.length - 1] ?? 0));
    },
    onPanResponderRelease: (_e, g) => {
      const to = settle(live.current.heights, dragHeight(live.current.start, g.dy, Number.MAX_SAFE_INTEGER), g.vy);
      if (to < 0) live.current.onClose(); else snapRef.current(to);
    },
    onPanResponderTerminate: () => snapRef.current(0),
    onPanResponderTerminationRequest: () => false,
  }), [height]);

  if (!shown) return null;
  const tallest = index >= heights.length - 1;
  return (
    <Box className="absolute inset-0 justify-end" pointerEvents={props.open ? 'box-none' : 'none'}>
      <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Close" className="absolute inset-0 bg-scrim" />
      <Animated.View
        className="bg-background rounded-t-sheet pb-safe overflow-hidden"
        style={{ height }}
        accessibilityViewIsModal
        accessibilityLabel={props.label}
        onAccessibilityEscape={props.onClose}
      >
        <Box {...pan.panHandlers}>
          <Pressable
            onPress={() => snapTo(tallest ? 0 : heights.length - 1)}
            accessibilityRole="button"
            accessibilityLabel={tallest ? 'Make the sheet shorter' : 'Make the sheet taller'}
            className="items-center justify-center"
            style={HANDLE}
          >
            <Box className="w-10 h-[5px] bg-handle rounded-pill" />
          </Pressable>
          {props.header}
        </Box>
        <Box className="flex-1">{props.children}</Box>
        {props.footer}
      </Animated.View>
    </Box>
  );
}
