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
 *
 * M31 W4-A (T050; design-pulse2 `stickers-decorate--screen`): the stage is raise with a line, radius 28 and the glow; your photo (84 in a 3 light ring), the
 * name and "preview of your profile" sit at its head, the hint "drag to move, two fingers to resize and turn" at its foot. Its height stays 0.6 of its width
 * (`ASPECT`), not the drawing's 250: a layout is saved as fractions of that box and the profile draws it the same, so another height would move everyone's stickers.
 */
import { useMemo, useRef, useState } from 'react';
import { PanResponder, type GestureResponderEvent } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Avatar } from '@/ui/kit/Avatar';
import { PageGlow } from '@/ui/kit/PageGlow';
import { Type } from '@/ui/kit/Type';
import { PROFILE, PROFILE_TYPE } from '@/ui/profile/measures';
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
      testID="sticker-stage"
      className="bg-raise border border-line overflow-hidden"
      style={{ height: width * ASPECT, borderRadius: PROFILE.stageRadius }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={props.placements.length > 0 ? `Your profile header. ${stickersSpoken(props.placements)}` : 'Your profile header, no stickers yet'}
      accessibilityHint="Use the buttons below to move, resize and turn the chosen sticker"
      {...responder.panHandlers}
    >
      <PageGlow top={-260} strength={0.4} />
      {/* The top of your profile, as others see it under the stickers (design-pulse2 `decorate`): photo 84 in a 3 light ring, the name, a mono line. Takes no touches. */}
      <Box className="items-center" style={{ pointerEvents: 'none', paddingTop: PROFILE.stageHeadTop, gap: PROFILE.photoGap - 2 }}>
        <Box className="border-text overflow-hidden items-center justify-center" style={{ width: PROFILE.stageAvatar, height: PROFILE.stageAvatar, borderRadius: PROFILE.stageAvatar / 2, borderWidth: PROFILE.photoRing }}>
          <Avatar size={PROFILE.stageAvatar - 2 * PROFILE.photoRing} url={props.avatarUrl} name={props.name} />
        </Box>
        <Type step="heading" className="text-text text-center" style={PROFILE_TYPE.stageName} numberOfLines={1}>{props.name}</Type>
        <Type step="tag" className="text-text3">preview of your profile</Type>
      </Box>
      <Type step="tag" className="text-text3 absolute text-center" style={{ left: 0, right: 0, bottom: PROFILE.hintBottom, pointerEvents: 'none' }}>drag to move, two fingers to resize and turn</Type>
      <Box className="absolute left-0 right-0 top-0 bottom-0" style={{ pointerEvents: 'none' }}>
        {width > 0 ? props.placements.map((p) => <StickerFace key={p.stickerId} placement={p} width={width} selected={p.stickerId === props.selected} />) : null}
      </Box>
    </Box>
  );
}
