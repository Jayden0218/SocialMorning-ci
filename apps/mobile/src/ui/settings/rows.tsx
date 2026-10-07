// Settings rows: icon, label, optional value, then an arrow or switch.
/**
 * Rows for the settings pages (M10, owner 2026-09-27), after the reference: a one-colour
 * icon, the label, an optional muted value or line under it, then a chevron or a switch.
 * M17: Editorial sizes; they sit inside a `Card`.
 * M24 US18 (design-settings G8, `SettingsMore-B`): 24 pt icon, label 14 / weight 500, chevron 18,
 * 6 pt above and below inside the 50 pt row (a switch row had 12). The B cards draw no hairline
 * between rows — pages drop `CardDivider` between these rows.
 */
import { Link } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Toggle } from '@/ui/kit/Toggle';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { colour, size } from '@/design';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { Icon, type IconName } from '@/ui/kit/Icon';

/** M12 FR-050: one row height for every list (was hit.min + 8 = 56). */
const TAP = { minHeight: size.row };

function Body(props: { icon: IconName; label: string; line?: string; value?: string; danger?: boolean }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <>
      <Icon name={props.icon} size={24} color={c.accent} />
      <Box className="flex-1">
        <Text className={props.danger ? 'text-accent text-body font-medium' : 'text-text text-body font-medium'}>{props.label}</Text>
        {props.line ? <Text className="text-muted text-xs mt-0.5">{props.line}</Text> : null}
      </Box>
      {props.value ? <Text className="text-muted text-xs" numberOfLines={1}>{props.value}</Text> : null}
    </>
  );
}

export function LinkRow(props: { href: string; icon: IconName; label: string; line?: string; value?: string }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const spoken = [props.label, props.value, props.line].filter(Boolean).join(', ');
  return (
    <Link href={props.href as never} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={spoken} className="flex-row items-center gap-section py-1.5" style={TAP}>
        <Body {...props} />
        <Icon name="chevron-forward" size={18} color={c.muted} />
      </Pressable>
    </Link>
  );
}

export function ActionRow(props: { onPress: () => void; icon: IconName; label: string; line?: string; value?: string; danger?: boolean }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const spoken = [props.label, props.value, props.line].filter(Boolean).join(', ');
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={spoken} className="flex-row items-center gap-section py-1.5" style={TAP}>
      <Body {...props} />
      <Icon name="chevron-forward" size={18} color={c.muted} />
    </Pressable>
  );
}

export function SwitchRow(props: { icon: IconName; label: string; line?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }): React.ReactElement {
  return (
    <Box className="flex-row items-center gap-section py-1.5" style={TAP}>
      <Body icon={props.icon} label={props.label} {...(props.line ? { line: props.line } : {})} />
      {/* M16a T004: the app's own toggle, not the iOS switch. */}
      <Toggle value={props.value} onChange={props.onChange} label={props.label} {...(props.disabled !== undefined ? { disabled: props.disabled } : {})} />
    </Box>
  );
}

export function Divider(): React.ReactElement {
  // M12 FR-051: 16 pt between sections (8 + 8 around the hairline; was 12 + 12).
  return <Box className="border-b-hairline border-separator my-2" />;
}
