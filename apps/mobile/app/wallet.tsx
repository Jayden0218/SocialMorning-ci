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
 *
 * M20 US6: on Android with purchases switched on, the PLUS card (Subscribe, Restore) sits above the
 * list; a grant reloads the list. `store.ready` is kept for Android only — the iPhone has no store yet.
 *
 * M24 US15: "Redeem a code" (a white row under the PLUS card) opens `app/redeem.tsx` — a free
 * grant from SocialNet, on both phones, store or no store. Coming back reloads PLUS and the list.
 */
import { useLoad } from '@/ui/kit/useLoad';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
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
import { PlusCard } from '@/ui/me/PlusCard';
import { usePlayStore } from '@/billing/play';
import { usePurchaseApi } from '@/billing/purchase-api';
import { getPref } from '@/settings/prefs';
import { useSocial } from '@/social/context';

const ROW = { minHeight: size.row };
/** The empty card is 260 pt tall in `Wallet-B`; the words sit at its foot. */
const HERO = { minHeight: 260 };
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: Purchase[]; storeReady: boolean };

export default function WalletScreen(): React.ReactElement {
  const m12 = useM12Api();
  const router = useRouter();
  const stores = useStores();
  const c = useColours(stores.settings);
  const [state, setState] = useState<State>({ kind: 'loading' });
  // M17: the answer is kept, so Me knows whether Wallet opens this page or the Coming soon pop-up.
  const load = useCallback(() => { m12.purchases().then((r) => { const ready = Platform.OS === 'android' && r.storeReady; writeStoreReady(stores.settings, ready); setState({ kind: 'ok', items: r.items, storeReady: ready }); }, () => setState({ kind: 'error' })); }, [m12, stores]);
  const purchaseApi = usePurchaseApi();
  const play = usePlayStore(purchaseApi, { serverReady: state.kind === 'ok' && state.storeReady, teen: getPref(stores.settings, 'hideExplicit') });
  const { api } = useSocial();
  // M23 US9: cancelled on unmount; asked again after a purchase is granted.
  const [me] = useLoad(() => api.me().then((m) => ({ plus: m.plus === true })), [api, play.granted], 'wallet.me');
  const hasPlus = me.kind === 'ok' && me.plus;
  useEffect(() => { load(); }, [load, play.granted]);
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
          <PlusCard play={play} hasPlus={hasPlus} />
          {play.error ? <Text className="text-accent text-sm">{play.error}</Text> : null}
          <Pressable onPress={() => router.push('/redeem')} accessibilityRole="button" accessibilityLabel="Redeem a code" className="flex-row items-center gap-row bg-surface border border-border rounded-row px-section" style={ROW}>
            <Icon name="gift-outline" size={22} color={c.accent} />
            <Text className="text-text text-body font-semibold flex-1">Redeem a code</Text>
            <Icon name="chevron-forward" size={16} color={c.muted} />
          </Pressable>
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
