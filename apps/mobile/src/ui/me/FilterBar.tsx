/**
 * The search box (and optional switch) above History, Favourites and My subscriptions (M10,
 * after the reference).
 *
 * M17 (`History-B`, `Favourites-B`, `Subscriptions-B`): the box is a white pill with a thin
 * border, and History's "Only finished" switch becomes a two-choice pill track under it —
 * "All" / the toggle's label, the chosen one yellow — drawn here rather than by the shared
 * `Segmented`, so the screen's actions stay where the inventory has them. Same value, same
 * handler: choosing a tab calls `toggle.onChange(true | false)`.
 */
import { Input, InputField } from '../lib/input';
import { Pressable } from '../lib/pressable';
import { Text } from '../lib/text';
import { Box } from '../lib/box';
import { hit } from '../../design';
import { useStores } from '../providers';
import { useColours } from '../useColours';
import { Icon } from '../Icon';

const TAP = { minHeight: hit.min };

export function FilterBar(props: { term: string; onTerm: (t: string) => void; placeholder: string; toggle?: { label: string; value: boolean; onChange: (v: boolean) => void } }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const toggle = props.toggle;
  return (
    <Box className="gap-row pb-row">
      <Box className="flex-row items-center bg-surface border border-border rounded-pill px-row gap-2 min-h-12">
        <Icon name="search" size={18} color={c.muted} />
        <Input className="flex-1 border-0 h-auto px-0 w-auto">
          <InputField value={props.term} onChangeText={props.onTerm} placeholder={props.placeholder} placeholderTextColor={c.muted} autoCorrect={false} accessibilityLabel={props.placeholder} returnKeyType="search"  className="py-row text-text text-body" />
        </Input>
      </Box>
      {toggle ? (
        <Box className="flex-row gap-1 p-1 bg-surface border border-border rounded-pill" accessibilityRole="tablist">
          {[false, true].map((v) => {
            const on = toggle.value === v;
            const label = v ? toggle.label : 'All';
            return (
              <Pressable key={label} onPress={() => toggle.onChange(v)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}
                className={`flex-1 rounded-pill items-center justify-center ${on ? 'bg-primary' : ''}`} style={TAP}>
                <Text className={on ? 'text-onPrimary text-meta font-bold' : 'text-muted text-meta font-medium'}>{label}</Text>
              </Pressable>
            );
          })}
        </Box>
      ) : null}
    </Box>
  );
}
