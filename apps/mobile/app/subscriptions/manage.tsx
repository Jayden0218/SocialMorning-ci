// Manage my subscriptions: tap one cover, then another, to change their order; Save keeps it.
/**
 * M21 US8 (FR-072): the order behind the "Default" sort. Covers three a row, in my current order.
 * Tap a cover to pick it (it gets a yellow ring), tap another to move the picked one into that
 * place. Save writes the order on the phone and sends it (`PUT /v1/me/subscriptions/order`); an
 * order saved offline is sent the next time My subscriptions opens (src/me/subscription-order.ts).
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Artwork } from '@/ui/kit/Artwork';
import { EmptyState } from '@/ui/kit/EmptyState';
import { arrangeSubscriptions, moveTo } from '@/me/subscriptions';
import { readOrder, saveOrder } from '@/me/subscription-order';
import { useUs8Api } from '@/social/us8-api';
import { useSocial } from '@/social/context';
import { useStores, useToast } from '@/ui/shell/providers';
import { hit, spacing } from '@/design';

const COLS = 3;
const TAP = { minHeight: hit.min, minWidth: hit.min };

export default function ManageSubscriptionsScreen(): React.ReactElement {
  const stores = useStores();
  const toast = useToast();
  const us8 = useUs8Api();
  const { listener } = useSocial();
  const { width } = useWindowDimensions();
  const art = Math.floor((width - 2 * spacing.screenX - (COLS - 1) * spacing.row) / COLS);

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
    <>
      <PageHeader
        title="Manage order"
        subtitle={picked ? 'Now tap where it should go.' : 'Tap a show, then tap where it should go.'}
        right={
          <Pressable onPress={save} disabled={saving || order.length === 0} accessibilityRole="button" accessibilityLabel="Save order" accessibilityState={{ disabled: saving || order.length === 0 }} className="items-center justify-center px-row" style={TAP}>
            <Text className="text-accent text-sm font-bold">Save</Text>
          </Pressable>
        }
      />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-24">
        {order.length === 0 ? <EmptyState surface="library" page /> : null}
        {lines.map((line) => (
          <Box key={line.join('|')} className="flex-row gap-row mb-section">
            {line.map((feedUrl) => {
              const s = byUrl.get(feedUrl);
              const at = order.indexOf(feedUrl) + 1;
              const on = picked === feedUrl;
              return (
                <Pressable key={feedUrl} onPress={() => tap(feedUrl)} accessibilityRole="button" accessibilityState={{ selected: on }}
                  accessibilityLabel={`${s?.title ?? feedUrl}, number ${at}${on ? ', picked. Tap another show to move it there' : ''}`} className="flex-1">
                  <Box className={`rounded-row border-2 ${on ? 'border-primary' : 'border-transparent'}`}>
                    <Artwork url={s?.imageUrl} size={art - 4} rounded="row" name={s?.title ?? feedUrl} />
                  </Box>
                  <Text className="text-text text-xs font-bold mt-1" numberOfLines={2}>{`${at}. ${s?.title ?? feedUrl}`}</Text>
                </Pressable>
              );
            })}
            {Array.from({ length: COLS - line.length }, (_, i) => <Box key={`pad${i}`} className="flex-1" />)}
          </Box>
        ))}
      </ScrollView>
    </>
  );
}
