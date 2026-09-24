/**
 * Our own bottom tab bar (M7 T012).
 *
 * It is written by hand rather than taken from the navigation library's default so that
 * the three things M6 paid for on the phone stay ours: every tab is a real `Pressable`
 * with `accessibilityRole="tab"` and a state (a bare navigation node announced as plain
 * text — that was J5's defect, twice), nothing has a fixed height, and the touch target
 * is at least `hit.min`.
 *
 * The component is pure: it takes the tabs, which one is active, and a callback. The
 * layout adapts the router's props to it, so this can be tested with no router at all.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colour, fontSize, hit, spacing } from '../design';
import { TAB_BAR_HEIGHT } from './Screen';

export type TabItem = {
  /** The route name, e.g. `index`, `discover`, `following`. */
  key: string;
  /** What a listener reads, and what a screen reader speaks. */
  label: string;
  /** Appended to the label, e.g. "Following, 3 new". Never colour alone (FR-016). */
  badge?: number;
};

export function TabBar(props: {
  items: readonly TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}): React.ReactElement {
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {props.items.map((item) => {
        const selected = item.key === props.activeKey;
        const badge = item.badge !== undefined && item.badge > 0 ? item.badge : undefined;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={badge === undefined ? item.label : `${item.label}, ${badge} new`}
            accessibilityState={{ selected }}
            style={styles.tab}
            onPress={() => props.onSelect(item.key)}
          >
            <Text style={selected ? styles.labelActive : styles.label} numberOfLines={1}>
              {badge === undefined ? item.label : `${item.label} (${badge})`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    // `minHeight`, never `height`: at the largest system font the labels must push the
    // bar taller rather than clip (M6 J6 found exactly this on the Account screen).
    minHeight: TAB_BAR_HEIGHT,
    backgroundColor: colour.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colour.separator,
  },
  tab: {
    flex: 1,
    minHeight: hit.min,
    paddingVertical: spacing.gap,
    paddingHorizontal: spacing.gap,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: fontSize.xs, color: colour.muted },
  // The active tab is told apart by weight AND colour, and by `accessibilityState`
  // — never by colour alone (FR-016).
  labelActive: { fontSize: fontSize.xs, color: colour.accent, fontWeight: '700' },
});
