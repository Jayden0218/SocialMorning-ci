/**
 * Tips I gave (M12 FR-105): each tip's show, amount and date — store-verified purchases only.
 * Until the store setup (M10b) is done nothing can be bought, and the page says so.
 */
import { useCallback, useEffect, useState } from 'react';
import { FlatList } from '../src/ui/lib/flat-list';
import { Text } from '../src/ui/lib/text';
import { Box } from '../src/ui/lib/box';
import { size } from '../src/design';
import { Loader } from '../src/ui/Loader';
import { EmptyPicture } from '../src/ui/me/parts';
import { shortDate } from '../src/ui/format';
import { moneyLabel } from '../src/me/money';
import { useM12Api, type Tip } from '../src/social/m12-api';
import { PageHeader } from '../src/ui/PageHeader';

const ROW = { minHeight: size.row };
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: Tip[]; storeReady: boolean };

export default function TipsScreen(): React.ReactElement {
  const m12 = useM12Api();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(() => { m12.tips().then((r) => setState({ kind: 'ok', ...r }), () => setState({ kind: 'error' })); }, [m12]);
  useEffect(() => { load(); }, [load]);
  return (
    <>
    <PageHeader title="Tips I gave" />
    <FlatList
      className="flex-1 bg-background"
      data={state.kind === 'ok' ? state.items : []}
      keyExtractor={(t) => t.id}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow"
      ListHeaderComponent={state.kind === 'ok' && !state.storeReady ? <Text className="text-muted text-xs mb-row">Tipping is not available yet. When it is, tips are paid through the App Store or Google Play.</Text> : undefined}
      ListEmptyComponent={state.kind === 'loading' ? <Loader className="my-section" /> : state.kind === 'error' ? <Text className="text-muted text-sm my-section">Couldn't load your tips right now.</Text> : <EmptyPicture icon="heart-outline" line="No tips yet" />}
      renderItem={({ item }) => (
        <Box className="flex-row items-center gap-row border-b-hairline border-separator" style={ROW} accessible accessibilityLabel={`${item.showTitle ?? 'A show'}, ${moneyLabel(item.amountMicros, item.currency)}, ${shortDate(Date.parse(item.createdAt))}`}>
          <Box className="flex-1">
            <Text className="text-text text-sm font-semibold" numberOfLines={1}>{item.showTitle ?? item.feedUrl}</Text>
            <Text className="text-muted text-xs">{shortDate(Date.parse(item.createdAt))}</Text>
          </Box>
          <Text className="text-text text-sm font-semibold">{moneyLabel(item.amountMicros, item.currency)}</Text>
        </Box>
      )}
    />
    </>
  );
}
