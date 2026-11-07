// The time spine: a 2 px line from hot to violet to the hairline, and a node's head (a moment chip and "n reacted").
/**
 * M31 W2-B (`social.html` `spine`, `node`, `tick`): the line is 2 wide at x 40, `linear-gradient(#FF4D6D, #7A3CFF 60%,
 * #24242C)` — hot, violet at 60 %, line. A node's head is a row, 10 between its parts: a 46 column with the chip centred on
 * the spine, and "n reacted" in mono 12 (text3). The chip is the solid hot moment chip (a button that plays from there); a
 * comment with no moment gets a quiet tick in its place. On the replies page the chip is a tick with the age.
 */
import { useEffect, useState } from 'react';
import { Animated } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { LinearGradient } from '@/design/tailwind';
import { Box } from '@/ui/lib/box';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { useReducedMotion } from '@/ui/kit/useReducedMotion';
import { colour, motion } from '@/design';
import { mmss } from '@/ui/kit/format';
import { COMMENTS } from './measures';

const LINE = [colour.hot, colour.violet, colour.line] as const;
const AT = [0, 0.6, 1] as const;

export function SpineLine(): React.ReactElement {
  return (
    <LinearGradient
      colors={LINE}
      locations={AT}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      testID="spine-line"
      style={{ position: 'absolute', left: COMMENTS.spineX, top: 0, bottom: 0, width: COMMENTS.spineWidth }}
    />
  );
}

/** A small raise tick: the age on the replies page, "no moment" on a comment with none. */
export function Tick(props: { text: string }): React.ReactElement {
  return (
    <Box className="bg-raise2 border border-line" style={{ height: COMMENTS.tickHeight, paddingHorizontal: COMMENTS.tickPad, borderRadius: COMMENTS.tickRadius, justifyContent: 'center' }}>
      <Type step="tag" className="text-text2 font-semibold" style={{ lineHeight: COMMENTS.tickHeight - 2 }} numberOfLines={1}>{props.text}</Type>
    </Box>
  );
}

export function SpineNode(props: {
  momentMs: number | null;
  /** "41 reacted". */
  reacted?: number | undefined;
  /** A tick's words instead of a moment chip (the replies page). */
  tick?: string;
  onSeek?: (ms: number) => void;
  children: React.ReactNode;
}): React.ReactElement {
  const chip = props.tick !== undefined ? <Tick text={props.tick} />
    : props.momentMs !== null ? <TimestampChip text={mmss(props.momentMs)} solid {...(props.onSeek ? { onPress: () => props.onSeek?.(props.momentMs!) } : {})} />
    : <Tick text="no moment" />;
  return (
    <Box style={{ gap: COMMENTS.nodeInner }} testID="spine-node">
      <Box className="flex-row items-center" style={{ gap: COMMENTS.nodeInner }}>
        {/* The chip aligns itself to the start of its own box, so it gets one that hugs it: the column then centres that box on the spine. */}
        <Box className="items-center" style={{ width: COMMENTS.chipColumn, zIndex: 2 }}><Box>{chip}</Box></Box>
        {props.reacted !== undefined && props.reacted > 0 ? <Type step="mono" className="text-text3">{`${props.reacted} reacted`}</Type> : null}
      </Box>
      {props.children}
    </Box>
  );
}

/** Loading: the drawing's ghost rows (raise bars, breathing) in the spine area. */
export function GhostRows(props: { rows?: number }): React.ReactElement {
  const still = useReducedMotion();
  const [o] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (still) { o.setValue(1); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 0.5, duration: motion.breathe / 2, useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: motion.breathe / 2, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [still, o]);
  const widths = [100, 70, 88, 100, 60];
  return (
    <Box accessible accessibilityLabel="Loading" accessibilityLiveRegion="polite" style={{ gap: 12, paddingLeft: COMMENTS.cardIndent }} testID="ghost-rows">
      {Array.from({ length: props.rows ?? 5 }, (_, k) => (
        <Animated.View key={k} style={{ height: k % 3 === 0 ? 64 : 14, width: `${widths[k % 5]}%`, borderRadius: 12, backgroundColor: colour.raise, opacity: o }} />
      ))}
    </Box>
  );
}

/**
 * The soft glow behind the replies page's stage (`kit.js` `glow('#FF4D6D', '#7A3CFF', -260, .35)`): two radial gradients, hot at 35 %
 * across and violet at 70 %, 520 tall, 30 % wider than the screen on each side. React Native has no blur filter, so the gradient
 * fades to nothing at 70 % of its reach, as the player's backdrop does (`PlayerBackdrop`). Decoration: no word sits on it.
 */
export function StageGlow(props: { width: number; top: number }): React.ReactElement {
  const w = Math.round(props.width * 1.6);
  const h = COMMENTS.glowHeight;
  return (
    <Box className="absolute inset-0" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={w} height={h} style={{ position: 'absolute', left: -Math.round(props.width * 0.3), top: props.top, opacity: COMMENTS.glowOpacity }}>
        <Defs>
          <RadialGradient id="stageA" cx="35%" cy="50%" rx="35%" ry="50%" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={colour.hot} stopOpacity="1" />
            <Stop offset="0.7" stopColor={colour.hot} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="stageB" cx="70%" cy="40%" rx="30%" ry="40%" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={colour.violet} stopOpacity="1" />
            <Stop offset="0.7" stopColor={colour.violet} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={w} height={h} fill="url(#stageA)" />
        <Rect x="0" y="0" width={w} height={h} fill="url(#stageB)" />
      </Svg>
    </Box>
  );
}
