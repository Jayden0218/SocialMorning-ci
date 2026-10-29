// The Moments | Discover switch and the search circle beside it, in the thumb zone above the bars.
/**
 * M31 T025 (design-pulse2 `home--moments`, `discover--screen`, index.html §Bars). A 52 tall glass
 * capsule (4 of padding, radius 26, a 1 px glass line) holds two 44 tall segments; the chosen one is
 * the light fill with void words (Geist 700 14), the other text2 words (600 14). It sits centred, 8
 * above the highest bar — `bottom` is that distance from the page's bottom edge (the Home screen
 * ends where the tab bar, or the now bar, begins). On the Moments view a 52 glass circle with the
 * search icon sits beside it; on Discover the search field is above it instead. The segments are
 * tabs of one tab list; the name of each is its word.
 */
import { useRef, type ComponentRef } from 'react';
import { StyleSheet, type View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { bars, colour, spacing } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import type { HomeView } from './homeView';

export const SWITCH_HEIGHT = 52;
/** Where the switch's bottom edge sits above the page's: 8. */
export const SWITCH_LIFT = bars.toastLift;
const SEGMENT = 44;
const SEGMENT_PAD = 18;
const PAD = 4;
const FILL = StyleSheet.absoluteFill;

const SEGMENTS: readonly { view: HomeView; label: string }[] = [
  { view: 'moments', label: 'Moments' },
  { view: 'discover', label: 'Discover' },
];

export function HomeSwitch(props: {
  view: HomeView;
  onChange: (view: HomeView) => void;
  /** The search circle (Moments view). `fromY` is where the circle sits in the window, for Search to start from. */
  search?: { label: string; onOpen: (fromY: number) => void };
}): React.ReactElement {
  const circle = useRef<ComponentRef<typeof View>>(null);
  const openSearch = (): void => {
    const open = props.search?.onOpen;
    if (!open) return;
    if (!circle.current) { open(0); return; }
    circle.current.measureInWindow((_x, y) => open(Math.round(y)));
  };
  return (
    <Box pointerEvents="box-none" className="absolute left-0 right-0 flex-row justify-center" style={{ bottom: SWITCH_LIFT, gap: spacing.gap, zIndex: 30 }}>
      <Box accessibilityRole="tablist" className="overflow-hidden border border-glassLine flex-row items-center" style={{ height: SWITCH_HEIGHT, borderRadius: SWITCH_HEIGHT / 2, padding: PAD }}>
        <BlurView intensity={30} tint="dark" style={[FILL, { backgroundColor: colour.glass }]} />
        {SEGMENTS.map((s) => {
          const on = s.view === props.view;
          return (
            <Pressable
              key={s.view}
              onPress={() => props.onChange(s.view)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={s.label}
              className={`items-center justify-center ${on ? 'bg-text' : ''}`}
              style={{ height: SEGMENT, paddingHorizontal: SEGMENT_PAD, borderRadius: SEGMENT / 2 }}
            >
              <Type step="compact" className={on ? 'text-void font-bold' : 'text-text2'}>{s.label}</Type>
            </Pressable>
          );
        })}
      </Box>
      {props.search ? (
        <Box ref={circle} collapsable={false}>
          <Pressable
            onPress={openSearch}
            accessibilityRole="search"
            accessibilityLabel={props.search.label}
            className="overflow-hidden border border-glassLine items-center justify-center"
            style={{ width: SWITCH_HEIGHT, height: SWITCH_HEIGHT, borderRadius: SWITCH_HEIGHT / 2 }}
          >
            <BlurView intensity={30} tint="dark" style={[FILL, { backgroundColor: colour.glass }]} />
            <Icon name="search-outline" size={22} color={colour.text} />
          </Pressable>
        </Box>
      ) : null}
    </Box>
  );
}
