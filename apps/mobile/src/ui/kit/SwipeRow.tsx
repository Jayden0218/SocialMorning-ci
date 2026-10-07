// A row you can swipe left or right to show its actions, each also a screen-reader action.
/**
 * M22 US12 (research R11, FR-036/037): one kit part on gesture-handler's `ReanimatedSwipeable`.
 *
 *  - `swipeLeft`: the actions a swipe to the LEFT shows, at the row's right edge (Updates:
 *    Queue, Remove from Updates; the queue: Remove). With one action, swiping the row open
 *    runs it at once (the full swipe); with more, they show as buttons and a tap runs one.
 *  - `swipeRight`: the same for a swipe to the right (Updates: Mark played).
 *  - Every action is also an accessibility action on the row (VoiceOver's rotor, TalkBack's
 *    actions menu), so nothing is reachable by swipe alone. `swipeA11y` gives the same props for
 *    a row whose own button is the element a screen reader focuses.
 *  - Editorial colours from tokens only: the first action on a side is yellow (`bg-primary`),
 *    the others white with a border; text in `text-onPrimary` / `text-text`.
 *  - Defect 3 (owner's iPhone, 2026-10-07): gesture-handler draws both action panels behind the
 *    row all the time, so their yellow showed in the card's margins and gaps when nothing was
 *    being swiped. Each panel is now see-through until its side's progress is above 0
 *    (`panelStyle`), and a button only runs once its row has finished opening (`mayRun`) — a
 *    swipe's release can never press one; on a side with two or more actions the release only
 *    reveals them.
 *  - The swipeable is loaded on first use. Under Jest (whose reanimated cannot start its native
 *    part) the row is drawn plain with its accessibility actions, so every screen test that draws
 *    an Updates or queue row keeps working; `setSwipeableForTests` hands in a stand-in.
 */
import { useRef, type ReactNode } from 'react';
import type { AccessibilityActionEvent } from 'react-native';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';

export type SwipeAction = { key: string; label: string; onPress: () => void };

const BUTTON = { minHeight: hit.min, minWidth: 88 };

type SwipeableModule = typeof import('react-native-gesture-handler/ReanimatedSwipeable');
/** The two parts of reanimated a panel needs (a stand-in in tests). */
export type PanelAnimation = {
  View: React.ComponentType<{ style?: unknown; pointerEvents?: 'none' | 'auto' | 'box-none'; children?: ReactNode }>;
  useAnimatedStyle: (fn: () => Record<string, unknown>) => unknown;
};
let loaded: SwipeableModule | null | undefined;
let animation: PanelAnimation | null = null;
/** gesture-handler's swipeable, or null where it cannot load (Jest, or a failed load). */
function swipeable(): SwipeableModule | null {
  if (loaded === undefined) {
    if (typeof jest !== 'undefined') loaded = null;
    else try {
      loaded = require('react-native-gesture-handler/ReanimatedSwipeable') as SwipeableModule;
      const r = require('react-native-reanimated') as { default: { View: PanelAnimation['View'] }; useAnimatedStyle: PanelAnimation['useAnimatedStyle'] };
      animation = { View: r.default.View, useAnimatedStyle: r.useAnimatedStyle };
    } catch { loaded = null; }
  }
  return loaded;
}

/** Tests only: a stand-in for gesture-handler's swipeable (null = the plain row) and for reanimated. */
export function setSwipeableForTests(m: SwipeableModule | null, anim: PanelAnimation | null = null): void {
  loaded = m;
  animation = anim;
}

/** A panel's look for its side's progress: nothing at rest, whole once the row moves that way. */
export function panelStyle(progress: number): { opacity: number } {
  'worklet';
  return { opacity: progress > 0 ? 1 : 0 };
}

/** How long after the row finished opening a tap on a revealed button may run it. */
export const OPEN_SETTLE_MS = 250;
/** A button runs only on a row that has finished opening, and not in the same moment (the release). */
export function mayRun(openedAt: number | undefined, now: number): boolean {
  return openedAt !== undefined && now - openedAt >= OPEN_SETTLE_MS;
}

/** The accessibility props that carry every swipe action: put them on the row's focused element. */
export function swipeA11y(actions: readonly SwipeAction[]): {
  accessibilityActions: { name: string; label: string }[];
  onAccessibilityAction: (e: AccessibilityActionEvent) => void;
} {
  return {
    accessibilityActions: actions.map((a) => ({ name: a.key, label: a.label })),
    onAccessibilityAction: (e) => { actions.find((a) => a.key === e.nativeEvent.actionName)?.onPress(); },
  };
}

type Progress = { value: number };

/** The panel, see-through while its side's progress is 0 (reanimated drives the opacity). */
function Panel(props: { progress: Progress | undefined; anim: PanelAnimation; children: ReactNode }): React.ReactElement {
  const { progress, anim } = props;
  const style = anim.useAnimatedStyle(() => panelStyle(progress?.value ?? 0));
  return <anim.View style={[{ flex: 1 }, style]}>{props.children}</anim.View>;
}

function Actions(props: { actions: readonly SwipeAction[]; close: () => void; align: 'start' | 'end'; canRun: () => boolean; progress?: Progress }): React.ReactElement {
  const buttons = (
    <Box className={`flex-1 flex-row items-stretch gap-1 px-1 ${props.align === 'end' ? 'justify-end' : 'justify-start'}`}>
      {props.actions.map((a, i) => (
        <Pressable
          key={a.key}
          onPress={() => { if (!props.canRun()) return; props.close(); a.onPress(); }}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          className={`items-center justify-center px-3 rounded-row ${i === 0 ? 'bg-primary' : 'bg-surface border border-border'}`}
          style={BUTTON}
        >
          <Text className={i === 0 ? 'text-onPrimary text-meta font-bold' : 'text-text text-meta font-bold'} numberOfLines={2}>{a.label}</Text>
        </Pressable>
      ))}
    </Box>
  );
  return animation ? <Panel progress={props.progress} anim={animation}>{buttons}</Panel> : buttons;
}

export function SwipeRow(props: {
  children: ReactNode;
  /** Shown by a swipe to the left (at the right edge). */
  swipeLeft?: readonly SwipeAction[];
  /** Shown by a swipe to the right (at the left edge). */
  swipeRight?: readonly SwipeAction[];
  /** Off: the row does not swipe (e.g. while selecting). */
  enabled?: boolean;
  testID?: string;
}): React.ReactElement {
  const ref = useRef<SwipeableMethods>(null);
  // When the row last finished opening (undefined = closed or moving): gates the buttons.
  const openedAt = useRef<number | undefined>(undefined);
  const canRun = () => mayRun(openedAt.current, Date.now());
  const left = props.swipeLeft ?? [];
  const right = props.swipeRight ?? [];
  const close = () => ref.current?.close();
  const all = [...left, ...right];
  const mod = swipeable();
  if (!mod) return <Box {...swipeA11y(all)}>{props.children}</Box>;
  const ReanimatedSwipeable = mod.default;
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      enabled={props.enabled !== false && all.length > 0}
      // The swipe "open" point: a third of a typical 360 pt row.
      leftThreshold={120}
      rightThreshold={120}
      overshootLeft={false}
      overshootRight={false}
      {...(props.testID !== undefined ? { testID: props.testID } : {})}
      {...(right.length > 0 ? { renderLeftActions: (progress?: Progress) => <Actions actions={right} close={close} align="start" canRun={canRun} {...(progress ? { progress } : {})} /> } : {})}
      {...(left.length > 0 ? { renderRightActions: (progress?: Progress) => <Actions actions={left} close={close} align="end" canRun={canRun} {...(progress ? { progress } : {})} /> } : {})}
      onSwipeableOpenStartDrag={() => { openedAt.current = undefined; }}
      onSwipeableClose={() => { openedAt.current = undefined; }}
      onSwipeableOpen={(direction) => {
        // `direction` is the swipe's: RIGHT opened the left edge (the swipeRight actions).
        const side = direction === mod.SwipeDirection.RIGHT ? right : left;
        // One action: the full swipe runs it. Two or more: the release only reveals them.
        if (side.length === 1) { openedAt.current = undefined; close(); side[0]!.onPress(); return; }
        openedAt.current = Date.now();
      }}
    >
      <Box {...swipeA11y(all)}>{props.children}</Box>
    </ReanimatedSwipeable>
  );
}
