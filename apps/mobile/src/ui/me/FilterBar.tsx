/** The search box (and optional switch) above History and Favourites (M10, after the reference). */
import { Switch, Text, TextInput, View } from 'react-native';
import { useStores } from '../providers';
import { useColours } from '../useColours';
import { Icon } from '../Icon';

export function FilterBar(props: { term: string; onTerm: (t: string) => void; placeholder: string; toggle?: { label: string; value: boolean; onChange: (v: boolean) => void } }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <View className="gap-row pb-row">
      <View className="flex-row items-center bg-surface rounded-row px-row gap-2">
        <Icon name="search" size={18} color={c.muted} />
        <TextInput value={props.term} onChangeText={props.onTerm} placeholder={props.placeholder} placeholderTextColor={c.muted} autoCorrect={false}
          className="flex-1 py-row text-text text-sm" accessibilityLabel={props.placeholder} returnKeyType="search" />
      </View>
      {props.toggle ? (
        <View className="flex-row items-center justify-end gap-2">
          <Text className="text-muted text-xs">{props.toggle.label}</Text>
          <Switch value={props.toggle.value} onValueChange={props.toggle.onChange} trackColor={{ false: c.separator, true: c.primary }} thumbColor={c.background}
            accessibilityLabel={props.toggle.label} accessibilityRole="switch" accessibilityState={{ checked: props.toggle.value }} />
        </View>
      ) : null}
    </View>
  );
}
