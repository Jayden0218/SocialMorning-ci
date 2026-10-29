// The low zone of Search: the result tabs, the Published chips, the page's name and the search field with Cancel.
/**
 * M31 T030 (design-pulse2 `discover.html` `searchShell`, layout rule 4 "search is low"). Everything sits in
 * the thumb zone, 20 from each side, 10 apart, its bottom `bottom` above the screen's (6 over the safe area,
 * or 8 over the keyboard — the page works that out):
 *   - on a result page the tab row (All · Shows · Episodes · Moments NEW · People): Geist 600 14, text2, the
 *     chosen one in the text colour with a 2 hot underline; "NEW" is the 10 mono tag;
 *   - for episodes (All, Episodes) the Published chips (Any · Last 30 days · Last 6 months): 30 tall;
 *   - with nothing typed, "Search" in Unbounded 30;
 *   - the field (48, raise2, radius 18, a 1.5 ring — hot once there is a term), the magnifier, the words,
 *     and at the right the Scan mark, or a ✕ that clears the box once something is typed; then Cancel in
 *     hot-text 15/700.
 * The field is the part that moves up from Discover's place (`field`: the page's animation, measure and reveal);
 * the tabs and the name fade in after it (`fadeIn`).
 *
 * New action (the action map's "Cancel · clear"): the ✕ ("Clear search") empties the box and leaves the result page.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { LinearGradient } from '@/design/tailwind';
import { Input, InputField } from '@/ui/lib/input';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { bars, colour, gutter, radius, spacing, typeStyle } from '@/design';
import { useWindowDimensions } from 'react-native';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import type { SearchSince } from '@/discover/explore-api';
import { SINCE, TABS, showSinceChips, type Tab } from './search-tabs';
import { PX } from '@/ui/discover/Deck';
import { drawnType } from '@/design/type-px';

/** Drawn: a tab's underline 2 under 8 of padding; a Published chip 30 tall. */
const UNDERLINE = 2;
const CHIP = 30;
const NO_PAD = { paddingHorizontal: 0 } as const;
const TAB_SLOP = { top: 12, bottom: 8, left: 6, right: 6 };
const CHIP_SLOP = { top: 9, bottom: 9, left: 0, right: 0 };

export type FieldAnimation = { ref: React.Ref<React.ComponentRef<typeof Animated.View>>; onLayout: () => void; style: object };

export function SearchZone(props: {
  bottom: number;
  results: boolean;
  /** Nothing matched (the page's empty block): the Published chips are not drawn then, as in the drawing. */
  nothing?: boolean;
  tab: Tab;
  onTab: (t: Tab) => void;
  since: SearchSince;
  onSince: (s: SearchSince) => void;
  term: string;
  placeholder: string;
  autoFocus: boolean;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onCancel: () => void;
  onScan: () => void;
  field: FieldAnimation;
  fadeIn: Animated.AnimatedInterpolation<number>;
  onHeight?: (h: number) => void;
}): React.ReactElement {
  const { width } = useWindowDimensions();
  // M31 R2 (fontscale2 F11): when the tabs are wider than the row, a fade at the right edge says there is more (gone once scrolled to the end).
  const [row, setRow] = useState({ view: 0, content: 0, x: 0 });
  const more = row.view > 0 && row.content > row.view + 1 && row.x + row.view < row.content - 2;
  const typed = props.term !== '';
  // M31 F13 (fontscale2 F11, widths W9): a chosen tab must be on screen - People is the last and sits off the edge at 320 wide or at the largest text.
  const tabsRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const tabX = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!props.results) return;
    if (props.tab === 'people') tabsRef.current?.scrollToEnd({ animated: true });
    else tabsRef.current?.scrollTo({ x: Math.max(0, (tabX.current[props.tab] ?? 0) - spacing.section), animated: true });
  }, [props.tab, props.results]);
  return (
    <Box
      className="absolute left-0 right-0"
      style={{ bottom: props.bottom, paddingHorizontal: gutter(width), gap: PX.ten, zIndex: 20 }}
      onLayout={(e) => props.onHeight?.(e.nativeEvent.layout.height)}
    >
      <Animated.View style={{ opacity: props.fadeIn, gap: PX.ten }}>
        {props.results ? (
          // F10 (fontscale2 F11, widths W9): at 200 % or 320 wide the five tabs are wider than the screen, so they scroll sideways (People and NEW stay reachable).
          <Box>
          <ScrollView
            ref={tabsRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onLayout={(e) => { const w = e.nativeEvent.layout.width; setRow((r) => (r.view === w ? r : { ...r, view: w })); }}
            onContentSizeChange={(w) => setRow((r) => (r.content === w ? r : { ...r, content: w }))}
            onScroll={(e) => { const x = e.nativeEvent.contentOffset.x; setRow((r) => (Math.abs(r.x - x) < 2 ? r : { ...r, x })); }}
            accessibilityRole="tablist"
            contentContainerStyle={{ gap: spacing.section, paddingHorizontal: spacing.hair / 2 }} style={{ flexGrow: 0 }}>
            {TABS.map((t) => {
              const on = props.tab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onLayout={(e) => { tabX.current[t.key] = e.nativeEvent.layout.x; }}
                  onPress={() => props.onTab(t.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t.label}
                  hitSlop={TAB_SLOP}
                  className="flex-row items-center"
                  style={{ paddingBottom: spacing.gap, borderBottomWidth: UNDERLINE, borderBottomColor: on ? colour.hot : 'transparent', gap: spacing.hair }}
                >
                  <Type step="compact" className={on ? 'text-text' : 'text-text2'} style={drawnType.searchTab} numberOfLines={1}>{t.label}</Type>
                  {t.isNew ? (
                    <Box className="bg-hot rounded-chip" style={{ paddingHorizontal: PX.six, paddingVertical: PX.three }}><Type step="badge" className="text-void">NEW</Type></Box>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
          {more ? (
            <LinearGradient
              colors={[colour.clear, colour.void]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              pointerEvents="none"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 32 }}
            />
          ) : null}
          </Box>
        ) : null}
        {props.results && showSinceChips(props.tab, props.nothing === true, props.since) ? (
          <Box className="flex-row" accessibilityRole="radiogroup" accessibilityLabel="Published" style={{ gap: PX.six }}>
            {SINCE.map((x) => {
              const on = props.since === x.key;
              return (
                <Pressable
                  key={x.key}
                  onPress={() => props.onSince(x.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`Published: ${x.label}`}
                  hitSlop={CHIP_SLOP}
                  className={`justify-center rounded-pill border ${on ? 'bg-text border-text' : 'bg-raise border-line'}`}
                  style={{ height: CHIP, paddingHorizontal: PX.ten }}
                >
                  <Type step="chip" className={on ? 'text-void' : 'text-text'} numberOfLines={1}>{x.label}</Type>
                </Pressable>
              );
            })}
          </Box>
        ) : null}
        {!typed ? <Type step="hero" className="text-text" accessibilityRole="header">Search</Type> : null}
      </Animated.View>
      <Box className="flex-row items-center" style={{ gap: PX.ten }}>
        <Animated.View
          ref={props.field.ref}
          collapsable={false}
          onLayout={props.field.onLayout}
          className={`flex-1 min-w-0 flex-row items-center bg-raise2 border-[1.5px] ${typed ? 'border-hot' : 'border-line'}`}
          style={[{ height: bars.field, borderRadius: radius.input, paddingHorizontal: PX.fourteen, gap: PX.ten }, props.field.style]}
        >
          <Icon name="search-outline" size={20} color={typed ? colour.text : colour.text3} />
          <Input className="flex-1 border-0 h-auto w-auto data-[focus=true]:web:ring-0" style={NO_PAD}>
            <InputField
              placeholder={props.placeholder}
              placeholderTextColor={colour.text3}
              autoCorrect={false}
              autoFocus={props.autoFocus}
              returnKeyType="search"
              value={props.term}
              onChangeText={props.onChangeText}
              onSubmitEditing={props.onSubmit}
              accessibilityLabel="Search podcasts"
              className="text-text text-pulse-body font-medium"
              style={[typeStyle('body'), NO_PAD]}
            />
          </Input>
          {typed ? (
            <Pressable onPress={props.onClear} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={spacing.row} className="items-center justify-center">
              <Icon name="close" size={18} color={colour.text3} />
            </Pressable>
          ) : (
            <Pressable onPress={props.onScan} accessibilityRole="button" accessibilityLabel="Scan a QR code" hitSlop={spacing.gap} className="items-center justify-center">
              <Icon name="scan-outline" size={22} color={colour.text} />
            </Pressable>
          )}
        </Animated.View>
        <Animated.View style={{ opacity: props.fadeIn }}>
          <Pressable onPress={props.onCancel} accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={spacing.row} className="justify-center" style={{ minHeight: bars.field }}>
            <Type step="row" className="text-hotText font-bold" numberOfLines={1}>Cancel</Type>
          </Pressable>
        </Animated.View>
      </Box>
    </Box>
  );
}
