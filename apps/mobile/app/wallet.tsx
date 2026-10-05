// Your App Store / Google Play purchases, read only; link to manage them.
/**
 * Wallet (M12 FR-106): your App Store / Google Play purchases, read only. SocialNet holds no
 * balance and takes no money itself; managing or cancelling a subscription happens in the
 * store, which the button opens. Until the store setup (M10b) is done the list is empty.
 *
 * M17 (`Wallet-B`, constitution v3.0.0): an empty wallet is a white hero card — a pale yellow
 * disc in the corner with the wallet icon, "No purchases" in the serif and, while the store is
 * not set up, "Purchases are not available yet." as a tinted pill; the store sentence sits under
 * it, and "Manage subscriptions in the store" moved to a bar at the foot of the page. Real
 * purchases (none today) are white cards. Loading, the error line and the data are unchanged.
 */
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { FlatList } from '@/ui/lib/flat-list';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { size } from '@/design';
import { Loader } from '@/ui/kit/Loader';
import { Button } from '@/ui/kit/Button';
import { Icon } from '@/ui/kit/Icon';
import { useStores } from '@/ui/shell/providers';
import { writeStoreReady } from '@/social/store-ready';
import { useColours } from '@/ui/kit/useColours';
import { shortDate } from '@/ui/kit/format';
import { MANAGE_SUBSCRIPTIONS, moneyLabel } from '@/me/money';
import { useM12Api, type Purchase } from '@/social/m12-api';
import { PageHeader } from '@/ui/kit/PageHeader';
import { BottomBar } from '@/ui/kit/BottomBar';
import { EndOfList } from '@/ui/kit/EndOfList';

const ROW = { minHeight: size.row };
/** The empty card is 260 pt tall in `Wallet-B`; the words sit at its foot. */
const HERO = { minHeight: 260 };
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: Purchase[]; storeReady: boolean };

export default function WalletScreen(): React.ReactElement {
  const m12 = useM12Api();
  const stores = useStores();
  const c = useColours(stores.settings);
  const [state, setState] = useState<State>({ kind: 'loading' });
  // M17: the answer is kept, so Me knows whether Wallet opens this page or the Coming soon pop-up.
  const load = useCallback(() => { m12.purchases().then((r) => { writeStoreReady(stores.settings, r.storeReady); setState({ kind: 'ok', items: r.items, storeReady: r.storeReady }); }, () => setState({ kind: 'error' })); }, [m12, stores]);
  useEffect(() => { load(); }, [load]);
  const manage = () => { void Linking.openURL(Platform.OS === 'ios' ? MANAGE_SUBSCRIPTIONS.ios : MANAGE_SUBSCRIPTIONS.android).catch(() => undefined); };
  const notReady = state.kind === 'ok' && !state.storeReady;
  const pill = notReady ? (
    <Box className="self-start bg-accentTint rounded-pill px-row py-1.5"><Text className="text-accent text-xs font-bold">Purchases are not available yet.</Text></Box>
  ) : null;
  const empty = state.kind === 'ok' && state.items.length === 0;
  return (
    <>
    <PageHeader title="Wallet" />
    <FlatList
      className="flex-1 bg-background"
      data={state.kind === 'ok' ? state.items : []}
      // Owner, 2026-10-05: the bottom of a fetched list says so.
      ListFooterComponent={state.kind === 'ok' && state.items.length > 0 ? <EndOfList /> : undefined}
      keyExtractor={(p) => p.id}
      contentContainerClassName="px-screen-x pt-gap pb-24 flex-grow"
      ListHeaderComponent={
        <Box className="gap-section mb-section">
          {empty ? (
            <Box className="bg-surface border border-border rounded-row p-7 justify-end gap-section overflow-hidden" style={HERO} accessible accessibilityLabel={notReady ? 'No purchases. Purchases are not available yet.' : 'No purchases'}>
              <Box className="absolute -right-8 -top-8 w-44 h-44 rounded-pill bg-primary opacity-35" />
              <Box className="absolute right-9 top-9"><Icon name="wallet-outline" size={44} color={c.accent} /></Box>
              <Text className="text-text text-hero font-display-semibold">No purchases</Text>
              {pill}
            </Box>
          ) : pill}
          <Text className="text-muted text-body">Purchases are made through {Platform.OS === 'ios' ? 'the App Store' : 'Google Play'}. SocialNet keeps no balance and never takes money itself. Listening stays free.</Text>
        </Box>
      }
      ListEmptyComponent={state.kind === 'loading' ? <Loader className="my-section" /> : state.kind === 'error' ? <Text className="text-muted text-sm">Couldn't load your purchases right now.</Text> : undefined}
      renderItem={({ item }) => (
        <Box className="flex-row items-center gap-row bg-surface border border-border rounded-row px-section py-row mb-gap" style={ROW} accessible accessibilityLabel={`${item.productId}, ${item.status}, ${moneyLabel(item.amountMicros, item.currency)}`}>
          <Box className="flex-1">
            <Text className="text-text text-body font-semibold" numberOfLines={1}>{item.productId}</Text>
            <Text className="text-muted text-xs">{`${item.store === 'apple' ? 'App Store' : item.store === 'google' ? 'Google Play' : item.store} · ${item.status} · ${shortDate(Date.parse(item.createdAt))}${item.expiresAt ? ` · until ${shortDate(Date.parse(item.expiresAt))}` : ''}`}</Text>
          </Box>
          <Text className="text-text text-body font-semibold">{moneyLabel(item.amountMicros, item.currency)}</Text>
        </Box>
      )}
    />
    <BottomBar tone="surface" pad="section">
      <Button kind="secondary" label="Manage subscriptions in the store" onPress={manage} />
    </BottomBar>
    </>
  );
}
