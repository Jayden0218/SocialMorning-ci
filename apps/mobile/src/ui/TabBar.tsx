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
import { Pressable, Text, View } from 'react-native';
import { useStores } from './providers';
import { useColours } from './useColours';
import { Icon, type IconName } from './Icon';
import { TAB_BAR_HEIGHT } from './Screen';

export type TabItem = {
  /** The route name, e.g. `index`, `discover`, `following`. */
  key: string;
  /** What a listener reads, and what a screen reader speaks. */
  label: string;
  /** Appended to the label, e.g. "Following, 3 new". Never colour alone (FR-016). */
  badge?: number;
  /** Owner, 2026-09-27 (the reference's bar): an icon over the label — outline, filled when active. */
  icon?: { idle: IconName; active: IconName };
};

export function TabBar(props: {
  items: readonly TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  className?: string;
}): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <View
      className={`flex-row bg-background border-t-hairline border-separator ${props.className ?? ''}`}
      // `minHeight`, never `height`: at the largest system font the labels must push the
      // bar taller rather than clip (M6 J6 found exactly this on the Account screen).
      // It stays a style because `TAB_BAR_HEIGHT` is the one source for this number.
      style={{ minHeight: TAB_BAR_HEIGHT }}
      accessibilityRole="tablist"
    >
      {props.items.map((item) => {
        const selected = item.key === props.activeKey;
        const badge = item.badge !== undefined && item.badge > 0 ? item.badge : undefined;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={badge === undefined ? item.label : `${item.label}, ${badge} new`}
            accessibilityState={{ selected }}
            className="flex-1 min-h-12 pt-2 pb-1 px-2 items-center justify-center gap-1"
            onPress={() => props.onSelect(item.key)}
          >
            {item.icon ? (
              <View>
                <Icon name={selected ? item.icon.active : item.icon.idle} size={26} color={selected ? c.accent : c.muted} />
                {badge === undefined ? null : (
                  <View className="absolute -top-1 -right-3 min-w-5 px-1 rounded-pill bg-accent items-center">
                    <Text className="text-background text-xs font-bold">{badge}</Text>
                  </View>
                )}
              </View>
            ) : null}
            {/* The active tab is told apart by weight AND colour AND a filled icon, and by
                `accessibilityState` — never by colour alone (FR-016). */}
            <Text className={selected ? 'text-xs text-accent font-bold' : 'text-xs text-muted'} numberOfLines={1}>
              {badge === undefined || item.icon ? item.label : `${item.label} (${badge})`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
