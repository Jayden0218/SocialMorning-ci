// On a show page: the show's paid episodes (buy once, then play) and the Tip button, Android only.
/**
 * M20 US6 (spec FR-020–FR-025; scenario 2: "before buying, they show a price"). For a show made in
 * the Studio that sells paid episodes: their list, with "Buy · price" — after buying, each plays
 * through a 6-hour link from the server. For a show whose host switched tips on: "Tip the host"
 * with three sizes. Nothing here shows on iPhone, in teen mode, or while purchases are not switched
 * on (no Play account yet): the free show page stays exactly as it was.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Button } from '@/ui/kit/Button';
import { Icon } from '@/ui/kit/Icon';
import { hit } from '@/design';
import { mmss } from '@/ui/kit/format';
import { useColours } from '@/ui/kit/useColours';
import { usePlayer } from '@/playback/store';
import { useStores, useToast } from '@/ui/shell/providers';
import { getPref } from '@/settings/prefs';
import { readStoreReady } from '@/social/store-ready';
import { usePurchaseApi, type PaidList } from '@/billing/purchase-api';
import { usePlayStore } from '@/billing/play';
import { TIP_LABELS, TIPS } from '@/billing/products';
import { fnv1a64 } from '@socialmorning/social-core';

const TAP = { minHeight: hit.min };

export function ShowSales(props: { feedUrl: string; showTitle: string; artworkUrl?: string; tipsEnabled: boolean }): React.ReactElement | null {
  const stores = useStores();
  const c = useColours(stores.settings);
  const toast = useToast();
  const player = usePlayer();
  const api = usePurchaseApi();
  const play = usePlayStore(api, { serverReady: readStoreReady(stores.settings), teen: getPref(stores.settings, 'hideExplicit') });
  const [paid, setPaid] = useState<PaidList | undefined>(undefined);
  const load = useCallback(() => { api.paid(props.feedUrl).then(setPaid, () => setPaid(undefined)); }, [api, props.feedUrl]);
  useEffect(() => { if (play.ready) load(); }, [play.ready, load, play.granted]);
  useEffect(() => { if (play.error) toast(play.error); }, [play.error, toast]);

  if (!play.ready) return null;
  const listen = async (item: PaidList['items'][number]) => {
    try {
      const { url } = await api.access(item.id);
      player.load({ id: item.episodeId, url, title: item.title, showTitle: props.showTitle, ...(item.coverUrl ?? props.artworkUrl ? { artworkUrl: (item.coverUrl ?? props.artworkUrl)! } : {}), ...(item.durationMs ? { durationMs: item.durationMs } : {}), feedUrl: props.feedUrl }, 'play');
    } catch {
      toast("Couldn't open this episode — try again.");
    }
  };
  const showPrice = paid?.productId ? play.price(paid.productId) : undefined;
  return (
    <Box className="gap-row">
      {paid?.forSale && paid.items.length > 0 ? (
        <Box className="bg-surface border border-border rounded-row px-section py-row gap-row">
          <Box className="flex-row items-center gap-gap">
            <Icon name="lock-closed-outline" size={18} color={c.accent} />
            <Text className="flex-1 text-text text-body font-bold">{paid.bought ? 'Paid episodes — yours' : 'Paid episodes'}</Text>
          </Box>
          {paid.items.map((it) => (
            <Pressable key={it.id} disabled={!paid.bought} onPress={() => void listen(it)} accessibilityRole="button"
              accessibilityLabel={paid.bought ? `Play ${it.title}` : `${it.title}, paid episode`} className="flex-row items-center gap-gap" style={TAP}>
              <Icon name={paid.bought ? 'play-circle-outline' : 'lock-closed-outline'} size={22} color={paid.bought ? c.accent : c.muted} />
              <Text className="flex-1 text-text text-sm" numberOfLines={2}>{it.title}</Text>
              {it.durationMs ? <Text className="text-muted text-xs">{mmss(it.durationMs)}</Text> : null}
            </Pressable>
          ))}
          {!paid.bought && paid.productId ? (
            <Button label={showPrice ? `Buy all paid episodes · ${showPrice}` : 'Buy all paid episodes'} onPress={() => void play.buy(paid.productId!, { feedUrl: props.feedUrl, ...(paid.profileId ? { profileId: paid.profileId } : {}) })} />
          ) : null}
        </Box>
      ) : null}
      {props.tipsEnabled ? (
        <Box className="bg-surface border border-border rounded-row px-section py-row gap-row">
          <Text className="text-text text-body font-bold">Tip the host</Text>
          <Text className="text-muted text-xs">Through Google Play. The show stays free for everyone.</Text>
          <Box className="flex-row flex-wrap gap-gap">
            {TIPS.map((id) => (
              <Pressable key={id} onPress={() => void play.buy(id, { feedUrl: props.feedUrl, profileId: fnv1a64(props.feedUrl) })} accessibilityRole="button"
                accessibilityLabel={`${TIP_LABELS[id]}${play.price(id) ? `, ${play.price(id)}` : ''}`} className="justify-center px-section rounded-pill border border-border bg-background" style={TAP}>
                <Text className="text-text text-sm font-bold">{play.price(id) ? `${TIP_LABELS[id]} · ${play.price(id)}` : TIP_LABELS[id]}</Text>
              </Pressable>
            ))}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
