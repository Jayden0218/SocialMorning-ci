// The small parts the Wallet, Tips, Gift, Redeem and Creator centre pages share: big words, a line, a caps tag, gradient words, a corner glow.
/**
 * M31 W6-A (T070 part 1; design-pulse2 `shell.html` helpers `big`, `line`, `cap`, `glowtext`, `markTile`, the Wallet hero's violet corner):
 *  - `Big`: Unbounded 800 at the drawn size (`big(text, size)`), in text.
 *  - `Line`: Geist 500 at the drawn size in text-2 (or the colour given: hot-text for an answer).
 *  - `Cap`: mono 11 in caps with 0.08 em (`cap(text, colour)`).
 *  - `GlowWords`: words in the hot-to-violet gradient (`.glowtext`) — each character a step of it, because a gradient on words needs a masked view the app does not ship.
 *  - `CornerGlow`: the violet radial glow in a tile's corner (`radial-gradient(#7A3CFF, transparent 70%)`).
 *  - `MarkTile`: the 48 tile with a mark (the load error's "!").
 * They draw nothing of their own beyond that: the pages place them.
 */
import { useId } from 'react';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { Type } from '@/ui/kit/Type';
import { mixColour } from '@/ui/kit/pulse-math';
import { STAGE_TYPE } from './measures';

type Align = 'left' | 'center';
const CENTRE = { textAlign: 'center' as const };

/** Unbounded 800 at one of the drawn sizes. */
export function Big(props: { size: keyof Pick<typeof STAGE_TYPE, 'big20' | 'big22' | 'big24' | 'big26' | 'big28' | 'big30' | 'big34' | 'big40'>; children: string; align?: Align; testID?: string; numberOfLines?: number; header?: boolean }): React.ReactElement {
  return (
    <Type step="hero" className="text-text" {...(props.header ? { accessibilityRole: 'header' as const } : {})} style={props.align === 'center' ? [STAGE_TYPE[props.size], CENTRE] : STAGE_TYPE[props.size]} testID={props.testID} numberOfLines={props.numberOfLines}>
      {props.children}
    </Type>
  );
}

/** Geist 500 in text-2 (or `hot` for an answer, `text` for a line that is the point of the card). */
export function Line(props: { size: keyof Pick<typeof STAGE_TYPE, 'line13' | 'line14' | 'line15' | 'line17'>; children: React.ReactNode; tone?: 'text2' | 'hot' | 'text' | 'text3'; align?: Align; live?: boolean; testID?: string }): React.ReactElement {
  const cls = props.tone === 'hot' ? 'text-hotText' : props.tone === 'text' ? 'text-text' : props.tone === 'text3' ? 'text-text3' : 'text-text2';
  return (
    <Type step="note" className={cls} style={props.align === 'center' ? [STAGE_TYPE[props.size], CENTRE] : STAGE_TYPE[props.size]} testID={props.testID} {...(props.live ? { accessibilityLiveRegion: 'polite' as const } : {})}>
      {props.children}
    </Type>
  );
}

/** Mono 11 caps: "Pending · not proven yet" in hot-text, "A paid series". */
export function Cap(props: { children: string; tone?: 'hot' | 'text3'; align?: Align; testID?: string }): React.ReactElement {
  return <Type step="tag" className={props.tone === 'text3' ? 'text-text3' : 'text-hotText'} style={props.align === 'center' ? [STAGE_TYPE.cap, CENTRE] : STAGE_TYPE.cap} testID={props.testID}>{props.children}</Type>;
}

/** Words in the hot-to-violet gradient; `style` is the type, `trailing` letter spacing included. */
export function GlowWords(props: { text: string; style: object; testID?: string; selectable?: boolean; accessibilityLabel?: string }): React.ReactElement {
  const chars = [...props.text];
  return (
    <Type step="hero" className="text-hotText" style={props.style} selectable={props.selectable} testID={props.testID} accessibilityLabel={props.accessibilityLabel ?? props.text}>
      {chars.map((ch, i) => <Type key={i} step="hero" className="text-hotText" style={[props.style, { color: mixColour(colour.hot, colour.hotEnd, (i + 0.5) / chars.length) }]} accessible={false}>{ch}</Type>)}
    </Type>
  );
}

/** The violet radial glow in a tile's corner: `size` wide, `opacity` strong, clipped by the tile. */
export function CornerGlow(props: { size: number; offset: number; opacity: number }): React.ReactElement {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Box testID="corner-glow" className="absolute" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{ right: props.offset, top: props.offset, width: props.size, height: props.size, opacity: props.opacity }}>
      <Svg width={props.size} height={props.size}>
        <Defs>
          <RadialGradient id={`cg${id}`} cx="50%" cy="50%" rx="50%" ry="50%" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={colour.violet} stopOpacity="1" />
            <Stop offset="0.7" stopColor={colour.violet} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={props.size} height={props.size} fill={`url(#cg${id})`} />
      </Svg>
    </Box>
  );
}

/** A 48 raise tile with one drawn mark in hot-text (the load error's "!"). */
export function MarkTile(props: { size: number; children: React.ReactNode }): React.ReactElement {
  return (
    <Box className="bg-raise border border-line items-center justify-center" accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: props.size, height: props.size, borderRadius: 22 }}>
      {props.children}
    </Box>
  );
}
