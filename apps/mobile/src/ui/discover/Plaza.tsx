// The new-shows plaza: a wall of covers dragged in any direction with one finger; tap a cover for its show.
/**
 * M21 US7 (T083). OUR OWN DESIGN (owner, 2026-10-06) — not a copy of anything in 小宇宙.
 *
 * One pan gesture (react-native-gesture-handler 3.3 `usePanGesture`) moves two shared values,
 * the content offset; letting go glides on with `withDecay`, sideways for ever (the wall repeats
 * every `WRAP` columns) and down only as far as the loaded rows. The offsets never re-render
 * React while they move: a reaction tells the screen only when the top-left CELL changes, and
 * the screen then mounts about (cols + 2) × (rows + 2) tiles (`windowCells`). Near the bottom
 * edge `onNearEnd` asks for the next page. Tapping a cover opens its show.
 */
import { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDecay } from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Artwork } from '@/ui/kit/Artwork';
import { indexAt, maxScrollY, nearBottom, rowsFor, windowCells } from '@/discover/plaza-grid';
import type { PlazaShow } from '@/discover/explore-api';

/** A cover's side and the gap after it. */
const TILE = 112;
const GAP = 10;
const PITCH = TILE + GAP;

export function PlazaWall(props: { shows: PlazaShow[]; onOpen: (show: PlazaShow) => void; onNearEnd: () => void }): React.ReactElement {
  const win = useWindowDimensions();
  const [view, setView] = useState({ width: win.width, height: win.height * 0.7 });
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const offX = useSharedValue(0);
  const offY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const rows = rowsFor(props.shows.length);
  const maxY = useSharedValue(0);
  useEffect(() => { maxY.value = maxScrollY(rows, PITCH, view.height); }, [maxY, rows, view.height]);

  const { onNearEnd } = props;
  const moved = useCallback((x: number, y: number) => {
    setOrigin({ x, y });
    if (nearBottom(y, view.height, PITCH, rows)) onNearEnd();
  }, [view.height, rows, onNearEnd]);

  // Only a change of the top-left cell reaches React, so the drag itself stays on the UI thread.
  useAnimatedReaction(
    () => [Math.floor(offX.value / PITCH), Math.floor(offY.value / PITCH)],
    (cell, prev) => {
      if (prev && cell[0] === prev[0] && cell[1] === prev[1]) return;
      runOnJS(moved)(offX.value, offY.value);
    },
    [moved],
  );

  const pan = usePanGesture({
    minDistance: 6,
    onBegin: () => {
      'worklet';
      startX.value = offX.value;
      startY.value = offY.value;
    },
    onUpdate: (e) => {
      'worklet';
      offX.value = startX.value - e.translationX;
      offY.value = Math.min(maxY.value, Math.max(0, startY.value - e.translationY));
    },
    onDeactivate: (e) => {
      'worklet';
      offX.value = withDecay({ velocity: -e.velocityX });
      offY.value = withDecay({ velocity: -e.velocityY, clamp: [0, maxY.value] });
    },
  });

  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: -offX.value }, { translateY: -offY.value }] }));
  const layout = (e: LayoutChangeEvent): void => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setView({ width, height });
  };
  const cells = windowCells(origin.x, origin.y, view, PITCH, rows);

  return (
    <GestureDetector gesture={pan}>
      <Box className="flex-1 overflow-hidden bg-background" onLayout={layout} accessibilityLabel="Wall of new shows. Drag to explore; List view lists the same shows." accessible={false}>
        <Animated.View style={moving}>
          {cells.map((cell) => {
            const i = indexAt(cell, props.shows.length);
            const s = i === undefined ? undefined : props.shows[i];
            if (!s) return null;
            const place = { position: 'absolute' as const, left: cell.col * PITCH + GAP / 2, top: cell.row * PITCH + GAP / 2, width: TILE };
            return (
              <Pressable key={`${cell.col}:${cell.row}`} onPress={() => props.onOpen(s)} accessibilityRole="button" accessibilityLabel={`Open ${s.title || 'this show'}`} style={place}>
                <Artwork url={s.imageUrl} size={TILE} rounded="row" name={s.title} />
              </Pressable>
            );
          })}
        </Animated.View>
      </Box>
    </GestureDetector>
  );
}
