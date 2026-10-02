/** The search box (and optional switch) above History and Favourites (M10, after the reference). */
import { Input, InputField } from '../lib/input';
import { Toggle } from '../Toggle';
import { Text } from '../lib/text';
import { Box } from '../lib/box';
import { colour } from '../../design';
import { useStores } from '../providers';
import { useColours } from '../useColours';
import { Icon } from '../Icon';

export function FilterBar(props: { term: string; onTerm: (t: string) => void; placeholder: string; toggle?: { label: string; value: boolean; onChange: (v: boolean) => void } }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <Box className="gap-row pb-row">
      <Box className="flex-row items-center bg-surface rounded-row px-row gap-2">
        <Icon name="search" size={18} color={c.muted} />
        <Input className="flex-1 border-0 h-auto px-0 w-auto">
          <InputField value={props.term} onChangeText={props.onTerm} placeholder={props.placeholder} placeholderTextColor={c.muted} autoCorrect={false} accessibilityLabel={props.placeholder} returnKeyType="search"  className="py-row text-text text-sm" />
        </Input>
      </Box>
      {props.toggle ? (
        <Box className="flex-row items-center justify-end gap-2">
          <Text className="text-muted text-xs">{props.toggle.label}</Text>
          <Toggle value={props.toggle.value} onChange={props.toggle.onChange} label={props.toggle.label} />
        </Box>
      ) : null}
    </Box>
  );
}
