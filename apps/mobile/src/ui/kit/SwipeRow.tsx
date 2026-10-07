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
let loaded: SwipeableModule | null | undefined;
/** gesture-handler's swipeable, or null where it cannot load (Jest, or a failed load). */
function swipeable(): SwipeableModule | null {
  if (loaded === undefined) {
    if (typeof jest !== 'undefined') loaded = null;
    else try { loaded = require('react-native-gesture-handler/ReanimatedSwipeable') as SwipeableModule; } catch { loaded = null; }
  }
  return loaded;
}

/** Tests only: a stand-in for gesture-handler's swipeable (null = the plain row). */
export function setSwipeableForTests(m: SwipeableModule | null): void {
  loaded = m;
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

function Actions(props: { actions: readonly SwipeAction[]; close: () => void; align: 'start' | 'end' }): React.ReactElement {
  return (
    <Box className={`flex-row items-stretch gap-1 px-1 ${props.align === 'end' ? 'justify-end' : 'justify-start'}`}>
      {props.actions.map((a, i) => (
        <Pressable
          key={a.key}
          onPress={() => { props.close(); a.onPress(); }}
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
      {...(right.length > 0 ? { renderLeftActions: () => <Actions actions={right} close={close} align="start" /> } : {})}
      {...(left.length > 0 ? { renderRightActions: () => <Actions actions={left} close={close} align="end" /> } : {})}
      onSwipeableOpen={(direction) => {
        // `direction` is the swipe's: RIGHT opened the left edge (the swipeRight actions).
        const side = direction === mod.SwipeDirection.RIGHT ? right : left;
        if (side.length === 1) { close(); side[0]!.onPress(); }
      }}
    >
      <Box {...swipeA11y(all)}>{props.children}</Box>
    </ReanimatedSwipeable>
  );
}
