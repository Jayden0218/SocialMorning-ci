/**
 * Wallet (M12 FR-106): your App Store / Google Play purchases, read only. SocialNet holds no
 * balance and takes no money itself; managing or cancelling a subscription happens in the
 * store, which the button opens. Until the store setup (M10b) is done the list is empty.
 */
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { FlatList } from '../src/ui/lib/flat-list';
import { Text } from '../src/ui/lib/text';
import { Box } from '../src/ui/lib/box';
import { size } from '../src/design';
import { Loader } from '../src/ui/Loader';
import { Button } from '../src/ui/Button';
import { EmptyPicture } from '../src/ui/me/parts';
import { shortDate } from '../src/ui/format';
import { MANAGE_SUBSCRIPTIONS, moneyLabel } from '../src/me/money';
import { useM12Api, type Purchase } from '../src/social/m12-api';

const ROW = { minHeight: size.row };
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: Purchase[]; storeReady: boolean };

export default function WalletScreen(): React.ReactElement {
  const m12 = useM12Api();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(() => { m12.purchases().then((r) => setState({ kind: 'ok', items: r.items, storeReady: r.storeReady }), () => setState({ kind: 'error' })); }, [m12]);
  useEffect(() => { load(); }, [load]);
  const manage = () => { void Linking.openURL(Platform.OS === 'ios' ? MANAGE_SUBSCRIPTIONS.ios : MANAGE_SUBSCRIPTIONS.android).catch(() => undefined); };
  return (
    <FlatList
      className="flex-1 bg-background"
      data={state.kind === 'ok' ? state.items : []}
      keyExtractor={(p) => p.id}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow"
      ListHeaderComponent={
        <Box className="gap-row mb-section">
          <Text className="text-muted text-sm">Purchases are made through {Platform.OS === 'ios' ? 'the App Store' : 'Google Play'}. SocialNet keeps no balance and never takes money itself. Listening stays free.</Text>
          {state.kind === 'ok' && !state.storeReady ? <Text className="text-muted text-xs">Purchases are not available yet.</Text> : null}
          <Button kind="secondary" label="Manage subscriptions in the store" onPress={manage} />
        </Box>
      }
      ListEmptyComponent={state.kind === 'loading' ? <Loader className="my-section" /> : state.kind === 'error' ? <Text className="text-muted text-sm">Couldn't load your purchases right now.</Text> : <EmptyPicture icon="wallet-outline" line="No purchases" />}
      renderItem={({ item }) => (
        <Box className="flex-row items-center gap-row border-b-hairline border-separator" style={ROW} accessible accessibilityLabel={`${item.productId}, ${item.status}, ${moneyLabel(item.amountMicros, item.currency)}`}>
          <Box className="flex-1">
            <Text className="text-text text-sm font-semibold" numberOfLines={1}>{item.productId}</Text>
            <Text className="text-muted text-xs">{`${item.store === 'apple' ? 'App Store' : item.store === 'google' ? 'Google Play' : item.store} · ${item.status} · ${shortDate(Date.parse(item.createdAt))}${item.expiresAt ? ` · until ${shortDate(Date.parse(item.expiresAt))}` : ''}`}</Text>
          </Box>
          <Text className="text-text text-sm">{moneyLabel(item.amountMicros, item.currency)}</Text>
        </Box>
      )}
    />
  );
}
