// A gift link opened in the app: the paid series, who gave it, and Claim — once, by whoever signs in first.
/**
 * M22 US14 (FR-043, FR-044; contracts/api.md "Gift"). `socialmorning://gift/<code>` (or the web
 * page's "Open in SocialNet") lands here, on either phone — claiming is not a purchase. Signed out,
 * Claim asks for sign-in first. Answers in plain words: claimed → the show opens; "Already claimed";
 * "You already have this series" (the link stays for someone else); refunded → no longer claimable.
 */
import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Box } from '@/ui/lib/box';
import { colour, hit } from '@/design';
import { giftColour } from '@/design/tokens';
import { Loader } from '@/ui/kit/Loader';
import { PageGlow } from '@/ui/kit/PageGlow';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { useToast } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { useM22Api, type ClaimResult, type GiftView } from '@/social/api-m22-server';
import { GIFT } from '@/ui/wallet/measures';
import { GiftDead, GiftOffer } from '@/ui/gift/parts';

const SAID: Record<Exclude<ClaimResult, 'claimed'>, string> = {
  already_claimed: 'Already claimed — someone opened this link first.',
  already_owned: 'You already have this series. The link still works for someone else.',
  cancelled: 'This gift was refunded, so it can no longer be claimed.',
  not_found: 'This gift link does not work. Check it with the person who sent it.',
};

export default function GiftScreen(): React.ReactElement {
  const { code } = useLocalSearchParams<{ code: string }>();
  const api = useM22Api();
  const toast = useToast();
  const { listener } = useSocial();
  const [gift, setGift] = useState<GiftView | 'missing' | undefined>();
  const [said, setSaid] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code) return undefined;
    let live = true;
    api.gift(code).then((g) => { if (live) setGift(g); }, () => { if (live) setGift('missing'); });
    return () => { live = false; };
  }, [api, code]);

  const claim = async (): Promise<void> => {
    if (!listener) { router.push('/auth/sign-in'); return; }
    if (!code || gift === undefined || gift === 'missing') return;
    setBusy(true); setSaid(undefined);
    try {
      const r = await api.claimGift(code);
      if (r === 'claimed') {
        toast('The series is yours. Enjoy!');
        router.replace({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(gift.show.feedUrl) } });
        return;
      }
      setSaid(SAID[r]);
    } catch {
      setSaid("Couldn't reach the server. Try again.");
    } finally { setBusy(false); }
  };

  const open = gift !== undefined && gift !== 'missing' && !gift.claimed && !gift.cancelled;
  const dead = gift === 'missing';
  return (
    <PushedPage
      title="A gift for you"
      size={GIFT.titleSize}
      tone="none"
      {...(open ? { below: <PulseButton kind="hot" icon="gift-outline" label={listener ? 'Claim the series' : 'Sign in to claim'} onPress={() => void claim()} busy={busy} full />, belowHeight: hit.min } : {})}
    >
      {(layout) => (
        <>
          <PageGlow colours={dead ? [colour.violet, colour.line] : [giftColour.pink, colour.violet]} top={GIFT.glowTop} strength={dead ? GIFT.deadGlowStrength : GIFT.glowStrength} />
          {gift === undefined ? <Box className="absolute left-0 right-0 items-center" style={{ top: layout.top + GIFT.loadTop }}><Loader /></Box> : null}
          {dead ? <GiftDead top={layout.top} sentence={SAID.not_found} /> : null}
          {gift !== undefined && gift !== 'missing' ? (
            <GiftOffer
              top={layout.top}
              show={gift.show}
              sentence={gift.cancelled ? SAID.cancelled : gift.claimed ? SAID.already_claimed : `${gift.buyerName ?? 'Someone'} gave you this paid series. The first person to claim it gets every paid episode.`}
              said={said}
            />
          ) : null}
        </>
      )}
    </PushedPage>
  );
}
