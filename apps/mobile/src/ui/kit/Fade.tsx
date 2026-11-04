// The fade behind a title bar, so content scrolling under it stays readable.
/**
 * M31 T022 (design-pulse2 `kit.js` `fade`, index.html §Bars): 200 tall, transparent at the top
 * and the page colour (void) from 55 % down, sitting at `bottom` above the screen's bottom edge
 * (the bars' height) and never taking a touch. Draw it under the title bar and above the content.
 * 037: with `top` it hangs from the screen's top edge instead (solid at the edge, clear at its foot), under a title at the top.
 */
import { LinearGradient } from '@/design/tailwind';
import { bars, colour } from '@/design';

const COLOURS = [colour.clear, colour.void, colour.void] as const;
const AT = [0, 0.55, 1] as const;
const COLOURS_TOP = [colour.void, colour.void, colour.clear] as const;
const AT_TOP = [0, 0.45, 1] as const;

export function Fade(props: { /** Distance from the screen's bottom edge to the fade's bottom. */ bottom?: number; /** 037: distance from the screen's top edge; the fade then runs down from there. */ top?: number; height?: number }): React.ReactElement {
  const fromTop = props.top !== undefined;
  return (
    <LinearGradient
      colors={fromTop ? COLOURS_TOP : COLOURS}
      locations={fromTop ? AT_TOP : AT}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: 0, right: 0, ...(fromTop ? { top: props.top } : { bottom: props.bottom ?? 0 }), height: props.height ?? bars.fade, zIndex: 15 }}
    />
  );
}

/** How far the top fade runs past the content start, so a row passing under the title block is gone before it is read. */
export function topFade(contentTop: number): number {
  return contentTop + bars.sheetGap + bars.titleSub;
}
