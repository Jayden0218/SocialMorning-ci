// Your App Store / Google Play purchases, read only; link to manage them.
/**
 * Wallet (M12 FR-106): your App Store / Google Play purchases, read only. SocialNet holds no
 * balance and takes no money itself; managing or cancelling a subscription happens in the store,
 * which the button opens. Until the store setup (M10b) is done the list is empty.
 *
 * Spec 039 (Hub template, `design/B-Me.dc.html`): the page is a `PageList` (Back, "Wallet", one 20 gutter, 24 between the parts, a foot that
 * clears the now bar). Under the title: the store sentence, the PLUS card where purchases are on (Android with the store set up), the "Redeem a
 * code" row (56), then an empty wallet's "No purchases" card with the pill "Purchases are not available yet." while the store is not set up,
 * or "Purchases" and one card per purchase, ending with the end-of-list mark; "Manage subscriptions in the store" is the last thing on the page.
 * A load error is an `InlineNotice` with Retry. Same purchases, restore, redeem and manage calls and names.
 *
 * M20 US6: on Android with purchases switched on, the PLUS card (Subscribe, Restore) sits above the list; a grant reloads the list.
 * M24 US15: "Redeem a code" opens `app/redeem.tsx`; coming back reloads PLUS and the list.
 */
import { useLoad } from '@/ui/kit/useLoad';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Platform } from 'react-native';
import { openSystem } from '@/ui/kit/openLink';
import { Box } from '@/ui/lib/box';
import { colour, bars, radius, spacing } from '@/design';
import { EndOfList } from '@/ui/kit/EndOfList';
import { Icon } from '@/ui/kit/Icon';
import { Loader } from '@/ui/kit/Loader';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { InlineNotice, PageList, Section } from '@/ui/kit/layout';
import { BackButton } from '@/ui/notifications/cards';
import { dayMonth } from '@/ui/kit/format';
import { useStores } from '@/ui/shell/providers';
import { useToastPlacement } from '@/ui/shell/toastPlacement';
import { writeStoreReady } from '@/social/store-ready';
import { MANAGE_SUBSCRIPTIONS, moneyLabel } from '@/me/money';
import { useM12Api, type Purchase } from '@/social/m12-api';
import { PlusCard } from '@/ui/me/PlusCard';
import { usePlayStore } from '@/billing/play';
import { usePurchaseApi } from '@/billing/purchase-api';
import { getPref } from '@/settings/prefs';
import { useSocial } from '@/social/context';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: Purchase[]; storeReady: boolean };

/** A row of the page: raise, radius 16, the 56 pt row of design B. */
const ROW = { minHeight: bars.circle + spacing.row, borderRadius: radius.row, paddingHorizontal: spacing.section, gap: spacing.row } as const;
const CARD = { borderRadius: radius.card, padding: spacing.section, gap: spacing.row } as const;

export default function WalletScreen(): React.ReactElement {
  const m12 = useM12Api();
  const router = useRouter();
  const stores = useStores();
  const { now } = useToastPlacement();
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
    <Box testID="wallet-pill" className="self-start bg-hotSoft rounded-pill" style={{ minHeight: bars.chip, justifyContent: 'center', paddingHorizontal: spacing.row }}>
      <Type step="small" className="text-hotText font-bold">Purchases are not available yet.</Type>
    </Box>
  ) : null;
  const empty = state.kind === 'ok' && state.items.length === 0;
  const hasItems = state.kind === 'ok' && state.items.length > 0;
  const store = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';
  return (
    <PageList
      title="Wallet"
      leading={<BackButton />}
      now={now}
      safeBottom={0}
      gap={spacing.row}
      testID="wallet-list"
      data={state.kind === 'ok' ? state.items : []}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={
        <Box style={{ gap: spacing.block }}>
          <Type step="small" className="text-text2">{`Purchases are made through ${store}. SocialNet keeps no balance and never takes money itself. Listening stays free.`}</Type>
          {play.ready ? <PlusCard play={play} hasPlus={hasPlus} /> : null}
          {play.error ? <Type step="small" className="text-hotText" accessibilityLiveRegion="polite">{play.error}</Type> : null}
          <Pressable onPress={() => router.push('/redeem')} accessibilityRole="button" accessibilityLabel="Redeem a code" className="flex-row items-center bg-raise" style={ROW}>
            <Icon name="gift-outline" size={bars.titleShrunk + 2} color={colour.hotText} />
            <Type step="strong" className="text-text flex-1">Redeem a code</Type>
            <Icon name="chevron-forward" size={spacing.section} color={colour.text3} />
          </Pressable>
          {empty ? (
            <Box testID="wallet-hero" className="bg-raise" style={CARD} accessible accessibilityLabel={notReady ? 'No purchases. Purchases are not available yet.' : 'No purchases'}>
              <Icon name="wallet-outline" size={spacing.region - spacing.gap} color={colour.hotText} />
              <Type step="heading" className="text-text">No purchases</Type>
              {pill}
            </Box>
          ) : hasItems ? <Section title="Purchases" /> : pill}
        </Box>
      }
      ListEmptyComponent={state.kind === 'loading' ? <Loader className="my-section" /> : state.kind === 'error' ? (
        <Box testID="wallet-error">
          <InlineNotice text="Couldn't load your purchases right now." actionLabel="Retry" onAction={() => { setState({ kind: 'loading' }); load(); }} />
        </Box>
      ) : undefined}
      ListFooterComponent={
        <Box style={{ gap: spacing.section, paddingTop: spacing.block - spacing.row }}>
          {hasItems ? <EndOfList label="— THAT’S EVERYTHING —" /> : null}
          <PulseButton kind="ring" label="Manage subscriptions in the store" onPress={manage} full />
        </Box>
      }
      renderItem={({ item }) => (
        <Box testID="purchase-tile" className="flex-row items-center bg-raise" style={{ ...CARD, minHeight: ROW.minHeight }} accessible accessibilityLabel={`${item.productId}, ${item.status}, ${moneyLabel(item.amountMicros, item.currency)}`}>
          <Box className="flex-1">
            <Type step="strong" className="text-text" numberOfLines={1}>{item.productId}</Type>
            <Type step="small" className="text-text3">{`${item.store === 'apple' ? 'App Store' : item.store === 'google' || item.store === 'google_play' ? 'Google Play' : item.store} · ${item.status} · ${dayMonth(Date.parse(item.createdAt))}${item.expiresAt ? ` · until ${dayMonth(Date.parse(item.expiresAt))}` : ''}`}</Type>
          </Box>
          <Type step="time" className="text-text">{moneyLabel(item.amountMicros, item.currency)}</Type>
        </Box>
      )}
    />
  );
}
