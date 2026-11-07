// The Settings pages' shared parts in the Pulse shape: the page body, a section with its edge label, a row, a large tile.
/**
 * M31 S-A (T060; design-pulse2 `settings.html` helpers `body`, `sec`, `row`, `big`, `tile`, `lede`, `fieldL`). One file so the
 * pages that follow the Panel / Mosaic pattern read the same numbers (`hub-measures.ts`):
 *   - `SetPage`   the scrolling body under a `PushedPage`: 14 under the status bar, a 28 lane on the left (16 when a page has no
 *                 edge lane), 16 on the right, 12 between parts, room at the foot for the title bar.
 *   - `Sec`       one section; its name is written vertically in the lane (`EdgeLabel`).
 *   - `SetRow`    a row of a group: icon 22, name Geist 600 15, an optional line (13, text2), a chevron / switch / words at the end.
 *                 It is a `Pressable` when it has an `onPress` (a `<Link asChild>` hands it one), a plain box when it does not.
 *   - `SetCard`   a raise tile (radius 22, padding 16, 10 between its parts).
 *   - `BigTile`   a large tile (112 tall, radius 22): icon top left, a chevron or a switch top right, name and a mono state under.
 *                 ON = the tinted wash with a hot ring. `BigGrid` lays them two to a row, an odd last one on the left.
 *   - `Lede`, `Caps`, `FieldLabel`, `Note`  the page's words.
 * The group itself is `PanelGroup` (src/ui/me/Panel.tsx). Nothing here owns an action: a page writes its own `Link` / `Pressable` /
 * `Toggle` so the action inventory finds it in the page's file.
 */
import { Children, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { Animated } from 'react-native';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, motion } from '@/design';
import { settingsColour } from '@/design/tokens';
import { drawnType } from '@/design/type-px';
import type { PushedLayout } from '@/ui/kit/PushedPage';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { useReducedMotion } from '@/ui/kit/useReducedMotion';
import { SET, SET_TYPE } from './hub-measures';

/** The page body: scrolls under the fade, leaves room for the title bar. */
export function SetPage(props: { layout: PushedLayout; children: ReactNode; lane?: boolean; gap?: number; testID?: string; keyboard?: boolean }): React.ReactElement {
  return (
    <ScrollView
      className="flex-1"
      testID={props.testID ?? 'set-page'}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: props.layout.top + SET.top, paddingBottom: props.layout.reserve, paddingLeft: props.lane === false ? SET.side : SET.lane, paddingRight: props.lane === false ? SET.side : SET.right, gap: props.gap ?? SET.gap }}
    >
      {props.children}
    </ScrollView>
  );
}

/** A section: the children, with the name written along the lane to their left. */
export function Sec(props: { label?: string; spoken?: string; children: ReactNode; testID?: string }): React.ReactElement {
  // M31 F8: the section is at least as tall as its turned label, or the next label starts inside it (Settings > More).
  const [len, setLen] = useState(0);
  return (
    <Box testID={props.testID ?? 'set-sec'} style={props.label && len > 0 ? { minHeight: len + SET.edgeTop } : undefined}>
      {props.label ? <EdgeLabel label={props.label} {...(props.spoken ? { spoken: props.spoken } : {})} top={SET.edgeTop} left={6 - SET.lane} onLength={setLen} /> : null}
      {props.children}
    </Box>
  );
}

type PressProps = Omit<ComponentProps<typeof Pressable>, 'children'>;

/** A row of a `PanelGroup`. `right`: `'chevron'` (default), nothing (`null`), or any node (a switch, a pill, words). */
export function SetRow({ icon, label, line, right, hot, dim, mono, sub, ...rest }: { icon?: IconName; label: string; line?: string; right?: ReactNode | 'chevron' | null; hot?: boolean; dim?: boolean; mono?: boolean; sub?: ReactNode } & PressProps): React.ReactElement {
  const tail = right === undefined || right === 'chevron' ? <Icon name="chevron-forward" size={SET.chevron} color={colour.text3} /> : right;
  const body = (
    <>
      {icon ? <Icon name={icon} size={SET.rowIcon} color={hot ? colour.hotText : colour.text} /> : null}
      <Box className="flex-1 min-w-0">
        {mono ? (
          <Type step="mono" className="text-text" style={SET_TYPE.mono14} numberOfLines={1}>{label}</Type>
        ) : (
          <Type step="row" className={hot ? 'text-hotText' : 'text-text'}>{label}</Type>
        )}
        {line ? <Type step="caption" className="text-text2" style={mono ? SET_TYPE.mono11 : [SET_TYPE.line13, { marginTop: SET.lineGap }]}>{line}</Type> : null}
        {sub}
      </Box>
      {tail}
    </>
  );
  const look = { minHeight: SET.rowMin, paddingHorizontal: SET.rowPadX, paddingVertical: SET.rowPadY, gap: SET.rowGap, opacity: dim ? 0.45 : 1 };
  if (typeof rest.onPress === 'function') {
    return <Pressable accessibilityRole="button" accessibilityLabel={label} {...rest} className="flex-row items-center" style={look}>{body}</Pressable>;
  }
  // No press (a switch row, a row inside a `Link` that has not handed one down): a name given by the caller still makes it one spoken item.
  return <Box testID="set-row" className="flex-row items-center" style={look} {...(typeof rest.accessibilityLabel === 'string' ? { accessible: true, accessibilityLabel: rest.accessibilityLabel } : {})}>{body}</Box>;
}

/** A raise tile: the page's one-off groups of words, fields and buttons. */
export function SetCard(props: { children: ReactNode; wash?: boolean; testID?: string; gap?: number }): React.ReactElement {
  return (
    <Box
      testID={props.testID ?? 'set-card'}
      className={props.wash === true ? '' : 'bg-raise'}
      style={{ borderRadius: SET.radius, padding: SET.tilePad, gap: props.gap ?? SET.tileGap, ...(props.wash === true ? { backgroundColor: settingsColour.wash, borderWidth: 1, borderColor: settingsColour.ring } : null) }}
    >
      {props.children}
    </Box>
  );
}

/**
 * A large tile. `state` is the mono line under the name; `on` (true / false) is a switch tile and `right` is its switch (the page
 * writes the `Toggle`); `on` left out is a link tile with a chevron. A tile with `light` is the white one (Send feedback).
 */
export function BigTile({ icon, label, state, on, right, dim, light, line, plain, ...rest }: { icon: IconName; label: string; state?: string; on?: boolean; right?: ReactNode; dim?: boolean; light?: boolean; line?: string; /** No chevron: the tile is an action, not a page (Help's two tiles). */ plain?: boolean } & PressProps): React.ReactElement {
  const lit = on === true;
  const ink = light === true ? 'text-void' : 'text-text';
  const body = (
    <>
      <Box className="flex-row justify-between items-start">
        <Icon name={icon} size={SET.bigIcon} color={light === true ? colour.void : lit ? colour.hotText : colour.text} />
        {right !== undefined ? right : on === undefined && light !== true && plain !== true ? <Icon name="chevron-forward" size={SET.chevron} color={colour.text3} /> : null}
      </Box>
      <Box>
        <Type step="row" className={ink} numberOfLines={2}>{label}</Type>
        {state ? <Type step="mono" className={lit ? 'text-hotText' : 'text-text3'} style={[SET_TYPE.mono12, { marginTop: 4 }]} numberOfLines={2}>{state}</Type> : null}
        {line ? <Type step="caption" className={light === true ? 'text-void' : 'text-text2'} style={[SET_TYPE.line12, { marginTop: 3, opacity: light === true ? 0.7 : 1 }]}>{line}</Type> : null}
      </Box>
    </>
  );
  const look = {
    flex: 1, minWidth: 0, minHeight: SET.bigMin, borderRadius: SET.radius, padding: SET.bigPad, gap: SET.bigGap, justifyContent: 'space-between' as const, opacity: dim ? 0.45 : 1,
    ...(light === true ? { backgroundColor: colour.text } : lit ? { backgroundColor: settingsColour.wash, borderWidth: 1, borderColor: settingsColour.ring } : { backgroundColor: colour.raise }),
  };
  if (typeof rest.onPress === 'function') {
    return <Pressable accessibilityRole="button" accessibilityLabel={label} {...rest} style={look}>{body}</Pressable>;
  }
  return <Box testID="big-tile" style={look} {...(typeof rest.accessibilityLabel === 'string' ? { accessible: true, accessibilityLabel: rest.accessibilityLabel } : {})}>{body}</Box>;
}

/** Large tiles two to a row, an odd last one on the left with an empty half beside it. */
export function BigGrid(props: { children: ReactNode }): React.ReactElement {
  const items = Children.toArray(props.children);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <Box testID="big-grid" style={{ gap: SET.bigGap }}>
      {rows.map((r, i) => (
        <Box key={i} className="flex-row" style={{ gap: SET.bigGap }}>
          {r}
          {r.length === 1 ? <Box style={{ flex: 1, minWidth: 0 }} /> : null}
        </Box>
      ))}
    </Box>
  );
}

/** The page's lede: Geist 15 / 22 in text2 (or 14 in a smaller page). */
export function Lede(props: { children: ReactNode; small?: boolean; strong?: boolean; testID?: string }): React.ReactElement {
  return (
    <Type step="body" className={props.strong === true ? 'text-text font-semibold' : 'text-text2'} style={props.small === true ? SET_TYPE.note14 : SET_TYPE.lede15} testID={props.testID ?? 'set-lede'}>
      {props.children}
    </Type>
  );
}

/** A small line under a tile or a field: Geist 12 / 17 in text2. */
export function Note(props: { children: ReactNode; hot?: boolean; centre?: boolean; testID?: string }): React.ReactElement {
  return <Type step="caption" className={`${props.hot === true ? 'text-hotText' : 'text-text2'} ${props.centre === true ? 'text-center' : ''}`} style={SET_TYPE.line12} testID={props.testID ?? 'set-note'}>{props.children}</Type>;
}

/** Mono caps: `.cap`, 11 at 0.08 em, text3 (hotText when `hot`). */
export function Caps(props: { children: string; hot?: boolean }): React.ReactElement {
  return <Type step="tag" className={props.hot === true ? 'text-hotText' : 'text-text3'} style={drawnType.trackEyebrow} accessibilityRole="header">{props.children.toUpperCase()}</Type>;
}

/** A field with its caps label above: the label, then the field box (48, radius 18, raise2) holding the page's `InputField`. */
export function FieldLabel(props: { label: string; children: ReactNode; ring?: boolean; dim?: boolean; testID?: string }): React.ReactElement {
  return (
    <Box style={{ gap: 6, opacity: props.dim === true ? 0.6 : 1 }}>
      <Caps>{props.label}</Caps>
      <Box testID={props.testID ?? 'set-field'} className="bg-raise2 justify-center" style={{ minHeight: 48, borderRadius: 18, paddingHorizontal: 14, ...(props.ring === true ? { borderWidth: 1.5, borderColor: colour.hot } : null) }}>
        {props.children}
      </Box>
    </Box>
  );
}

/**
 * A small button inside a tile or a row. `pill` (default): raise-2, 40 tall (36 with `small`), words 600 13 — `btn quiet` on a raise tile;
 * the touch reaches 48 by `hitSlop`. `link`: hot-text words (Manage downloads ›, Change), 48 tall. Takes a `<Link asChild>`'s press.
 */
export function SetButton({ label, kind, small, hot, ...rest }: { label: string; kind?: 'pill' | 'link'; small?: boolean; hot?: boolean } & PressProps): React.ReactElement {
  if (kind === 'link') {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} {...rest} className="justify-center" style={{ minHeight: 48, flexShrink: 1 }}>
        <Type step="row" className="text-hotText">{label}</Type>
      </Pressable>
    );
  }
  const h = small === true ? SET.pill : SET.pill40;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: Math.ceil((48 - h) / 2), bottom: Math.ceil((48 - h) / 2) }}
      {...rest}
      className="bg-raise2 rounded-pill items-center justify-center self-start"
      style={{ height: h, paddingHorizontal: SET.pillPad }}
    >
      <Type step="caption" className={hot === true ? 'text-hotText font-semibold' : 'text-text font-semibold'} numberOfLines={1}>{label}</Type>
    </Pressable>
  );
}

/** Loading: the drawing's `ghost(n)` — raise-2 bars (every third one a 64 tall card), breathing; still with Reduce Motion. */
export function GhostLines(props: { rows?: number }): React.ReactElement {
  const still = useReducedMotion();
  const [o] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (still) { o.setValue(1); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 0.5, duration: motion.breathe / 2, useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: motion.breathe / 2, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [still, o]);
  const widths = [100, 70, 88, 100, 60];
  return (
    <Box testID="ghost-lines" style={{ gap: SET.rowGap }} accessible={false} importantForAccessibility="no-hide-descendants">
      {Array.from({ length: props.rows ?? 5 }, (_, k) => (
        <Animated.View key={k} style={{ height: k % 3 === 0 ? 64 : 14, width: `${widths[k % 5]}%`, borderRadius: k % 3 === 0 ? 18 : 7, backgroundColor: colour.raise2, opacity: o }} />
      ))}
    </Box>
  );
}
