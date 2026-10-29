// The fade behind a title bar, so content scrolling under it stays readable.
/**
 * M31 T022 (design-pulse2 `kit.js` `fade`, index.html §Bars): 200 tall, transparent at the top
 * and the page colour (void) from 55 % down, sitting at `bottom` above the screen's bottom edge
 * (the bars' height) and never taking a touch. Draw it under the title bar and above the content.
 */
import { LinearGradient } from '@/design/tailwind';
import { bars, colour } from '@/design';

const COLOURS = [colour.clear, colour.void, colour.void] as const;
const AT = [0, 0.55, 1] as const;

export function Fade(props: { /** Distance from the screen's bottom edge to the fade's bottom. */ bottom: number; height?: number }): React.ReactElement {
  return (
    <LinearGradient
      colors={COLOURS}
      locations={AT}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: 0, right: 0, bottom: props.bottom, height: props.height ?? bars.fade, zIndex: 15 }}
    />
  );
}
