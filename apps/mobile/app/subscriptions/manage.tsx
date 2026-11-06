// Manage my subscriptions: tap one cover, then another, to change their order; Save keeps it.
/**
 * M21 US8 (FR-072): the order behind the "Default" sort. Covers three a row, in my current order.
 * Tap a cover to pick it (it gets a yellow ring), tap another to move the picked one into that
 * place. Save writes the order on the phone and sends it (`PUT /v1/me/subscriptions/order`); an
 * order saved offline is sent the next time My subscriptions opens (src/me/subscription-order.ts).
 */
import { router } from 'expo-router';
import { useContext, useMemo, useState } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Page } from '@/ui/kit/layout';
import { goBack } from '@/ui/kit/PageHeader';
import { IconButton } from '@/ui/kit/PulseButton';
import { useToastPlacement } from '@/ui/shell/toastPlacement';
import { Artwork } from '@/ui/kit/Artwork';
import { EmptyState } from '@/ui/kit/EmptyState';
import { Type } from '@/ui/kit/Type';
import { arrangeSubscriptions, moveTo } from '@/me/subscriptions';
import { readOrder, saveOrder } from '@/me/subscription-order';
import { useUs8Api } from '@/social/us8-api';
import { useSocial } from '@/social/context';
import { useStores, useToast } from '@/ui/shell/providers';
import { colour, gutter } from '@/design';

const COLS = 3;
/** design-pulse2 `subscriptions-manage--screen`: covers 10 apart on the page's 20 gutter (039: was 28 / 16); radius 18; a 22 number badge at 6 / 6; the picked cover shrinks to 94 % in a 3 pt hot ring. */
const GRID = { gap: 10, radius: 18, badge: 22, badgeAt: 6, ring: 3, picked: 0.94 } as const;
/** The hint chip under the title: 36 tall, raise fill, hot words (drawn `chip` in hot text). */
const HINT = { height: 36, paddingHorizontal: 14 };

export default function ManageSubscriptionsScreen(): React.ReactElement {
  const stores = useStores();
  const toast = useToast();
  const us8 = useUs8Api();
  const { listener } = useSocial();
  const { width } = useWindowDimensions();
  const insets = useContext(SafeAreaInsetsContext);
  const side = gutter(width);
  const placed = useToastPlacement();
  const art = Math.floor((width - 2 * side - (COLS - 1) * GRID.gap) / COLS);

  const shows = useMemo(() => {
    const rows = stores.subscriptions.list().map(({ feedUrl, subscribedAt }) => {
      const show = stores.feeds.getShow(feedUrl);
      return { feedUrl, subscribedAt, starred: false, title: show?.title ?? feedUrl, ...(show?.imageUrl ? { imageUrl: show.imageUrl } : {}) };
    });
    return arrangeSubscriptions(rows, '', 'default', readOrder(stores.settings)).rest;
  }, [stores]);
  const byUrl = useMemo(() => new Map(shows.map((s) => [s.feedUrl, s])), [shows]);
  const [order, setOrder] = useState<string[]>(() => shows.map((s) => s.feedUrl));
  const [picked, setPicked] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const tap = (feedUrl: string) => {
    if (picked === undefined) { setPicked(feedUrl); return; }
    if (picked !== feedUrl) setOrder((o) => moveTo(o, picked, feedUrl));
    setPicked(undefined);
  };
  const save = () => {
    if (saving || order.length === 0) return;
    setSaving(true);
    void saveOrder(stores.settings, us8, order, listener !== undefined).then(() => {
      setSaving(false);
      toast('Order saved. "Default" uses it.');
      router.back();
    });
  };

  const lines: string[][] = [];
  for (let i = 0; i < order.length; i += COLS) lines.push(order.slice(i, i + COLS));

  return (
    <SafeAreaInsetsContext.Provider value={{ top: insets?.top ?? 0, bottom: 0, left: insets?.left ?? 0, right: insets?.right ?? 0 }}>
    <Page
      title="Manage order"
      now={placed.now}
      leading={<IconButton icon="chevron-back" label="Back" onPress={goBack} fill size={22} />}
      {...(order.length > 0 ? { trailing: <IconButton icon="checkmark" label="Save order" onPress={save} fill /> } : {})}
    >
      <Type step="caption" className="text-text2">Tap a show, then tap where it should go.</Type>
      {picked ? <Box testID="manage-hint" className="self-start justify-center bg-raise border border-line rounded-pill" style={HINT} accessibilityLiveRegion="polite"><Type step="caption" className="text-hotText font-semibold">Now tap where it should go.</Type></Box> : null}
      {order.length === 0 ? (
        <EmptyState surface="library" page />
      ) : (
        <Box style={{ gap: GRID.gap }}>
          {lines.map((line) => (
            <Box key={line.join('|')} className="flex-row" style={{ gap: GRID.gap }}>
              {line.map((feedUrl) => {
                const s = byUrl.get(feedUrl);
                const at = order.indexOf(feedUrl) + 1;
                const on = picked === feedUrl;
                return (
                  <Pressable key={feedUrl} onPress={() => tap(feedUrl)} accessibilityRole="button" accessibilityState={{ selected: on }}
                    accessibilityLabel={`${s?.title ?? feedUrl}, number ${at}${on ? ', picked. Tap another show to move it there' : ''}`} className="flex-1">
                    <Box
                      testID={on ? 'manage-picked' : 'manage-cover'}
                      style={{ borderRadius: GRID.radius, transform: [{ scale: on ? GRID.picked : 1 }], ...(on ? { borderWidth: GRID.ring, borderColor: colour.hot } : null) }}
                    >
                      <Artwork url={s?.imageUrl} size={art - (on ? 2 * GRID.ring : 0)} rounded="row" name={s?.title ?? feedUrl} />
                      <Box className="absolute items-center justify-center rounded-pill" style={{ left: GRID.badgeAt, top: GRID.badgeAt, minWidth: GRID.badge, height: GRID.badge, paddingHorizontal: 5, backgroundColor: colour.badgeScrim }} accessible={false} importantForAccessibility="no-hide-descendants">
                        <Type step="tag" className="text-text">{String(at)}</Type>
                      </Box>
                    </Box>
                  </Pressable>
                );
              })}
              {Array.from({ length: COLS - line.length }, (_, i) => <Box key={`pad${i}`} className="flex-1" />)}
            </Box>
          ))}
        </Box>
      )}
    </Page>
    </SafeAreaInsetsContext.Provider>
  );
}
