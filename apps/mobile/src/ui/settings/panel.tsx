// The Settings pages' Panel parts: the page, a labelled section, a tile, group rows and the large switch tile.
/**
 * M31 S-B (T060 part 2; design-pulse2 `settings.html` helpers `page`, `sec`, `tile`, `row`, `group`, `big`, `bigs`): the parts every
 * settings page from Network to Widgets is built from, so they are drawn once.
 *  - `SettingsPage`: a `Page` (Back + title, 20 gutter, 24 between blocks); `foot` puts the page's buttons under the title.
 *  - `Section`: a block under the kit Section's heading (or unnamed).
 *  - `Tile`: raise, radius 22, 16 of padding, 10 between its parts.
 *  - `Row` / `SwitchRow` / `LinkRow`: a group row (56 tall, 16 of padding, a tinted 34 icon tile, the name Geist 600 15, the line Geist 400 13 in
 *    text-2, the switch or a chevron at the end) for `PanelGroup`.
 *  - `BigSwitch`: the large 2-column switch tile (112 tall, icon 24 and the switch on top, the name and a mono state below; on = the
 *    warm fill with a hot ring and hot-text state).
 *  - `QuietPill`: the raise-2 pill inside a tile (Restore, Unmute, Email me a link), its tap area 48 by `hitSlop`.
 *  - `SettingsSegment`: the two-way track (raise-2, 4 / 4, radius 18; the chosen choice light).
 * Same names and handlers as the rows they replace (`rows.tsx` keeps the older look for pages not redrawn yet).
 */
import { useContext, type ReactNode } from 'react';
import { Link } from 'expo-router';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, hit, spacing } from '@/design';
import { player, settingsColour } from '@/design/tokens';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { goBack } from '@/ui/kit/PageHeader';
import { IconButton } from '@/ui/kit/PulseButton';
import { Toggle } from '@/ui/kit/Toggle';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { Page, Section as PageSection } from '@/ui/kit/layout';
import { useToastPlacement } from '@/ui/shell/toastPlacement';
import { SET, SET_TYPE } from './measures';

/**
 * Spec 039 (List lane): a settings page is a `Page` (Back + title, the 20 gutter, 24 between blocks, a clear foot); a labelled `Section` is the
 * kit Section's heading above its block (no edge label, nothing sideways); a group row is 56 tall with a tinted icon, the name, a line and a chevron.
 */

/** A settings page: Back + title, an optional line and row of buttons under the title, then the blocks. */
export function SettingsPage(props: {
  title: string;
  subtitle?: string;
  /** No longer drawn differently (kept so callers need not change): a long title wraps on the title row. */
  size?: number;
  /** No longer used: there is no edge-label lane. */
  lane?: boolean;
  /** The buttons under the title (`SET.footButton` tall). */
  foot?: ReactNode;
  /** Drawn under the title and its line (a small eyebrow, a field). */
  extra?: ReactNode;
  /** Replaces the default Back (a page that opens a detail inside itself). */
  onBack?: () => void;
  children: ReactNode;
  testID?: string;
}): React.ReactElement {
  const insets = useContext(SafeAreaInsetsContext);
  const placed = useToastPlacement();
  // The root layout pads the home strip once (guard G-T1), so Page pads none of it.
  const own = { top: insets?.top ?? 0, bottom: 0, left: insets?.left ?? 0, right: insets?.right ?? 0 };
  return (
    <SafeAreaInsetsContext.Provider value={own}>
      <Page title={props.title} now={placed.now} leading={<IconButton icon="chevron-back" label="Back" onPress={props.onBack ?? goBack} fill size={22} />}>
        <Box testID={props.testID ?? 'settings-scroll'} style={{ gap: spacing.block }}>
          {props.subtitle ? <Type step="caption" className="text-text2" numberOfLines={2}>{props.subtitle}</Type> : null}
          {props.extra ?? null}
          {props.foot ? <Box testID="settings-foot" style={{ gap: SET.footGap }}>{props.foot}</Box> : null}
          {props.children}
        </Box>
      </Page>
    </SafeAreaInsetsContext.Provider>
  );
}

/** A block of the page; with a `label` the kit Section's heading sits above it. */
export function Section(props: { label?: string; spoken?: string; children: ReactNode; testID?: string; style?: React.ComponentProps<typeof Box>['style'] }): React.ReactElement {
  if (props.label) {
    return (
      <Box testID={props.testID} style={props.style}>
        <PageSection title={props.label}>{props.children}</PageSection>
      </Box>
    );
  }
  return <Box testID={props.testID} style={props.style}>{props.children}</Box>;
}

/** The raise tile: radius 22, 16 of padding, 10 between its parts. */
export function Tile(props: { children: ReactNode; testID?: string; style?: React.ComponentProps<typeof Box>['style']; accessibilityLabel?: string; accessible?: boolean }): React.ReactElement {
  return (
    <Box testID={props.testID} className="bg-raise" accessible={props.accessible} accessibilityLabel={props.accessibilityLabel} style={[{ borderRadius: SET.radius, padding: SET.tilePad, gap: SET.tileGap }, props.style]}>
      {props.children}
    </Box>
  );
}

/** The lede line of a page: Geist 400 14 / 22 in text-2. */
export function Lede(props: { children: ReactNode }): React.ReactElement {
  return <Section><Type step="body" className="text-text2 font-normal" style={SET_TYPE.lede}>{props.children}</Type></Section>;
}

/** A line of Geist 400 13 / 18 in text-2 (a row's line). */
export function Line(props: { children: ReactNode; testID?: string; numberOfLines?: number; className?: string }): React.ReactElement {
  return <Type step="caption" className={`text-text2 font-normal ${props.className ?? ''}`} numberOfLines={props.numberOfLines} testID={props.testID}>{props.children}</Type>;
}

function RowBody(props: { icon?: IconName; label: string; line?: string; danger?: boolean; hot?: boolean; right?: ReactNode; chevron?: boolean }): React.ReactElement {
  const c = useColours();
  return (
    <>
      {props.icon ? (
        <Box className="items-center justify-center" style={{ width: player.panelIcon, height: player.panelIcon, borderRadius: player.panelIconRadius, backgroundColor: colour.accentTint }} accessible={false} importantForAccessibility="no-hide-descendants">
          <Icon name={props.icon} size={player.panelIconGlyph} color={c.hotText} />
        </Box>
      ) : null}
      <Box className="flex-1" style={{ minWidth: 0 }}>
        <Type step="row" className={props.danger ? 'text-hotText' : 'text-text'}>{props.label}</Type>
        {props.line ? <Box style={{ marginTop: SET.rowLineGap }}><Line>{props.line}</Line></Box> : null}
      </Box>
      {props.right}
      {props.chevron ? <Icon name="chevron-forward" size={SET.rowChevron} color={c.text3} /> : null}
    </>
  );
}

const ROW = { minHeight: player.panelRow, paddingHorizontal: spacing.section, paddingVertical: spacing.gap, gap: spacing.row };
const ROW_FLEX = 'flex-row items-center';
/** A link row is never under 48 to the finger (a row is 56). */
const LINK_ROW = { ...ROW, minHeight: Math.max(player.panelRow, hit.min) };

/** A group row that is a plain display (a value at its end, nothing to tap). */
export function Row(props: { icon?: IconName; label: string; line?: string; right?: ReactNode; danger?: boolean; testID?: string; accessibilityLabel?: string }): React.ReactElement {
  return (
    <Box testID={props.testID} className={ROW_FLEX} style={ROW} {...(props.accessibilityLabel ? { accessible: true, accessibilityLabel: props.accessibilityLabel } : {})}>
      <RowBody {...props} />
    </Box>
  );
}

/** A group row with a switch at its end. */
export function SwitchRow(props: { icon?: IconName; label: string; line?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; testID?: string }): React.ReactElement {
  return (
    <Box testID={props.testID} className={ROW_FLEX} style={ROW}>
      <RowBody {...(props.icon ? { icon: props.icon } : {})} label={props.label} {...(props.line ? { line: props.line } : {})} />
      <Toggle value={props.value} onChange={props.onChange} label={props.label} {...(props.disabled !== undefined ? { disabled: props.disabled } : {})} />
    </Box>
  );
}

/** A group row that opens a page. */
export function LinkRow(props: { href: string; icon?: IconName; label: string; line?: string; value?: string; right?: ReactNode; testID?: string; accessibilityValue?: string }): React.ReactElement {
  const spoken = [props.label, props.value, props.line].filter(Boolean).join(', ');
  return (
    <Link href={props.href as never} asChild>
      <Pressable testID={props.testID} accessibilityRole="link" accessibilityLabel={spoken} {...(props.accessibilityValue ? { accessibilityValue: { text: props.accessibilityValue } } : {})} className={ROW_FLEX} style={LINK_ROW}>
        <RowBody {...(props.icon ? { icon: props.icon } : {})} label={props.label} {...(props.line ? { line: props.line } : {})} right={props.right ?? (props.value ? <Type step="mono" className="text-text">{props.value}</Type> : undefined)} chevron />
      </Pressable>
    </Link>
  );
}

/** The large 2-column switch tile. `state` is the mono line under the name. */
export function BigSwitch(props: { icon: IconName; label: string; state: string; on: boolean; onChange: (v: boolean) => void; dim?: boolean; disabled?: boolean; testID?: string }): React.ReactElement {
  const c = useColours();
  return (
    <Box
      testID={props.testID}
      style={[
        { flex: 1, minWidth: 0, minHeight: SET.bigMin, borderRadius: SET.radius, padding: SET.bigPad, gap: SET.bigGap, justifyContent: 'space-between', backgroundColor: props.on ? settingsColour.wash : colour.raise, opacity: props.dim === true ? 0.45 : 1 },
        props.on ? { borderWidth: 1, borderColor: settingsColour.ring } : null,
      ]}
    >
      <Box className="flex-row items-start justify-between">
        <Icon name={props.icon} size={SET.bigIcon} color={props.on ? c.hotText : c.text} />
        <Toggle value={props.on} onChange={props.onChange} label={props.label} {...(props.disabled !== undefined ? { disabled: props.disabled } : {})} />
      </Box>
      <Box>
        <Type step="row" className="text-text">{props.label}</Type>
        <Type step="mono" className={props.on ? 'text-hotText' : 'text-text3'} style={[SET_TYPE.state, { marginTop: SET.bigStateGap }]}>{props.state}</Type>
      </Box>
    </Box>
  );
}

/** Large tiles two to a row, `SET.tilesGap` apart; an odd last tile keeps its half. */
export function BigGrid(props: { children: ReactNode; testID?: string }): React.ReactElement {
  const tiles = (Array.isArray(props.children) ? props.children : [props.children]).flat().filter((t) => t != null && t !== false) as ReactNode[];
  const rows: ReactNode[][] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));
  return (
    <Box testID={props.testID} style={{ gap: SET.tilesGap }}>
      {rows.map((r, i) => (
        <Box key={i} className="flex-row" style={{ gap: SET.tilesGap }}>
          {r}
          {r.length === 1 ? <Box style={{ flex: 1 }} /> : null}
        </Box>
      ))}
    </Box>
  );
}

/** The raise-2 pill inside a tile; drawn `height` tall, 14 of padding, Geist 600 13; the tap area reaches 48. */
export function QuietPill(props: { label: string; onPress: (() => void) | undefined; height?: number; accessibilityLabel?: string; disabled?: boolean; busy?: boolean; testID?: string; alignSelf?: 'flex-start' }): React.ReactElement {
  const h = props.height ?? SET.pillRestore;
  const slop = Math.max(0, Math.ceil((hit.min - h) / 2));
  return (
    <Pressable
      testID={props.testID}
      onPress={props.disabled === true || props.busy === true ? undefined : props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityState={{ disabled: props.disabled === true, busy: props.busy === true }}
      hitSlop={{ top: slop, bottom: slop }}
      className={`rounded-pill items-center justify-center ${props.disabled === true ? 'opacity-40' : 'active:opacity-85'}`}
      style={[{ height: h, minHeight: hit.min, paddingHorizontal: SET.pillPad, backgroundColor: colour.raise2 }, props.alignSelf ? { alignSelf: props.alignSelf } : null]}
    >
      <Type step="caption" className="text-text font-semibold" numberOfLines={1}>{props.label}</Type>
    </Pressable>
  );
}

/** The two- or three-way track of a settings page. Spoken as tabs; each choice reaches 48 to touch. */
export function SettingsSegment<T extends string>(props: { items: readonly { value: T; label: string; accessibilityLabel?: string }[]; value: T; onChange: (v: T) => void }): React.ReactElement {
  return (
    <Box testID="settings-segment" accessibilityRole="tablist" className="flex-row" style={{ backgroundColor: colour.raise2, borderRadius: SET.segRadius, padding: SET.segPad, gap: SET.segPad }}>
      {props.items.map((it) => {
        const on = it.value === props.value;
        return (
          <Pressable
            key={it.value}
            onPress={() => props.onChange(it.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={it.accessibilityLabel ?? it.label}
            hitSlop={{ top: 6, bottom: 6 }}
            className={`flex-1 items-center justify-center ${on ? 'bg-text' : ''}`}
            style={{ height: SET.segChoice, borderRadius: SET.segChoiceRadius }}
          >
            <Type step="caption" className={on ? 'text-void font-semibold' : 'text-text2 font-semibold'} numberOfLines={1}>{it.label}</Type>
          </Pressable>
        );
      })}
    </Box>
  );
}
