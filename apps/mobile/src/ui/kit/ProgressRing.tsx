// A circle that fills around the mini player's play button as you listen.
/** A circular progress track around a child (the mini player's play button). See `./ring`. */
import type { ReactNode } from 'react';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { useStores } from '@/ui/shell/providers';
import { useColours } from './useColours';
import { ringAngles } from './ring';

export function ProgressRing(props: { progress: number; size: number; stroke: number; children?: ReactNode; /** M24 US20 (`Stickers-B`): the arc's token; the accent unless said. */ colour?: 'accent' | 'primary' }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const { size, stroke } = props;
  const arc = c[props.colour ?? 'accent'];
  const half = size / 2;
  const { right, left } = ringAngles(props.progress);
  const circle = { width: size, height: size, borderRadius: half, borderWidth: stroke };
  // The two uncoloured sides of each half ring.
  const clear = { borderColor: 'transparent' };
  return (
    <Box style={{ width: size, height: size }} className="items-center justify-center">
      <Box style={[circle, { position: 'absolute', borderColor: c.track }]} />
      <Box style={{ position: 'absolute', left: half, width: half, height: size, overflow: 'hidden' }}>
        <Box style={[circle, clear, { marginLeft: -half, borderTopColor: arc, borderRightColor: arc, transform: [{ rotate: `${right}deg` }] }]} />
      </Box>
      <Box style={{ position: 'absolute', left: 0, width: half, height: size, overflow: 'hidden' }}>
        <Box style={[circle, clear, { borderBottomColor: arc, borderLeftColor: arc, transform: [{ rotate: `${left}deg` }] }]} />
      </Box>
      {props.children}
    </Box>
  );
}
