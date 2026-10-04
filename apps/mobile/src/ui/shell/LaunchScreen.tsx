// Full-screen promotion picture for up to 3 seconds at start, with Skip.
/**
 * M15 US3 (FR-015–FR-018): the owner's promotion, full screen, for at most 3 s after the
 * native launch screen hides. Mounted by `src/ui/shell/providers.tsx` beside the Terms overlay,
 * only when `decideLaunch` found an image already on the phone.
 *
 * - **Skip is first** in the tree, so a screen reader announces it first (FR-018).
 * - The label ("Promotion" by default) is always visible (FR-016).
 * - A 3-2-1 countdown; at 0 it closes by itself. With Reduce Motion on there is no fade —
 *   it simply goes (FR-018); otherwise a short fade that still ends by 3 s.
 * - A tap on the image opens its target (`onTap`) and closes.
 *
 * The 3 s start when `started` turns true (the splash has hidden), not at mount: until then
 * the native launch screen covers it.
 *
 * M17 T109 (`Splash-B`): the Editorial frame — the app's mark and serif name top left, Skip as
 * a white pill ringed in the accent top right (the count stays in the one "Skip 3" text the
 * launch test reads, not in a separate ring as the design draws it), the owner's image in a
 * rounded card, and the label as an accent link with an arrow at the bottom. The mark is hidden from screen readers so
 * Skip stays the first thing reached (FR-018); timing, impression and tap are unchanged.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Image } from '@/ui/lib/image';
import { Pressable } from '@/ui/lib/pressable';
import { SafeAreaView } from '@/ui/lib/safe-area-view';
import { Text } from '@/ui/lib/text';
import { hit } from '@/design';
import { LAUNCH_MAX_MS, type Promotion } from '@/launch/choose';

const ALL_EDGES = ['top', 'bottom', 'left', 'right'] as const;
const TAP = { minHeight: hit.min, minWidth: hit.min };
const FILL = { width: '100%', height: '100%' } as const;
/** The app's own mark, as the native splash and the sign-in page show it. */
const MARK = require('../../../assets/app-icon.png');
const MARK_SIZE = { width: 34, height: 34 };
/** The fade at the end, inside the 3 s. */
export const LAUNCH_FADE_MS = 200;

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
  const [left, setLeft] = useState(Math.ceil(LAUNCH_MAX_MS / 1000));
  const still = useRef(false);
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
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (live) still.current = v; }).catch(() => undefined);
    return () => { live = false; };
  }, []);

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

  return (
    <Animated.View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity }}>
      <SafeAreaView edges={ALL_EDGES} className="flex-1 bg-background">
        {/* Skip first: the first thing a screen reader reaches (FR-018). The mark beside it is
            decoration and hidden, so nothing is read before Skip. */}
        <Box className="flex-row items-center justify-between px-screen-x pt-row pb-row">
          <Box className="flex-row items-center gap-2" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Image source={MARK} style={MARK_SIZE} className="rounded-[8px]" accessibilityIgnoresInvertColors />
            <Text className="text-text text-base font-display">SocialNet</Text>
          </Box>
          <Pressable
            onPress={finish}
            accessibilityRole="button"
            accessibilityLabel="Skip"
            accessibilityHint={`Closes in ${left} seconds`}
            className="items-center justify-center rounded-pill bg-surface border-2 border-accent px-section"
            style={TAP}
          >
            {/* One Text, "Skip 3": launch-startup.test reads it whole (see the M17 note). */}
            <Text className="text-body font-semibold text-text">{`Skip ${left}`}</Text>
          </Pressable>
        </Box>
        {/* The image is the tap target for sight; a screen reader skips it and reaches the same
            link at the bottom. */}
        <Box className="flex-1 px-screen-x">
          <Pressable
            onPress={open}
            accessibilityLabel={`${props.promotion.label} image`}
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="flex-1 rounded-artwork-lg overflow-hidden bg-surface border border-border"
          >
            <Image source={{ uri: props.uri }} style={FILL} resizeMode="cover" accessibilityIgnoresInvertColors />
          </Pressable>
        </Box>
        <Box className="flex-row px-screen-x pt-row pb-row">
          <Pressable
            onPress={open}
            accessibilityRole="link"
            accessibilityLabel={`${props.promotion.label}. Opens the promotion`}
            className="flex-row items-center gap-2"
            style={TAP}
          >
            <Text className="text-body font-bold text-accent">{props.promotion.label}</Text>
            <Text className="text-body font-bold text-accent">›</Text>
          </Pressable>
        </Box>
      </SafeAreaView>
    </Animated.View>
  );
}
