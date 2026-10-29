// A Panel row on a sheet: icon, name, an optional detail and a chevron, 56 tall, inside a PanelGroup; this is the kit's RowButton (no separate part).
/**
 * M31 W3-D (design-pulse2 `group([[icon, name, detail, 'chev']])`, e.g. lists--more-sheet "Report this
 * list", states--needs-long-press "Share lines"): 56 tall, 14 of padding, the icon in hot-text 20, the name
 * Geist 600 15, the detail text3 mono 11 under or beside it, a chevron at the end. `danger` draws the
 * name in hot-text (Report, Delete). Put rows in `PanelGroup` (`ui/me/Panel`) for the raise tile and the rules.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { player } from '@/design/tokens';
import { Icon, type IconName } from './Icon';
import { Type } from './Type';
import { useColours } from './useColours';

export function PanelRow(props: { icon: IconName; label: string; detail?: string; danger?: boolean; chevron?: boolean; accessibilityLabel?: string; onPress: () => void }): React.ReactElement {
  const c = useColours();
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={props.accessibilityLabel ?? props.label} className="flex-row items-center" style={{ minHeight: player.panelRow, paddingHorizontal: player.panelPad, gap: player.panelGap }}>
      <Icon name={props.icon} size={20} color={c.hotText} />
      <Box className="flex-1">
        <Type step="row" className={props.danger === true ? 'text-hotText' : 'text-text'} numberOfLines={1}>{props.label}</Type>
        {props.detail ? <Type step="tag" className="text-text3" numberOfLines={2}>{props.detail}</Type> : null}
      </Box>
      {props.chevron === false ? null : <Icon name="chevron-forward" size={16} color={c.text3} />}
    </Pressable>
  );
}
