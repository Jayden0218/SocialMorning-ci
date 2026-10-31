// A section's name, written vertically along the page's left edge.
/**
 * M31 T022 (layout rule 3, design-pulse2 `.edge`): sections are named by a vertical label on the
 * left edge — Unbounded 700 11, letter-spaced 0.24 em, uppercase, text3 (5.81 on void) — read
 * bottom to top, instead of a heading row. Content starts 28 from the left so the label has its
 * own lane. The label is still the section's heading for a screen reader.
 *
 * It is drawn by turning a horizontal Text -90°. Layout does not see a turn, so the label is
 * measured first and the box it takes up is the turned size: the lane wide (the label's own line
 * height), the text's length tall.
 *
 * The measuring is done on an UNCONSTRAINED copy (M31 L7, the owner saw "T·" for "TODAY'S PICK"):
 * an absolutely placed Text inside a 14-wide box is itself laid out no wider than 14, so measuring
 * the visible Text read 14 back and the label was cut to its first letter. The copy sits in a row
 * as wide as a label can be (`MEASURE_ROOM`), placed off the left edge so it never adds scroll width, invisible and hidden from a screen reader, so its
 * width is the text's own; the visible Text is then given exactly that width — and the same as `maxWidth`: on the web build the
 * Text carries a `max-width: 100%` class, which clamped it to the 14 wide box and showed only "T" there (found by the wave-1 capture).
 */
import { useState } from 'react';
import { Type } from './Type';
import { Box } from '@/ui/lib/box';
import { typeScale } from '@/design';

const LANE = typeScale.edge.lineSafe;
const TURN = [{ rotate: '-90deg' as const }];
/** Wider than any label can be, so the copy is never squeezed. */
export const MEASURE_ROOM = 2000;
const TRACK = { letterSpacing: typeScale.edge.tracking };
/** The measured width is rounded down (127.25 → 127) and the web ellipsises a line that is a quarter pixel too long; this much room stops it. */
export const SLACK = 2;

export function EdgeLabel(props: { label: string; /** What a screen reader says, when the drawn label is a short form of the section's name ("Shows" for "Shows picked for you"). */ spoken?: string; /** Distance from the top of its container. */ top?: number; left?: number; /** The turned label's length once measured, so its section can be at least that tall (a short section otherwise lets two labels collide). */ onLength?: (len: number) => void }): React.ReactElement {
  const [len, setLen] = useState(0);
  const text = props.label.toUpperCase();
  return (
    <Box
      accessible
      accessibilityRole="header"
      accessibilityLabel={props.spoken ?? props.label}
      className="absolute"
      style={{ left: props.left ?? 6, top: props.top ?? 0, width: LANE, height: len }}
    >
      {/* The unconstrained copy: invisible, takes no touch, no screen reader. */}
      <Box testID="edge-measure" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" className="absolute flex-row" style={{ left: -MEASURE_ROOM, top: 0, width: MEASURE_ROOM, opacity: 0 }}>
        <Type step="edge" className="text-text3" style={TRACK} onLayout={(e) => { const w = Math.ceil(e.nativeEvent.layout.width); setLen(w); props.onLength?.(w); }}>
          {text}
        </Type>
      </Box>
      <Type
        step="edge"
        className="text-text3 absolute"
        numberOfLines={1}
        // Unturned it sits at the left; turned about its centre it needs to be moved to the lane.
        style={{ left: (LANE - len) / 2, top: (len - typeScale.edge.lineSafe) / 2, width: len > 0 ? len + SLACK : undefined, maxWidth: len > 0 ? len + SLACK : undefined, opacity: len > 0 ? 1 : 0, transform: TURN, ...TRACK }}
      >
        {text}
      </Type>
    </Box>
  );
}
