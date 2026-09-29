/**
 * Rows for the settings pages (M10, owner 2026-09-27), after the reference: a one-colour
 * icon, the label, an optional muted value or line under it, then a chevron or a switch.
 */
import { Link } from 'expo-router';
import { Pressable } from '../lib/pressable';
import { Switch } from '../lib/switch';
import { Text } from '../lib/text';
import { Box } from '../lib/box';
import { colour, size } from '../../design';
import { useStores } from '../providers';
import { useColours } from '../useColours';
import { Icon, type IconName } from '../Icon';

/** M12 FR-050: one row height for every list (was hit.min + 8 = 56). */
const TAP = { minHeight: size.row };

function Body(props: { icon: IconName; label: string; line?: string; value?: string; danger?: boolean }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <>
      <Icon name={props.icon} size={24} color={c.accent} />
      <Box className="flex-1">
        <Text className={props.danger ? 'text-accent text-sm' : 'text-text text-sm'}>{props.label}</Text>
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
      <Pressable accessibilityRole="link" accessibilityLabel={spoken} className="flex-row items-center gap-section" style={TAP}>
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
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={spoken} className="flex-row items-center gap-section" style={TAP}>
      <Body {...props} />
      <Icon name="chevron-forward" size={18} color={c.muted} />
    </Pressable>
  );
}

export function SwitchRow(props: { icon: IconName; label: string; line?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <Box className="flex-row items-center gap-section py-row" style={TAP}>
      <Body icon={props.icon} label={props.label} {...(props.line ? { line: props.line } : {})} />
      <Switch
        value={props.value}
        onValueChange={props.onChange}
        disabled={props.disabled}
        trackColor={{ false: c.separator, true: c.primary }}
        thumbColor={c.background}
        accessibilityLabel={props.label}
        accessibilityRole="switch"
        accessibilityState={{ checked: props.value, disabled: props.disabled === true }}
      />
    </Box>
  );
}

export function Divider(): React.ReactElement {
  return <Box className="border-b-hairline border-separator my-row" />;
}
