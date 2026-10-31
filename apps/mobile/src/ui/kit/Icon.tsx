// Simple drawn icons (play, pause, arrows) and the one font icon helper.
/**
 * The few icons the show, episode and player pages draw (owner's reference, 2026-09-27).
 * Drawn with views, like the search page's box and QR square. Every one is decoration —
 * the Pressable around it carries the name. `Icon` at the end is the one font icon.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Text } from '@/ui/kit/Text';
import { Box } from '@/ui/lib/box';
import { SvgXml } from 'react-native-svg';
import type { Colour } from '@/design';
import { DRAWN_ICONS, drawnIconXml, type DrawnOnlyName } from './drawn-icons';

/**
 * M10b: the fills are token classes, so they follow the accent theme. Static strings —
 * UniWind compiles only class names it can see in the source.
 */
const BG: Partial<Record<Colour, string>> = { text: 'bg-text', muted: 'bg-muted', accent: 'bg-accent', onPrimary: 'bg-onPrimary', void: 'bg-void', text2: 'bg-text2', hotText: 'bg-hotText' };
const BORDER_L: Partial<Record<Colour, string>> = { text: 'border-l-text', muted: 'border-l-muted', accent: 'border-l-accent', onPrimary: 'border-l-onPrimary', playGlyph: 'border-l-playGlyph', void: 'border-l-void', text2: 'border-l-text2', hotText: 'border-l-hotText' };

const HIDE = { accessible: false, importantForAccessibility: 'no-hide-descendants' as const };

/** A solid triangle pointing right. The border trick: only the left border has a colour. */
export function PlayIcon(props: { size: number; tint?: Colour }): React.ReactElement {
  const h = props.size / 2;
  return (
    <Box
      {...HIDE}
      className={BORDER_L[props.tint ?? 'text'] ?? 'border-l-text'}
      style={{
        width: 0, height: 0, marginLeft: props.size * 0.15,
        borderTopWidth: h, borderBottomWidth: h, borderLeftWidth: props.size * 0.85,
        borderTopColor: 'transparent', borderBottomColor: 'transparent',
      }}
    />
  );
}

/** Two upright bars. */
export function PauseIcon(props: { size: number; tint?: Colour }): React.ReactElement {
  const bar = { width: props.size * 0.3, height: props.size, borderRadius: 2 };
  const fill = BG[props.tint ?? 'text'] ?? 'bg-text';
  return (
    <Box {...HIDE} className="flex-row" style={{ gap: props.size * 0.25 }}>
      <Box className={fill} style={bar} />
      <Box className={fill} style={bar} />
    </Box>
  );
}

/** An open chevron: two sides of a square, turned. */
export function Chevron(props: { dir: 'left' | 'right' | 'down'; size?: number }): React.ReactElement {
  const s = props.size ?? 12;
  const turn = { left: '135deg', right: '-45deg', down: '45deg' }[props.dir];
  return (
    <Box {...HIDE} className="border-text" style={{ width: s, height: s, borderRightWidth: 2, borderBottomWidth: 2, transform: [{ rotate: turn }] }} />
  );
}

/** A magnifier: a ring and a short handle. */
export function SearchIcon(): React.ReactElement {
  return (
    <Box {...HIDE} className="w-6 h-6">
      <Box className="w-[18px] h-[18px] rounded-pill border-2 border-text" />
      <Box className="absolute bg-text" style={{ width: 8, height: 2, right: 0, bottom: 3, transform: [{ rotate: '45deg' }] }} />
    </Box>
  );
}

/** Three dots in a row ("more"). */
export function Dots(): React.ReactElement {
  return (
    <Box {...HIDE} className="flex-row gap-hair">
      {[0, 1, 2].map((i) => <Box key={i} className="w-1 h-1 rounded-pill bg-text" />)}
    </Box>
  );
}

/** A plain glyph at icon size, for the shapes a font already draws well (← ↗ ♡). */
export function Glyph(props: { children: string; className?: string }): React.ReactElement {
  return <Text {...HIDE} className={`text-text text-lg ${props.className ?? ''}`}>{props.children}</Text>;
}

/**
 * A font icon, for the tab bar and the mini player (owner's reference, 2026-09-27):
 * Ionicons from `@expo/vector-icons` (MIT). A font, so no new native module — `expo-font`
 * is already in every build. Decoration, like the rest of this file.
 */
export type IconName = ComponentProps<typeof Ionicons>['name'] | DrawnOnlyName;

/**
 * M31 round 3: the names the drawing has its own shape for (`drawn-icons.ts`) are drawn as that shape, in `color`, `size` wide;
 * every other name is the Ionicons font glyph, as before. Callers do not change.
 */
/** A positioned box, so a drawn icon paints above a sibling `BlurView` (an absolutely placed layer paints over plain in-flow content on the web). */
const STACK = { position: 'relative' } as const;

export function Icon(props: { name: IconName; size: number; color: string }): React.ReactElement {
  const shape = DRAWN_ICONS[props.name];
  if (shape !== undefined) {
    return <SvgXml testID={`icon-${props.name}`} xml={drawnIconXml(shape, props.color)} width={props.size} height={props.size} style={STACK} {...HIDE} />;
  }
  return <Ionicons name={props.name as ComponentProps<typeof Ionicons>['name']} size={props.size} color={props.color} {...HIDE} />;
}
