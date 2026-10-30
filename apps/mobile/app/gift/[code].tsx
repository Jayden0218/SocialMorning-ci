// A gift link opened in the app: the paid series, who gave it, and Claim — once, by whoever signs in first.
/**
 * M22 US14 (FR-043, FR-044; contracts/api.md "Gift"). `socialmorning://gift/<code>` (or the web
 * page's "Open in SocialNet") lands here, on either phone — claiming is not a purchase. Signed out,
 * Claim asks for sign-in first. Answers in plain words: claimed → the show opens; "Already claimed";
 * "You already have this series" (the link stays for someone else); refunded → no longer claimable.
 */
import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Artwork } from '@/ui/kit/Artwork';
import { BottomBar } from '@/ui/kit/BottomBar';
import { Button } from '@/ui/kit/Button';
import { Loader } from '@/ui/kit/Loader';
import { useToast } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { useM22Api, type ClaimResult, type GiftView } from '@/social/api-m22-server';

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
  return (
    <>
      <PageHeader title="A gift for you" />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-section gap-row items-center">
        {gift === undefined ? <Loader /> : null}
        {gift === 'missing' ? <Text className="text-muted text-body text-center mt-section">{SAID.not_found}</Text> : null}
        {gift !== undefined && gift !== 'missing' ? (
          <Box className="items-center gap-row mt-section">
            <Artwork url={gift.show.artworkUrl} size={180} name={gift.show.title} />
            <Text className="text-text font-display text-hero text-center" accessibilityRole="header">{gift.show.title}</Text>
            <Text className="text-muted text-body text-center">
              {gift.cancelled ? SAID.cancelled : gift.claimed ? SAID.already_claimed : `${gift.buyerName ?? 'Someone'} gave you this paid series. The first person to claim it gets every paid episode.`}
            </Text>
          </Box>
        ) : null}
        {said ? <Text className="text-accent text-body text-center" accessibilityLiveRegion="polite">{said}</Text> : null}
      </ScrollView>
      {open ? (
        <BottomBar tone="surface" line="border" className="flex-row items-center">
          <Button label={listener ? 'Claim the series' : 'Sign in to claim'} onPress={() => void claim()} busy={busy} className="flex-1" />
        </BottomBar>
      ) : null}
    </>
  );
}
