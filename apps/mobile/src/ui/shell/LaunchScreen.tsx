// Full-screen promotion picture for up to 3 seconds at start, with Skip.
/**
 * M15 US3 (FR-015–FR-018): the owner's promotion, full screen, for at most 3 s after the
 * native launch screen hides. Mounted by `src/ui/shell/providers.tsx` beside the Terms overlay,
 * only when `decideLaunch` found an image already on the phone.
 *
 * M31 T023 (design-pulse2 `index.html#launch--promotion`, Stage): the image fills the screen; a
 * gradient darkens the top 22 % and the bottom 40 % so the words read. Skip is a 44 glass pill
 * top right (16 from the edge, 10 under the status bar; a 15 % line) with a 32 countdown ring (the hot arc
 * empties over the 3 s, the seconds in mono inside); the app mark (30, 14 under the status bar) and the name
 * (Unbounded 15) sit top left; the label ("Promotion" by default, always
 * visible) in mono over "Open →" in hot words sits at the bottom.
 *
 * - **Skip is first** in the tree, so a screen reader announces it first, with the hint
 *   "Closes in n seconds" (FR-018). The mark is hidden from screen readers.
 * - A 3-2-1 countdown; at 0 it closes by itself. With Reduce Motion on there is no fade —
 *   it simply goes (FR-018); otherwise a 200 ms fade that still ends by 3 s.
 * - A tap on the image, or on the label / Open, opens its target (`onTap`) and closes.
 *
 * The 3 s start when `started` turns true (the splash has hidden), not at mount: until then
 * the native launch screen covers it. The ring steps once a second, with the number.
 */
import { useContext, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Box } from '@/ui/lib/box';
import { Image } from '@/ui/lib/image';
import { Pressable } from '@/ui/lib/pressable';
import { colour, spacing } from '@/design';
import { LinearGradient } from '@/design/tailwind';
import { LAUNCH_MAX_MS, type Promotion } from '@/launch/choose';
import { Type } from '@/ui/kit/Type';
import { useReducedMotion } from '@/ui/kit/useReducedMotion';
import { SafeAreaInsetsContext, initialWindowMetrics } from 'react-native-safe-area-context';
import { drawnType } from '@/design/type-px';

const FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;
/** The app's own mark, as the native splash and the sign-in page show it. */
const MARK = require('../../../assets/app-icon.png');
const MARK_SIZE = 30;
/** The fade at the end, inside the 3 s (the drawing: 200 ms). */
export const LAUNCH_FADE_MS = 200;
/** The scrim: void at 55 % (8c) at the top, clear by 22 % and to 60 %, then void at 90 % (e6) at the foot. */
const SCRIM = [`${colour.void}8c`, colour.clear, colour.clear, `${colour.void}e6`] as const;
const SCRIM_AT = [0, 0.22, 0.6, 1] as const;
/** The countdown ring: 32 round, stroke 3, r 14 (drawing). */
const RING = 32;
const R = 14;
const CIRC = 2 * Math.PI * R;
const SECONDS = Math.ceil(LAUNCH_MAX_MS / 1000);
/** "PROMOTION": mono 11, 0.1 em, capitals. */
const MONO_CAPS = { ...drawnType.trackMono, textTransform: 'uppercase' as const };
/** "Open →" is drawn on a 15 line (`font:600 15px/1`); the safe 20 line is trimmed 2.5 above and below, so the label block is the drawn 40 tall and its words sit where drawn. */
export const OPEN_LINE = { marginVertical: -2.5 } as const;
const SKIP_HEIGHT = 44;
const SKIP_DROP = 10;
const SKIP_RIGHT = 16;
const MARK_DROP = 14;
const SKIP_SLOP = { top: 2, bottom: 2, left: 2, right: 2 };
const LABEL_SLOP = { top: 12, bottom: 12, left: 0, right: 0 };

export function LaunchScreen(props: {
  promotion: Pick<Promotion, 'id' | 'label'>;
  uri: string;
  started: boolean;
  /** Once, when it is first seen (the impression). */
  onShown: () => void;
  onTap: () => void;
  onDone: () => void;
}): React.ReactElement {
  const { started, onShown, onDone } = props;
  const [left, setLeft] = useState(SECONDS);
  const reduce = useReducedMotion();
  const still = useRef(reduce);
  still.current = reduce;
  // The context (not the hook): a test or the first frame has none, and 0 is a fine answer.
  const insets = useContext(SafeAreaInsetsContext) ?? initialWindowMetrics?.insets ?? { top: 0 };
  const opacity = useRef(new Animated.Value(1)).current;
  const finished = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;
  const finish = (): void => {
    if (finished.current) return;
    finished.current = true;
    done.current();
  };

  useEffect(() => {
    if (!started) return;
    onShown();
    const tick = setInterval(() => setLeft((n) => Math.max(1, n - 1)), 1_000);
    const end = setTimeout(() => {
      if (still.current) { finish(); return; }
      Animated.timing(opacity, { toValue: 0, duration: LAUNCH_FADE_MS, useNativeDriver: true }).start(() => finish());
    }, LAUNCH_MAX_MS - LAUNCH_FADE_MS);
    // The ceiling, whatever the animation does.
    const ceiling = setTimeout(finish, LAUNCH_MAX_MS);
    return () => { clearInterval(tick); clearTimeout(end); clearTimeout(ceiling); };
    // `onShown` is called once per start; a new function identity must not restart the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const open = (): void => { props.onTap(); finish(); };
  const gone = (CIRC * (SECONDS - left)) / SECONDS;

  return (
    <Animated.View style={[FILL, { opacity }]} className="bg-void">
      {/* The picture is the tap target for sight; a screen reader skips it and reaches the same
          link at the bottom. */}
      <Pressable
        onPress={open}
        accessibilityLabel={`${props.promotion.label} image`}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={FILL}
      >
        <Image source={{ uri: props.uri }} style={FILL} resizeMode="cover" accessibilityIgnoresInvertColors />
      </Pressable>
      <LinearGradient colors={SCRIM} locations={SCRIM_AT} pointerEvents="none" accessible={false} style={FILL} />
      {/* Skip first: the first thing a screen reader reaches (FR-018). The mark beside it is
          decoration and hidden, so nothing is read before Skip. Drawn: Skip 16 from the right and 10
          under the status bar, the mark 20 from the left and 14 under it. */}
      <Pressable
        onPress={finish}
        accessibilityRole="button"
        accessibilityLabel="Skip"
        accessibilityHint={`Closes in ${left} seconds`}
        hitSlop={SKIP_SLOP}
        className="absolute flex-row items-center rounded-pill border border-glassEdge"
        style={{ top: insets.top + SKIP_DROP, right: SKIP_RIGHT, height: SKIP_HEIGHT, paddingLeft: 16, paddingRight: 6, gap: spacing.row - 2, backgroundColor: colour.glassDark }}
      >
        <Type step="row" className="text-text">Skip</Type>
        <Box style={{ width: RING, height: RING }} className="items-center justify-center">
          <Svg width={RING} height={RING} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
            <Circle cx={RING / 2} cy={RING / 2} r={R} fill="none" stroke={colour.grab} strokeWidth={3} />
            <Circle
              cx={RING / 2} cy={RING / 2} r={R} fill="none" stroke={colour.hot} strokeWidth={3}
              strokeDasharray={CIRC} strokeDashoffset={gone} strokeLinecap="round"
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          </Svg>
          <Type step="badge" className="text-text" style={drawnType.launchCount} testID="launch-count">{String(left)}</Type>
        </Box>
      </Pressable>
      <Box className="absolute flex-row items-center" style={{ top: insets.top + MARK_DROP, left: 20, gap: spacing.gap }} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="launch-mark">
        <Image source={MARK} style={{ width: MARK_SIZE, height: MARK_SIZE, borderRadius: 9 }} accessibilityIgnoresInvertColors />
        <Type step="row" className="font-display font-extrabold text-text">SocialNet</Type>
      </Box>
      <Pressable
        onPress={open}
        accessibilityRole="link"
        accessibilityLabel={`${props.promotion.label}. Opens the promotion`}
        hitSlop={LABEL_SLOP}
        className="absolute"
        style={{ left: 20, right: 20, bottom: 56, gap: spacing.row - 2 }}
      >
        <Type step="tag" className="text-text2" style={MONO_CAPS}>{props.promotion.label}</Type>
        <Type step="row" className="text-hotText" style={OPEN_LINE}>Open →</Type>
      </Pressable>
    </Animated.View>
  );
}
