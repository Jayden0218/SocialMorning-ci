// A sheet's tile: an icon on top, a name and a mono detail under it; light when on, ringed hot when outlined.
/**
 * M31 W3-D (design-pulse2 listen.html `stile`): 84 tall, radius 20, padding 12 / 14, raise fill (light
 * with void words when `on`); the icon in hot-text 22 top left; the name Geist 600 14, the detail mono
 * 11 under it in text3. Two to a row in `PulseTileGrid` (10 apart). The player's More sheet draws the
 * same tile (`PlayerMoreSheet`); the share sheet and other sheets use this one.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { player } from '@/design/tokens';
import { Icon, type IconName } from './Icon';
import { Type } from './Type';
import { useColours } from './useColours';

export function PulseTile(props: {
  icon: IconName;
  label: string;
  detail?: string;
  on?: boolean;
  outlined?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  onPress: () => void;
  /** A second action on a long-press (Add to queue: the front), named for a screen reader by `longPressLabel` (W3-A). */
  onLongPress?: () => void;
  longPressLabel?: string;
  /** A tile that is a setting and is on says so to a screen reader (the light fill is the sighted cue) (W3-A). */
  selected?: boolean;
  /** Takes the whole row (an odd last tile). */
  wide?: boolean;
}): React.ReactElement {
  const c = useColours();
  const on = props.on === true;
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      {...(props.accessibilityHint !== undefined ? { accessibilityHint: props.accessibilityHint } : {})}
      {...(props.selected !== undefined ? { accessibilityState: { selected: props.selected } } : {})}
      {...(props.onLongPress ? {
        onLongPress: props.onLongPress,
        accessibilityHint: `Long-press: ${props.longPressLabel ?? 'more'}`,
        accessibilityActions: [{ name: 'longpress', label: props.longPressLabel ?? 'More' }],
        onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => { if (e.nativeEvent.actionName === 'longpress') props.onLongPress?.(); },
      } : {})}
      className={`justify-between ${on ? 'bg-text' : 'bg-raise'}`}
      style={{ width: props.wide === true ? '100%' : '48.5%', height: player.tileHeight, borderRadius: player.panelRadius, paddingVertical: player.tilePadY, paddingHorizontal: player.tilePadX, borderWidth: props.outlined === true && !on ? player.tileOutline : 0, borderColor: c.hot }}
    >
      <Icon name={props.icon} size={player.tileIcon} color={on ? c.void : c.hotText} />
      <Box>
        <Type step="compact" className={on ? 'text-void' : 'text-text'} numberOfLines={1}>{props.label}</Type>
        {props.detail ? <Type step="mono" className={on ? 'text-void' : 'text-text3'} numberOfLines={2} style={{ fontSize: player.tileDetail, lineHeight: player.tileDetailLine, ...(on ? { color: player.tileOnDetail } : null) }}>{props.detail}</Type> : null}
      </Box>
    </Pressable>
  );
}

/** Tiles two to a row, `player.tileGap` (10) apart; an odd last tile takes the whole row. */
export function PulseTileGrid(props: { children: React.ReactNode }): React.ReactElement {
  return <Box className="flex-row flex-wrap justify-between" style={{ rowGap: player.tileGap }}>{props.children}</Box>;
}
