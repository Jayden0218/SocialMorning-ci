// Search box above History, Favourites, Subscriptions; History's "Only finished" choice.
/**
 * The search box (and optional switch) above History, Favourites and My subscriptions (M10,
 * after the reference).
 *
 * M17 (`History-B`, `Favourites-B`, `Subscriptions-B`): the box is a white pill with a thin
 * border, and History's "Only finished" switch becomes a two-choice pill track under it —
 * "All" / the toggle's label, the chosen one yellow (M24: the shared `Segmented`). Same value, same
 * handler: choosing a tab calls `toggle.onChange(true | false)`.
 */
import { Input, InputField } from '@/ui/lib/input';
import { Box } from '@/ui/lib/box';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { Icon } from '@/ui/kit/Icon';
import { Segmented } from '@/ui/kit/Segmented';

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
        // M24 US20: the kit's Segmented (B's beige #f1ebdd track, chosen yellow) — same two
        // choices, same handler: choosing a tab calls `toggle.onChange(true | false)`.
        <Segmented
          items={[{ value: 'all', label: 'All' }, { value: 'on', label: toggle.label }]}
          value={toggle.value ? 'on' : 'all'}
          onChange={(v) => toggle.onChange(v === 'on')}
        />
      ) : null}
    </Box>
  );
}
