// The bottom tab bar you tap to change between main pages.
/**
 * Our own bottom tab bar (M7 T012), redrawn for Pulse (M31 T022; design-pulse2 `kit.js` `tabbar`,
 * discover.html `tabs--bar`).
 *
 * It is written by hand rather than taken from the navigation library's default so that
 * the three things M6 paid for on the phone stay ours: every tab is a real `Pressable`
 * with `accessibilityRole="tab"` and a state (a bare navigation node announced as plain
 * text — that was J5's defect, twice), nothing has a fixed height, and the touch target
 * is at least `hit.min`.
 *
 * Pulse: the bar is the void colour edge to edge, 58 tall, with a 1 px line on top at 6 % white.
 * Four equal slots, ICONS ONLY: 26, centred 14 from the top; idle = the outline icon in `idle`
 * (4.51 as a graphic), active = the filled icon in `text` with ONE 5 pt hot dot 7 below it, glowing
 * (10 px), that slides to the new tab in 240 ms (at once with Reduce Motion). Labels are not drawn
 * but every tab keeps its spoken name ("Updates, 3 new"). Long-press shows the name in a small
 * bubble above the icon for 1.2 s. A tab with no icon (tests, any future page) falls back to its
 * words: bold + coloured when active, never colour alone (FR-016).
 *
 * Badges: a 16 tall pill (min 16 wide, hot fill, void Geist Mono 10/600) at the icon's top right
 * (+8 x, −4 y) in a 2 px void ring — the count, `99+` over 99; or a 7 hot dot ("new, no count").
 * The light selection tick comes as the finger lands on a tab that is not the active one.
 *
 * The component is pure: it takes the tabs, which one is active, and a callback. The layout adapts
 * the router's props to it, so this can be tested with no router at all. 'rail' is the same tabs as
 * a column down the left edge on a wide window (88 wide, each icon over its name, same roles,
 * states and badges).
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { bars, glow, motion, radius } from '@/design';
import { useColours } from '@/ui/kit/useColours';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { badgeText } from '@/ui/kit/pulse-math';
import { tick } from '@/ui/kit/haptics';
import { useReducedMotion } from '@/ui/kit/useReducedMotion';
import { TAB_BAR_HEIGHT } from '@/ui/kit/Screen';

export type TabItem = {
  /** The route name, e.g. `index`, `discover`, `following`. */
  key: string;
  /** What a listener reads, and what a screen reader speaks. */
  label: string;
  /** A count on the icon, appended to the spoken label: "Chat, 3 new". `99+` is drawn over 99. */
  badge?: number;
  /** M31: a 7 hot dot — "something new, no count" (Me, when notifications are unread). */
  dot?: boolean;
  /** Owner, 2026-09-27: outline when idle, filled when active. */
  icon?: { idle: IconName; active: IconName };
};

const DOT_TOP = bars.tabIconTop + bars.tabIcon + bars.tabDotGap;
const ICON_BOX = { width: bars.tabIcon, height: bars.tabIcon };
const ITEM = { minHeight: bars.tab, paddingTop: bars.tabIconTop };
const RING = 2;

function Badge(props: { item: TabItem }): React.ReactElement | null {
  const { item } = props;
  if (item.badge !== undefined && item.badge > 0) {
    return (
      <Box testID="tab-badge" pointerEvents="none" className="absolute bg-void items-center justify-center" style={{ top: -4 - RING, left: bars.tabIcon / 2 + 8 - RING, padding: RING, borderRadius: radius.bar }} accessible={false} importantForAccessibility="no-hide-descendants">
        <Box className="bg-hot items-center justify-center" style={{ minWidth: bars.badge, height: bars.badge, paddingHorizontal: 4, borderRadius: bars.badge / 2 }}>
          <Type step="badge" className="text-void text-center">{badgeText(item.badge)}</Type>
        </Box>
      </Box>
    );
  }
  if (item.dot === true) {
    return (
      <Box testID="tab-dot-badge" pointerEvents="none" className="absolute bg-void items-center justify-center rounded-pill" style={{ top: -2 - RING, left: bars.tabIcon / 2 + 10 - RING, width: bars.dotSmall + RING * 2, height: bars.dotSmall + RING * 2 }} accessible={false} importantForAccessibility="no-hide-descendants">
        <Box className="bg-hot rounded-pill" style={{ width: bars.dotSmall, height: bars.dotSmall }} />
      </Box>
    );
  }
  return null;
}

const GLOW = { shadowColor: glow.dot.color, shadowOpacity: glow.dot.opacity, shadowRadius: glow.dot.radius, shadowOffset: { width: 0, height: 0 } };

/** The hot dot: 5 pt, glowing. */
function Dot(props: { style?: object }): React.ReactElement {
  return <Box testID="tab-active-dot" pointerEvents="none" className="bg-hot rounded-pill" style={[{ width: bars.dot, height: bars.dot }, GLOW, props.style]} accessible={false} importantForAccessibility="no-hide-descendants" />;
}

export function TabBar(props: {
  items: readonly TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  className?: string;
  /**
   * M22 US16 (T070): 'rail' on a wide window (src/ui/shell/useLayout.ts) — the same tabs as a
   * column down the left edge, each icon over its label, same roles, states and badges.
   */
  mode?: 'bar' | 'rail';
}): React.ReactElement {
  const c = useColours();
  const still = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [bubble, setBubble] = useState<string | undefined>(undefined);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { if (bubbleTimer.current) clearTimeout(bubbleTimer.current); }, []);
  const index = Math.max(0, props.items.findIndex((i) => i.key === props.activeKey));
  const slot = props.items.length > 0 ? width / props.items.length : 0;
  const [x] = useState(() => new Animated.Value(0));
  const to = slot * index + slot / 2 - bars.dot / 2;
  useEffect(() => {
    if (slot === 0) return;
    if (still) { x.setValue(to); return; }
    Animated.timing(x, { toValue: to, duration: motion.move, useNativeDriver: true }).start();
  }, [to, slot, still, x]);
  if (props.mode === 'rail') return <TabRail {...props} />;
  const anyIcon = props.items.some((i) => i.icon !== undefined);
  const showName = (key: string) => {
    setBubble(key);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(undefined), motion.bubble);
  };
  return (
    <Box
      className={`flex-row bg-void border-t-hairline border-barLine ${props.className ?? ''}`}
      // `minHeight`, never `height`: at the largest system font the labels must push the
      // bar taller rather than clip (M6 J6 found exactly this on the Account screen).
      // It stays a style because `TAB_BAR_HEIGHT` is the one source for this number.
      style={{ minHeight: TAB_BAR_HEIGHT }}
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {props.items.map((tab) => {
        // A dot means "something new, no count": the spoken name says so ("Me, new").
        const item = tab.dot === true && !(tab.badge !== undefined && tab.badge > 0) ? { ...tab, label: `${tab.label}, new` } : tab;
        const selected = item.key === props.activeKey;
        const badge = item.badge !== undefined && item.badge > 0 ? item.badge : undefined;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={badge === undefined ? item.label : `${item.label}, ${badge} new`}
            accessibilityState={{ selected }}
            className="flex-1 items-center"
            style={ITEM}
            delayLongPress={motion.longPress}
            // The light tick comes as the finger lands on a tab that is not the active one.
            onPressIn={() => { if (!selected) tick(); }}
            onPress={() => props.onSelect(item.key)}
            onLongPress={() => showName(item.key)}
          >
            {item.icon ? (
              <Box style={ICON_BOX}>
                <Icon name={selected ? item.icon.active : item.icon.idle} size={bars.tabIcon} color={selected ? c.text : c.idle} />
                <Badge item={item} />
              </Box>
            ) : (
              // No icon (tests, a future page): the words, bold + coloured when active — never colour alone (FR-016).
              <Text className={selected ? 'text-xs text-hotText font-bold' : 'text-xs text-text2'} numberOfLines={1} maxFontSizeMultiplier={1.6} adjustsFontSizeToFit minimumFontScale={0.8}>
                {badge === undefined ? item.label : `${item.label} (${badge})`}
              </Text>
            )}
            {bubble === item.key ? (
              <Box testID="tab-name-bubble" pointerEvents="none" className="absolute bg-raise2 border border-line px-row" style={{ top: -bars.circle + 2, borderRadius: radius.small, paddingVertical: 4, zIndex: 5 }} accessible={false} importantForAccessibility="no-hide-descendants">
                <Type step="caption" className="text-text" numberOfLines={1}>{item.label}</Type>
              </Box>
            ) : null}
          </Pressable>
        );
      })}
      {anyIcon && slot > 0 ? <Animated.View pointerEvents="none" style={{ position: 'absolute', top: DOT_TOP, left: 0, transform: [{ translateX: x }] }}><Dot /></Animated.View> : null}
    </Box>
  );
}

/** M22 T070: the rail — a void column, the tabs stacked from the top, a hairline on its right. */
const RAIL_EDGE = { width: bars.rail, borderRightWidth: StyleSheet.hairlineWidth };
const RAIL_TAB = { minHeight: 72 };

function TabRail(props: { items: readonly TabItem[]; activeKey: string; onSelect: (key: string) => void; className?: string }): React.ReactElement {
  const c = useColours();
  return (
    <Box className={`bg-void border-barLine pt-section gap-gap ${props.className ?? ''}`} style={RAIL_EDGE} accessibilityRole="tablist">
      {props.items.map((tab) => {
        // A dot means "something new, no count": the spoken name says so ("Me, new").
        const item = tab.dot === true && !(tab.badge !== undefined && tab.badge > 0) ? { ...tab, label: `${tab.label}, new` } : tab;
        const selected = item.key === props.activeKey;
        const badge = item.badge !== undefined && item.badge > 0 ? item.badge : undefined;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={badge === undefined ? item.label : `${item.label}, ${badge} new`}
            accessibilityState={{ selected }}
            className="items-center justify-center gap-hair px-hair"
            style={RAIL_TAB}
            onPressIn={() => { if (!selected) tick(); }}
            onPress={() => props.onSelect(item.key)}
          >
            {item.icon ? (
              <Box style={ICON_BOX}>
                <Icon name={selected ? item.icon.active : item.icon.idle} size={bars.tabIcon} color={selected ? c.text : c.idle} />
                <Badge item={item} />
              </Box>
            ) : null}
            {/* The rail has room: the name sits under the icon, with the active dot beside it. */}
            <Text className={selected ? 'text-xs text-text font-bold' : 'text-xs text-text2'} numberOfLines={1} maxFontSizeMultiplier={1.6} adjustsFontSizeToFit minimumFontScale={0.8}>
              {badge === undefined || item.icon ? item.label : `${item.label} (${badge})`}
            </Text>
            {selected && item.icon ? <Dot /> : null}
          </Pressable>
        );
      })}
    </Box>
  );
}
