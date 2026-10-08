// The mini player's progress ring: a strong yellow arc on a light grey track around play/pause.
/**
 * M24 US19 (`Home-B` mini player; the iPhone showed no ring): the kit `ProgressRing` draws a thin
 * accent (brown) arc, and the button under it was a filled pale disc of the same size, so at the
 * start of an episode the ring could not be seen. B draws no fill: a 3 pt arc in the fixed `play`
 * yellow (never the accent theme) on the 10 % track, the dark glyph inside. Same two-half-ring trick as the kit ring
 * (`ringAngles`, no SVG); only the colours differ, so the kit part stays as it is.
 */
import type { ReactNode } from 'react';
import { Box } from '@/ui/lib/box';
import { ringAngles } from '@/ui/kit/ring';
import { useColours } from '@/ui/kit/useColours';

export function PlayRing(props: { progress: number; size: number; stroke: number; children?: ReactNode }): React.ReactElement {
  const c = useColours();
  const { size, stroke } = props;
  const half = size / 2;
  const { right, left } = ringAngles(props.progress);
  const circle = { width: size, height: size, borderRadius: half, borderWidth: stroke };
  const clear = { borderColor: 'transparent' };
  return (
    <Box style={{ width: size, height: size }} className="items-center justify-center">
      <Box style={[circle, { position: 'absolute', borderColor: c.track }]} />
      <Box style={{ position: 'absolute', left: half, width: half, height: size, overflow: 'hidden' }}>
        <Box style={[circle, clear, { marginLeft: -half, borderTopColor: c.play, borderRightColor: c.play, transform: [{ rotate: `${right}deg` }] }]} />
      </Box>
      <Box style={{ position: 'absolute', left: 0, width: half, height: size, overflow: 'hidden' }}>
        <Box style={[circle, clear, { borderBottomColor: c.play, borderLeftColor: c.play, transform: [{ rotate: `${left}deg` }] }]} />
      </Box>
      {props.children}
    </Box>
  );
}
