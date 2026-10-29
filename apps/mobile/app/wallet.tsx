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
 *
 * M31 W6-A (T070 part 1; design-pulse2 `shell.html` `wallet--screen`, `wallet--plus`, `wallet--signed-out`; layout Panel): a pushed page with the violet-first
 * glow; the tiles start 12 under the status bar, 28 in from the left (the PLUS edge label's lane) and 20 from the right, 12 apart — the PLUS card, the "Redeem a
 * code" row (56, gift icon, chevron), then the empty wallet's 170 hero tile ("No purchases" in Unbounded 800 26, a wallet mark and a violet corner glow, and
 * the tinted pill "Purchases are not available yet." while the store is not set up) or the purchases as 64 tiles ending with the end-of-list mark; a load error is
 * a 48 "!" tile beside the line. The title bar is low: back, "Wallet", the store sentence (three lines) and "Manage subscriptions in the store" (ring 48) under it.
 * Same purchases, restore, redeem and manage calls and names.
 *
 * Not as drawn: the PLUS card is drawn only where purchases are on (Android with the store set up) — the drawing shows it on the empty wallet too, but Subscribe
 * and Restore need the store, so the card stays hidden elsewhere as it was; its edge label PLUS goes with it.
 */
import { useLoad } from '@/ui/kit/useLoad';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Platform } from 'react-native';
import { openSystem } from '@/ui/kit/openLink';
import { FlatList } from '@/ui/lib/flat-list';
import { Box } from '@/ui/lib/box';
import { colour, hit } from '@/design';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { EndOfList } from '@/ui/kit/EndOfList';
import { Icon } from '@/ui/kit/Icon';
import { Loader } from '@/ui/kit/Loader';
import { PageGlow } from '@/ui/kit/PageGlow';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { dayMonth } from '@/ui/kit/format';
import { useStores } from '@/ui/shell/providers';
import { writeStoreReady } from '@/social/store-ready';
import { MANAGE_SUBSCRIPTIONS, moneyLabel } from '@/me/money';
import { useM12Api, type Purchase } from '@/social/m12-api';
import { PlusCard } from '@/ui/me/PlusCard';
import { usePlayStore } from '@/billing/play';
import { usePurchaseApi } from '@/billing/purchase-api';
import { getPref } from '@/settings/prefs';
import { useSocial } from '@/social/context';
import { STAGE_TYPE, WALLET } from '@/ui/wallet/measures';
import { Big, CornerGlow, Line, MarkTile } from '@/ui/wallet/stage';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: Purchase[]; storeReady: boolean };

export default function WalletScreen(): React.ReactElement {
  const m12 = useM12Api();
  const router = useRouter();
  const stores = useStores();
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
  const manage = () => { void openSystem(Platform.OS === 'ios' ? MANAGE_SUBSCRIPTIONS.ios : MANAGE_SUBSCRIPTIONS.android).catch(() => undefined); };
  const notReady = state.kind === 'ok' && !state.storeReady;
  const pill = notReady ? (
    <Box testID="wallet-pill" className="self-start bg-hotSoft rounded-pill" style={{ height: WALLET.pillHeight, paddingHorizontal: WALLET.pillPad }}>
      <Type step="caption" className="text-hotText font-bold" style={STAGE_TYPE.pill}>Purchases are not available yet.</Type>
    </Box>
  ) : null;
  const empty = state.kind === 'ok' && state.items.length === 0;
  const store = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';
  return (
    <PushedPage
      title="Wallet"
      subtitle={`Purchases are made through ${store}. SocialNet keeps no balance and never takes money itself. Listening stays free.`}
      subtitleLines={WALLET.storeLines}
      tone="none"
      extraAbove={WALLET.storeLines > 2 ? Math.ceil(STAGE_TYPE.line13.lineHeight) : 0}
      below={<PulseButton kind="ring" label="Manage subscriptions in the store" onPress={manage} full />}
      belowHeight={hit.min}
    >
      {(layout) => (
        <>
          <PageGlow flip top={-240} strength={0.4} />
          <FlatList
            testID="wallet-list"
            className="flex-1"
            data={state.kind === 'ok' ? state.items : []}
            // Owner, 2026-10-05: the bottom of a fetched list says so.
            ListFooterComponent={state.kind === 'ok' && state.items.length > 0 ? <EndOfList label="— THAT’S EVERYTHING —" /> : undefined}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingTop: layout.top + WALLET.top, paddingRight: WALLET.right, paddingBottom: layout.reserve, flexGrow: 1 }}
            ListHeaderComponent={
              <Box className="relative" style={{ paddingLeft: WALLET.lane, gap: WALLET.gap, marginBottom: WALLET.gap }}>
                {play.ready ? <EdgeLabel label="PLUS" top={WALLET.edgeTop} /> : null}
                <PlusCard play={play} hasPlus={hasPlus} />
                {play.error ? <Line size="line14" tone="hot" live>{play.error}</Line> : null}
                <Pressable onPress={() => router.push('/redeem')} accessibilityRole="button" accessibilityLabel="Redeem a code" className="flex-row items-center bg-raise border border-line" style={{ minHeight: WALLET.rowMin, borderRadius: WALLET.rowRadius, paddingHorizontal: WALLET.rowPad, gap: WALLET.rowGap }}>
                  <Icon name="gift-outline" size={WALLET.rowIcon} color={colour.hotText} />
                  <Type step="row" className="text-text flex-1">Redeem a code</Type>
                  <Icon name="chevron-forward" size={WALLET.rowChevron} color={colour.text3} />
                </Pressable>
                {empty ? (
                  <Box testID="wallet-hero" className="bg-raise border border-line overflow-hidden justify-end" style={{ height: WALLET.heroHeight, borderRadius: WALLET.radius, padding: WALLET.heroPad, gap: WALLET.heroGap }} accessible accessibilityLabel={notReady ? 'No purchases. Purchases are not available yet.' : 'No purchases'}>
                    <CornerGlow size={WALLET.heroGlow} offset={WALLET.heroGlowOffset} opacity={WALLET.heroGlowOpacity} />
                    <Box className="absolute" style={{ right: WALLET.heroIconRight, top: WALLET.heroIconTop }}><Icon name="wallet-outline" size={WALLET.heroIcon} color={colour.hotText} /></Box>
                    <Big size="big26">No purchases</Big>
                    {pill}
                  </Box>
                ) : state.kind === 'ok' && state.items.length > 0 ? null : pill}
              </Box>
            }
            ListEmptyComponent={state.kind === 'loading' ? <Loader className="my-section" /> : state.kind === 'error' ? (
              <Box testID="wallet-error" className="flex-row items-center" style={{ paddingLeft: WALLET.lane, paddingVertical: WALLET.markPadY, paddingRight: WALLET.markPadX, gap: WALLET.markGap }}>
                <MarkTile size={WALLET.markSize}><Type step="hero" className="text-hotText" style={STAGE_TYPE.mark}>!</Type></MarkTile>
                <Box className="flex-1"><Line size="line14">Couldn't load your purchases right now.</Line></Box>
              </Box>
            ) : undefined}
            renderItem={({ item }) => (
              <Box testID="purchase-tile" className="flex-row items-center bg-raise border border-line" style={{ marginLeft: WALLET.lane, marginBottom: WALLET.gap, minHeight: WALLET.tileMin, borderRadius: WALLET.tileRadius, paddingVertical: WALLET.tilePadY, paddingHorizontal: WALLET.tilePadX, gap: WALLET.tileGap }} accessible accessibilityLabel={`${item.productId}, ${item.status}, ${moneyLabel(item.amountMicros, item.currency)}`}>
                <Box className="flex-1">
                  <Type step="row" className="text-text" numberOfLines={1}>{item.productId}</Type>
                  <Type step="caption" className="text-text3" style={STAGE_TYPE.small12}>{`${item.store === 'apple' ? 'App Store' : item.store === 'google' || item.store === 'google_play' ? 'Google Play' : item.store} · ${item.status} · ${dayMonth(Date.parse(item.createdAt))}${item.expiresAt ? ` · until ${dayMonth(Date.parse(item.expiresAt))}` : ''}`}</Type>
                </Box>
                <Type step="mono" className="text-text" style={STAGE_TYPE.mono15}>{moneyLabel(item.amountMicros, item.currency)}</Type>
              </Box>
            )}
          />
        </>
      )}
    </PushedPage>
  );
}
