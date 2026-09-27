/** A circular progress track around a child (the mini player's play button). See `./ring`. */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { colour } from '../design';
import { ringAngles } from './ring';

export function ProgressRing(props: { progress: number; size: number; stroke: number; children?: ReactNode }): React.ReactElement {
  const { size, stroke } = props;
  const half = size / 2;
  const { right, left } = ringAngles(props.progress);
  const circle = { width: size, height: size, borderRadius: half, borderWidth: stroke };
  // The two uncoloured sides of each half ring.
  const clear = { borderColor: 'transparent' };
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <View style={[circle, { position: 'absolute', borderColor: colour.track }]} />
      <View style={{ position: 'absolute', left: half, width: half, height: size, overflow: 'hidden' }}>
        <View style={[circle, clear, { marginLeft: -half, borderTopColor: colour.accent, borderRightColor: colour.accent, transform: [{ rotate: `${right}deg` }] }]} />
      </View>
      <View style={{ position: 'absolute', left: 0, width: half, height: size, overflow: 'hidden' }}>
        <View style={[circle, clear, { borderBottomColor: colour.accent, borderLeftColor: colour.accent, transform: [{ rotate: `${left}deg` }] }]} />
      </View>
      {props.children}
    </View>
  );
}
