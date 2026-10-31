// On a show page: the show's paid episodes (buy once, then play), Gift this series, and the Tip button, Android only.
/**
 * M20 US6 (spec FR-020–FR-025; scenario 2: "before buying, they show a price"). For a show made in
 * the Studio that sells paid episodes: their list, with "Buy · price" — after buying, each plays
 * through a 6-hour link from the server. For a show whose host switched tips on: "Tip the host"
 * with three sizes. Nothing here shows on iPhone, in teen mode, or while purchases are not switched
 * on (no Play account yet): the free show page stays exactly as it was.
 *
 * M22 US14 (FR-042): "Gift this series" buys the same price level as a gift (`gift_tier_n`); the
 * server verifies it with Google and answers a link, which opens the share sheet. Android only, like
 * every purchase here (the server cannot verify an Apple purchase); claiming works on both phones.
 *
 * M31 W3-A (T040; design-pulse2 `show--paid-episodes-and-tips`, "About view tile → its sheet"): on the show page this is one Panel tile,
 * "Support {show}", that opens a sheet titled the same: the cap "PAID EPISODES" and a Deck of 220 wide cards (cover 90 with a lock
 * until bought; the title in Geist 600 13; "Preview" (quiet) where the creator set one, "Play" (light) once bought), "Buy all paid
 * episodes · price" (light), "Gift this series · price" (quiet), the cap "TIP THE HOST", three tip chips and the line "Through Google Play.
 * The show stays free for everyone." Names, handlers and toasts are the old ones. A price per card is not in the app's data (one price for
 * the series), so a card has no price button. NOT VERIFIED on a phone (Google Play billing only).
 */
import { useCallback, useEffect, useState } from 'react';
import { Share } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { PanelRow } from '@/ui/kit/PanelRow';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { PanelGroup } from '@/ui/me/Panel';
import { Cap } from '@/ui/player/Cap';
import { bars, colour, hit } from '@/design';
import { mmss } from '@/ui/kit/format';
import { usePlayer } from '@/playback/store';
import { startPreview } from '@/playback/preview';
import { useStores, useToast } from '@/ui/shell/providers';
import { getPref } from '@/settings/prefs';
import { readStoreReady } from '@/social/store-ready';
import { usePurchaseApi, type PaidList } from '@/billing/purchase-api';
import { usePlayStore } from '@/billing/play';
import { giftProductFor, TIP_LABELS, TIPS } from '@/billing/products';
import { fnv1a64 } from '@socialmorning/social-core';
import { EPISODE } from '@/ui/episode/measures';

/** The deck's card: 220 wide, radius 20, the cover 90 tall; its buttons 36 tall. */
const CARD = { width: 220, radius: 20, cover: 90, button: bars.chip } as const;

export function ShowSales(props: { feedUrl: string; showTitle: string; artworkUrl?: string; tipsEnabled: boolean }): React.ReactElement | null {
  const stores = useStores();
  const toast = useToast();
  const player = usePlayer();
  const api = usePurchaseApi();
  const play = usePlayStore(api, { serverReady: readStoreReady(stores.settings), teen: getPref(stores.settings, 'hideExplicit') });
  const [paid, setPaid] = useState<PaidList | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => { api.paid(props.feedUrl).then(setPaid, () => setPaid(undefined)); }, [api, props.feedUrl]);
  useEffect(() => { if (play.ready) load(); }, [play.ready, load, play.granted]);
  useEffect(() => { if (play.error) toast(play.error); }, [play.error, toast]);
  // M22 US14: a gift bought → share its link (whoever opens it and signs in first gets the series).
  const giftUrl = play.gift?.url;
  useEffect(() => {
    if (!giftUrl) return;
    void Share.share({ message: `A gift for you: ${props.showTitle}\n${giftUrl}`, url: giftUrl }).catch(() => undefined);
  }, [giftUrl, props.showTitle]);

  if (!play.ready) return null;
  const listen = async (item: PaidList['items'][number]) => {
    try {
      const { url } = await api.access(item.id);
      player.load({ id: item.episodeId, url, title: item.title, showTitle: props.showTitle, ...(item.coverUrl ?? props.artworkUrl ? { artworkUrl: (item.coverUrl ?? props.artworkUrl)! } : {}), ...(item.durationMs ? { durationMs: item.durationMs } : {}), feedUrl: props.feedUrl }, 'play');
    } catch {
      toast("Couldn't open this episode — try again.");
    }
  };
  // M24 US13: before buying, a paid episode with a free preview plays only that range.
  const tryPreview = async (item: PaidList['items'][number]) => {
    try {
      const p = await api.preview(item.id);
      startPreview(player, { id: item.episodeId, url: p.url, title: item.title, showTitle: props.showTitle, ...(item.durationMs ? { durationMs: item.durationMs } : {}), feedUrl: props.feedUrl }, { startMs: p.startMs, endMs: p.endMs });
    } catch {
      toast("Couldn't open the preview — try again.");
    }
  };
  const showPrice = paid?.productId ? play.price(paid.productId) : undefined;
  const forSale = paid?.forSale === true && paid.items.length > 0;
  if (!forSale && !props.tipsEnabled) return null;
  const detail = [forSale ? 'Paid episodes' : '', props.tipsEnabled ? 'Tip the host' : ''].filter((x) => x !== '').join(' · ');
  return (
    <>
      <PanelGroup>
        <PanelRow icon="lock-closed-outline" label={`Support ${props.showTitle}`} detail={detail} onPress={() => setOpen(true)} />
      </PanelGroup>
      <ActionSheet open={open} onClose={() => setOpen(false)} label={`Support ${props.showTitle}`} title={`Support ${props.showTitle}`}>
        {paid && forSale ? (
          <>
            <Cap accessibilityRole="header">{paid.bought ? 'Paid episodes — yours' : 'Paid episodes'}</Cap>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mr-screen-x" contentContainerStyle={{ gap: EPISODE.tileGap, paddingRight: EPISODE.side }}>
              {paid.items.map((it) => (
                <Pressable key={it.id} disabled={!paid.bought} onPress={() => void listen(it)} accessibilityRole="button"
                  accessibilityLabel={paid.bought ? `Play ${it.title}` : `${it.title}, paid episode`} className="bg-raise2 overflow-hidden" style={{ width: CARD.width, borderRadius: CARD.radius }}>
                  <Box className="overflow-hidden bg-raise" style={{ height: CARD.cover }} accessible={false} importantForAccessibility="no-hide-descendants">
                    <Box style={{ marginTop: -(CARD.width - CARD.cover) / 2 }}><Artwork url={it.coverUrl ?? props.artworkUrl ?? null} size={CARD.width} name={props.showTitle} /></Box>
                    {paid.bought ? null : <Box className="absolute" style={{ left: EPISODE.tileGap, top: EPISODE.tileGap }}><Icon name="lock-closed-outline" size={18} color={colour.text} /></Box>}
                  </Box>
                  <Box className="p-row gap-gap">
                    <Type step="caption" className="text-text font-semibold" numberOfLines={2}>{it.title}</Type>
                    {it.durationMs ? <Type step="tag" className="text-text3">{mmss(it.durationMs)}</Type> : null}
                    {paid.bought ? (
                      <Box className="flex-row items-center justify-center bg-text rounded-pill gap-hair" style={{ height: CARD.button }} accessible={false} importantForAccessibility="no-hide-descendants">
                        <Icon name="play" size={12} color={colour.void} />
                        <Type step="caption" className="text-void font-semibold">Play</Type>
                      </Box>
                    ) : it.preview ? (
                      <Pressable onPress={() => void tryPreview(it)} accessibilityRole="button" accessibilityLabel={`Play the free preview of ${it.title}`} className="items-center justify-center bg-raise rounded-pill" style={{ height: CARD.button, minWidth: hit.min }} hitSlop={(hit.min - CARD.button) / 2}>
                        <Type step="caption" className="text-text font-semibold">Preview</Type>
                      </Pressable>
                    ) : null}
                  </Box>
                </Pressable>
              ))}
            </ScrollView>
            {!paid.bought && paid.productId ? (
              <PulseButton kind="light" full label={showPrice ? `Buy all paid episodes · ${showPrice}` : 'Buy all paid episodes'} onPress={() => void play.buy(paid.productId!, { feedUrl: props.feedUrl, ...(paid.profileId ? { profileId: paid.profileId } : {}) })} />
            ) : null}
            {paid.productId && giftProductFor(paid.productId) ? (
              <PulseButton kind="quiet" full icon="gift-outline" label={play.price(giftProductFor(paid.productId)!) ? `Gift this series · ${play.price(giftProductFor(paid.productId)!)}` : 'Gift this series'}
                accessibilityLabel="Gift this series to someone"
                onPress={() => void play.buy(giftProductFor(paid.productId!)!, { feedUrl: props.feedUrl, ...(paid.profileId ? { profileId: paid.profileId } : {}) })} />
            ) : null}
            {giftUrl ? <Type step="caption" className="text-text2">{`Gift link: ${giftUrl}`}</Type> : null}
          </>
        ) : null}
        {props.tipsEnabled ? (
          <>
            <Cap accessibilityRole="header">Tip the host</Cap>
            <Box className="flex-row gap-gap">
              {TIPS.map((id) => (
                <Pressable key={id} onPress={() => void play.buy(id, { feedUrl: props.feedUrl, profileId: fnv1a64(props.feedUrl) })} accessibilityRole="button"
                  accessibilityLabel={`${TIP_LABELS[id]}${play.price(id) ? `, ${play.price(id)}` : ''}`} className="flex-1 items-center justify-center rounded-pill border border-line bg-raise" style={{ height: bars.chip }} hitSlop={(hit.min - bars.chip) / 2}>
                  <Type step="chip" className="text-text" numberOfLines={1}>{play.price(id) ? `${TIP_LABELS[id]} · ${play.price(id)}` : TIP_LABELS[id]}</Type>
                </Pressable>
              ))}
            </Box>
            <Type step="chip" className="text-text3 font-medium">Through Google Play. The show stays free for everyone.</Type>
          </>
        ) : null}
      </ActionSheet>
    </>
  );
}
