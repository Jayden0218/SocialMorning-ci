/**
 * Episode or show artwork at a fixed size (M7). An episode with no artwork gets the
 * placeholder, never a blank square (research R4).
 */
import { Image } from './lib/image';
import { Box } from './lib/box';
import type { radius } from '../design';

/** Whole class names, so Tailwind can find each one written out. */
const ROUNDED: Record<keyof typeof radius, string> = {
  row: 'rounded-row',
  artwork: 'rounded-artwork',
  pill: 'rounded-pill',
};

export function Artwork(props: { url?: string | null; size: number; rounded?: keyof typeof radius; className?: string }): React.ReactElement {
  const cls = `bg-surface ${ROUNDED[props.rounded ?? 'row']} ${props.className ?? ''}`;
  // The size is a prop, so it stays a style.
  const box = { width: props.size, height: props.size };
  if (!props.url) {
    return <Box className={cls} style={box} accessible={false} importantForAccessibility="no-hide-descendants" />;
  }
  return <Image source={{ uri: props.url }} className={cls} style={box} accessible={false} importantForAccessibility="no-hide-descendants" />;
}
