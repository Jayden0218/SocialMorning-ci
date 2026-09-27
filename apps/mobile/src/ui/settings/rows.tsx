/**
 * Rows for the settings pages (M10, owner 2026-09-27), after the reference: a one-colour
 * icon, the label, an optional muted value or line under it, then a chevron or a switch.
 */
import { Link } from 'expo-router';
import { Pressable, Switch, Text, View } from 'react-native';
import { colour, hit } from '../../design';
import { Icon, type IconName } from '../Icon';

const TAP = { minHeight: hit.min + 8 };

function Body(props: { icon: IconName; label: string; line?: string; value?: string; danger?: boolean }): React.ReactElement {
  return (
    <>
      <Icon name={props.icon} size={24} color={colour.accent} />
      <View className="flex-1">
        <Text className={props.danger ? 'text-accent text-sm' : 'text-text text-sm'}>{props.label}</Text>
        {props.line ? <Text className="text-muted text-xs mt-0.5">{props.line}</Text> : null}
      </View>
      {props.value ? <Text className="text-muted text-xs" numberOfLines={1}>{props.value}</Text> : null}
    </>
  );
}

export function LinkRow(props: { href: string; icon: IconName; label: string; line?: string; value?: string }): React.ReactElement {
  const spoken = [props.label, props.value, props.line].filter(Boolean).join(', ');
  return (
    <Link href={props.href as never} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={spoken} className="flex-row items-center gap-section" style={TAP}>
        <Body {...props} />
        <Icon name="chevron-forward" size={18} color={colour.muted} />
      </Pressable>
    </Link>
  );
}

export function ActionRow(props: { onPress: () => void; icon: IconName; label: string; line?: string; value?: string; danger?: boolean }): React.ReactElement {
  const spoken = [props.label, props.value, props.line].filter(Boolean).join(', ');
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={spoken} className="flex-row items-center gap-section" style={TAP}>
      <Body {...props} />
      <Icon name="chevron-forward" size={18} color={colour.muted} />
    </Pressable>
  );
}

export function SwitchRow(props: { icon: IconName; label: string; line?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }): React.ReactElement {
  return (
    <View className="flex-row items-center gap-section py-row" style={TAP}>
      <Body icon={props.icon} label={props.label} {...(props.line ? { line: props.line } : {})} />
      <Switch
        value={props.value}
        onValueChange={props.onChange}
        disabled={props.disabled}
        trackColor={{ false: colour.separator, true: colour.primary }}
        thumbColor={colour.background}
        accessibilityLabel={props.label}
        accessibilityRole="switch"
        accessibilityState={{ checked: props.value, disabled: props.disabled === true }}
      />
    </View>
  );
}

export function Divider(): React.ReactElement {
  return <View className="border-b-hairline border-separator my-row" />;
}
