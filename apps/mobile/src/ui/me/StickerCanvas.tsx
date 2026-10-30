// The sticker canvas: drag, pinch and turn your stickers on a copy of your profile header (our own design).
/**
 * M21 US9 — OUR OWN DESIGN (owner, 2026-10-06), not a copy of 小宇宙's decorate page.
 *
 * A copy of the top of your profile header (photo and name) in the same `ASPECT` box the profile
 * draws stickers in. Touch a sticker to pick it; one finger drags it; two fingers drag, pinch and
 * turn it together. The gesture is React Native's own `PanResponder` (no gesture library): the
 * canvas takes every touch (the stickers take none), finds the sticker under the first finger,
 * and hands the finger positions to `gesture()` in `src/me/sticker-layout.ts`, which does the
 * maths and is tested on its own. When the number of fingers changes, the start is taken again
 * so nothing jumps. The buttons on the decorate page do the same moves for anyone who cannot use
 * the gestures.
 */
import { useMemo, useRef, useState } from 'react';
import { PanResponder, type GestureResponderEvent } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/lib/text';
import { Avatar } from '@/ui/kit/Avatar';
import { ASPECT, gesture, hitTest, type Placement, type Point } from '@/me/sticker-layout';
import { StickerFace, stickersSpoken } from './StickerLayer';

type Start = { placement: Placement; from: Point[]; last: Placement };

const fingers = (e: GestureResponderEvent): Point[] => e.nativeEvent.touches.slice(0, 2).map((t) => ({ x: t.pageX, y: t.pageY }));

export function StickerCanvas(props: {
  placements: readonly Placement[];
  selected: string | undefined;
  onSelect: (stickerId: string | undefined) => void;
  /** Called on every move with the moved sticker's new placement. */
  onMove: (next: Placement) => void;
  name: string;
  avatarUrl?: string;
}): React.ReactElement {
  const [width, setWidth] = useState(0);
  // The responder is made once; it reads the latest props through this ref.
  const live = useRef({ props, width });
  live.current = { props, width };
  const start = useRef<Start | undefined>(undefined);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const { props: p, width: w } = live.current;
      const id = hitTest(p.placements, { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }, w);
      p.onSelect(id);
      const placement = p.placements.find((x) => x.stickerId === id);
      start.current = placement ? { placement, from: fingers(e), last: placement } : undefined;
    },
    onPanResponderMove: (e) => {
      const s = start.current;
      if (!s) return;
      const { props: p, width: w } = live.current;
      const to = fingers(e);
      // A finger added or lifted: carry on from where the sticker is, from where the fingers are now.
      if (to.length !== s.from.length) { start.current = { placement: s.last, from: to, last: s.last }; return; }
      const next = gesture(s.placement, s.from, to, w);
      s.last = next;
      p.onMove(next);
    },
    onPanResponderRelease: () => { start.current = undefined; },
    onPanResponderTerminate: () => { start.current = undefined; },
  }), []);

  return (
    <Box
      className="bg-surface border border-border rounded-row overflow-hidden"
      style={{ height: width * ASPECT }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={props.placements.length > 0 ? `Your profile header. ${stickersSpoken(props.placements)}` : 'Your profile header, no stickers yet'}
      accessibilityHint="Use the buttons below to move, resize and turn the chosen sticker"
      {...responder.panHandlers}
    >
      {/* The top of your profile, as others see it under the stickers. Takes no touches. */}
      <Box className="items-center gap-1.5 pt-section" style={{ pointerEvents: 'none' }}>
        <Avatar size={72} url={props.avatarUrl} name={props.name} className="border-2 border-surface" />
        <Text className="text-text text-hero font-display text-center" numberOfLines={1}>{props.name}</Text>
      </Box>
      <Box className="absolute left-0 right-0 top-0 bottom-0" style={{ pointerEvents: 'none' }}>
        {width > 0 ? props.placements.map((p) => <StickerFace key={p.stickerId} placement={p} width={width} selected={p.stickerId === props.selected} />) : null}
      </Box>
    </Box>
  );
}
