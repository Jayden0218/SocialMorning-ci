// Tips you gave to shows; today says tipping is not available yet.
/**
 * Tips I gave (M12 FR-105): each tip's show, amount and date — store-verified purchases only.
 * Until the store setup (M10b) is done nothing can be bought, and the page says so.
 *
 * M17 (`Tips-B`, constitution v3.0.0): the page's name moves into the bar, small and centred;
 * an empty list is a tilted yellow tile with the heart, "No tips yet" as a large serif headline
 * and, while the store is not set up, the same "not available yet" sentence under it. Real tips
 * (none today) are white cards. Loading, the error line and the data are unchanged.
 */
import { useCallback, useEffect, useState } from 'react';
import { FlatList } from '@/ui/lib/flat-list';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { size } from '@/design';
import { Loader } from '@/ui/kit/Loader';
import { Icon } from '@/ui/kit/Icon';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { shortDate } from '@/ui/kit/format';
import { moneyLabel } from '@/me/money';
import { useM12Api, type Tip } from '@/social/m12-api';
import { PageHeader } from '@/ui/kit/PageHeader';

const ROW = { minHeight: size.row };
/** `Tips-B`: the tile leans 6° to the left. */
const TILT = { transform: [{ rotate: '-6deg' }] };
const NOT_READY = 'Tipping is not available yet. When it is, tips are paid through the App Store or Google Play.';
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: Tip[]; storeReady: boolean };

export default function TipsScreen(): React.ReactElement {
  const m12 = useM12Api();
  const stores = useStores();
  const c = useColours(stores.settings);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(() => { m12.tips().then((r) => setState({ kind: 'ok', ...r }), () => setState({ kind: 'error' })); }, [m12]);
  useEffect(() => { load(); }, [load]);
  const notReady = state.kind === 'ok' && !state.storeReady;
  return (
    <>
    <PageHeader middle={<Text className="flex-1 text-center text-muted text-body font-bold" accessibilityRole="header" numberOfLines={1}>Tips I gave</Text>} />
    <FlatList
      className="flex-1 bg-background"
      data={state.kind === 'ok' ? state.items : []}
      keyExtractor={(t) => t.id}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow"
      ListHeaderComponent={state.kind === 'ok' && !state.storeReady && state.items.length > 0 ? <Text className="text-muted text-xs mb-row">{NOT_READY}</Text> : undefined}
      ListEmptyComponent={state.kind === 'loading' ? <Loader className="my-section" /> : state.kind === 'error' ? <Text className="text-muted text-sm my-section">Couldn't load your tips right now.</Text> : (
        <Box className="pt-8 gap-section" accessible accessibilityLabel={notReady ? `No tips yet. ${NOT_READY}` : 'No tips yet'}>
          <Box className="w-36 h-36 rounded-artwork-lg bg-primary items-center justify-center ml-1" style={TILT}><Icon name="heart-outline" size={48} color={c.onPrimary} /></Box>
          <Text className="text-text text-display font-display-semibold mt-row">No tips yet</Text>
          {notReady ? <Text className="text-muted text-sm">{NOT_READY}</Text> : null}
        </Box>
      )}
      renderItem={({ item }) => (
        <Box className="flex-row items-center gap-row bg-surface border border-border rounded-row px-section py-row mb-gap" style={ROW} accessible accessibilityLabel={`${item.showTitle ?? 'A show'}, ${moneyLabel(item.amountMicros, item.currency)}, ${shortDate(Date.parse(item.createdAt))}`}>
          <Box className="flex-1">
            <Text className="text-text text-body font-display-semibold" numberOfLines={1}>{item.showTitle ?? item.feedUrl}</Text>
            <Text className="text-muted text-xs">{shortDate(Date.parse(item.createdAt))}</Text>
          </Box>
          <Text className="text-text text-body font-semibold">{moneyLabel(item.amountMicros, item.currency)}</Text>
        </Box>
      )}
    />
    </>
  );
}
