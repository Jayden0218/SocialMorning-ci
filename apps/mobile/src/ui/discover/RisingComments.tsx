// The comments that rise at the right edge of a Moments card, newest at the top, fading as they climb.
/**
 * M31 T025 (design-pulse2 `home--moments`: "Rising comments … as draft 4"; motion.rise = 4 s). Up to
 * three of the moment's top comments, each a glass pill (avatar 22, "name text" in Geist 500 13 on one
 * line, 240 wide at most). At rest they are at full, three-quarter and half strength. While the card's
 * preview runs, each one rises from 24 below and fades in over 4 s, one after another. Reduce Motion:
 * no rise — they are simply there. Read as one line by a screen reader ("Top comments at this moment:").
 */
import { useEffect, useState } from 'react';
import { Animated, useWindowDimensions } from 'react-native';
import { useReducedMotion } from '@/ui/kit/useReducedMotion';
import { Box } from '@/ui/lib/box';
import { colour, motion, radius, spacing } from '@/design';
import { Type } from '@/ui/kit/Type';
import { initialOf } from '@/ui/kit/Artwork';
import { avatarTone } from '@/ui/kit/Avatar';
import type { MomentComment } from '@/discover/moments-api';

/** How strong each place in the column is at rest: first full, then three-quarters, then half. */
export const REST_STRENGTH = [1, 0.75, 0.5] as const;
const RISE_FROM = 24;
const STAGGER = 1200;
const PILL_MAX = 240;
const DISC_SIZE = 22;
/** The action column on the card (icon 28, count) is about this wide. */
const RAIL = 48;
const NO_SHRINK = { flexShrink: 0 } as const;
const SHRINK = { flexShrink: 1, minWidth: 0, marginLeft: -spacing.gap + spacing.hair } as const;

export function RisingComments(props: { comments: readonly MomentComment[]; run: boolean; top: number }): React.ReactElement | null {
  // M31 F13 (widths W3): never under the 48 wide action column: the window less the column, the Play circle's 16, this column's own 16 and a 14 gap.
  const { width } = useWindowDimensions();
  const pillMax = Math.max(120, Math.min(PILL_MAX, width - RAIL - spacing.section - spacing.section - 14));
  const shown = props.comments.slice(0, REST_STRENGTH.length);
  const [values] = useState(() => REST_STRENGTH.map(() => new Animated.Value(1)));
  const still = useReducedMotion();
  useEffect(() => {
    if (!props.run || still) { values.forEach((v) => v.setValue(1)); return undefined; }
    values.forEach((v) => v.setValue(0));
    const run = Animated.stagger(STAGGER, values.slice(0, shown.length).map((v) => Animated.timing(v, { toValue: 1, duration: motion.rise, useNativeDriver: true })));
    run.start();
    return () => run.stop();
  }, [props.run, still, shown.length, values]);
  if (shown.length === 0) return null;
  const spoken = `Top comments at this moment: ${shown.map((c) => `${c.author}: ${c.text}`).join('. ')}`;
  return (
    <Box accessible accessibilityLabel={spoken} className="absolute items-end" style={{ right: spacing.section, top: props.top, gap: spacing.row - 2 }} pointerEvents="none">
      {shown.map((c, i) => {
        const v = values[i]!;
        const rest = REST_STRENGTH[i]!;
        return (
          <Animated.View
            key={c.id}
            style={{ opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, rest] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [RISE_FROM, 0] }) }], maxWidth: pillMax, backgroundColor: colour.glassDark, borderRadius: radius.row, paddingVertical: spacing.gap, paddingHorizontal: spacing.row, flexDirection: 'row', alignItems: 'center', gap: spacing.gap }}
          >
            <Box accessible={false} className="items-center justify-center" style={{ width: DISC_SIZE, height: DISC_SIZE, borderRadius: DISC_SIZE / 2, backgroundColor: avatarTone(c.author).fill }}>
              <Type step="badge" className={avatarTone(c.author).ink === 'text' ? 'text-text' : 'text-void'} numberOfLines={1}>{initialOf(c.author)}</Type>
            </Box>
            {/* The name never shrinks; the words after it are one line cut with an ellipsis (a nested
                Text let the web wrap the line). */}
            <Type step="caption" className="text-text font-bold" numberOfLines={1} style={NO_SHRINK}>{c.author}</Type>
            <Type step="caption" className="text-text" numberOfLines={1} style={SHRINK} testID="comment-words">{c.text}</Type>
          </Animated.View>
        );
      })}
    </Box>
  );
}
