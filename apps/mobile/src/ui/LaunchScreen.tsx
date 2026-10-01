/**
 * M15 US3 (FR-015–FR-018): the owner's promotion, full screen, for at most 3 s after the
 * native launch screen hides. Mounted by `src/ui/providers.tsx` beside the Terms overlay,
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
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { Box } from './lib/box';
import { Image } from './lib/image';
import { Pressable } from './lib/pressable';
import { SafeAreaView } from './lib/safe-area-view';
import { Text } from './lib/text';
import { hit } from '../design';
import { LAUNCH_MAX_MS, type Promotion } from '../launch/choose';

const ALL_EDGES = ['top', 'bottom', 'left', 'right'] as const;
const TAP = { minHeight: hit.min, minWidth: hit.min };
const FILL = { width: '100%', height: '100%' } as const;
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
      <Box className="flex-1 bg-background">
        {/* The image is the tap target for sight; a screen reader skips it (it would be read
            first — VoiceOver orders by position) and reaches the same link at the bottom. */}
        <Pressable
          onPress={open}
          accessibilityLabel={`${props.promotion.label} image`}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="absolute inset-0"
        >
          <Image source={{ uri: props.uri }} style={FILL} resizeMode="cover" accessibilityIgnoresInvertColors />
        </Pressable>
        <SafeAreaView edges={ALL_EDGES} className="absolute inset-0" pointerEvents="box-none">
          {/* Skip first: the first thing a screen reader reaches (FR-018). */}
          <Box className="flex-row justify-end px-screen-x pt-row" pointerEvents="box-none">
            <Pressable
              onPress={finish}
              accessibilityRole="button"
              accessibilityLabel="Skip"
              accessibilityHint={`Closes in ${left} seconds`}
              className="items-center justify-center rounded-pill bg-background px-section"
              style={TAP}
            >
              <Text className="text-sm font-semibold text-text">{`Skip ${left}`}</Text>
            </Pressable>
          </Box>
          <Box className="flex-1" pointerEvents="none" />
          <Box className="flex-row px-screen-x pb-row" pointerEvents="box-none">
            <Pressable
              onPress={open}
              accessibilityRole="link"
              accessibilityLabel={`${props.promotion.label}. Opens the promotion`}
              className="items-center justify-center rounded-pill bg-background px-row"
              style={TAP}
            >
              <Text className="text-xs text-muted">{props.promotion.label}</Text>
            </Pressable>
          </Box>
        </SafeAreaView>
      </Box>
    </Animated.View>
  );
}
