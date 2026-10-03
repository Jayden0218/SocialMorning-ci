/**
 * The sign-in landing page (owner's reference screenshots, 2026-09-27 and 2026-10-03): the
 * icon, the app's name, a moving row of show covers, then the ways in and the consent box —
 * each way in opening its own page. The layout follows the reference; nothing of the
 * reference's own (logo, covers, words) is used.
 *
 * Signing in is required (owner, 2026-09-27): no close button, no swipe back (the stack
 * option), and Android's back does nothing here.
 *
 * M17 T070 (`SignIn-B`): the name in 56 pt Fraunces with tight spacing, covers at 22 pt corners
 * with a soft shadow, a 60 pt yellow "Continue with email" and Google / Facebook as white 56 pt
 * pills with the card border. The icon (72) and the gap above the covers (64) keep the owner's
 * own sizes from 2026-10-03 rather than B's 44 / 56. Ways in, consent and the guards unchanged.
 */
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { BackHandler } from 'react-native';
import { Image } from '../../src/ui/lib/image';
import { SafeAreaView } from '../../src/ui/lib/safe-area-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { createDiscover } from '../../src/discover/cache';
import { useSocial } from '../../src/social/context';
import { useStores, useToast } from '../../src/ui/providers';
import { useColours } from '../../src/ui/useColours';
import { askForNotifications } from '../../src/notify/permission';
import { expoNotify } from '../../src/notify/expo';
import { signInPage } from '../../src/ui/launch';
import { AuthButton } from '../../src/ui/auth/AuthShell';
import { ArtWall } from '../../src/ui/auth/ArtWall';
import { landingArt } from '../../src/ui/auth/art';
import { display } from '../../src/ui/auth/display';
import { ConsentDialog, ConsentRow, useLegalOverlay } from '../../src/ui/auth/Consent';
import { submitAction } from '../../src/ui/auth/rules';
import { OTHER_METHODS, notReadyMessage, type OtherMethod } from '../../src/ui/auth/methods';

/** Owner, 2026-10-03: larger (was 48), and the covers lower down (was 40 below the name). */
const LOGO = { width: 72, height: 72 };
const ROW_TOP = { marginTop: 64 };

type Way = 'email' | OtherMethod;

export default function SignInScreen(): React.ReactElement {
  const { api } = useSocial();
  const stores = useStores();
  const c = useColours(stores.settings);
  const toast = useToast();
  const legal = useLegalOverlay();
  const [agreed, setAgreed] = useState(false);
  // Which way in is waiting on the consent dialog.
  const [asking, setAsking] = useState<Way | undefined>(undefined);
  // The page appears whole, once its covers are in (owner, 2026-09-27): whatever is over the
  // app (the launch screen, or the Terms right after Agree) lifts only then — never a splash
  // of this page's own (owner, 2026-09-29: Agree → splash → sign-in read as a step too many).
  useEffect(() => () => signInPage.setWhole(false), []);

  // Owner, 2026-09-27: the OS asks for notification permission when this page opens.
  useEffect(() => { void askForNotifications(expoNotify); }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const art = useMemo(() => landingArt({
    subscribed: stores.subscriptions.list().map((s) => stores.feeds.getShow(s.feedUrl)?.imageUrl),
    discover: createDiscover({ api, cache: stores.feedCache, now: () => Date.now() }).cached()?.body,
  }), [api, stores]);

  function go(way: Way): void {
    if (way === 'email') { router.push({ pathname: '/auth/email', params: { agreed: '1' } }); return; }
    const m = OTHER_METHODS.find((o) => o.id === way)!;
    // M11 wires the backend; until then, say so rather than do nothing.
    if (!m.ready) toast(notReadyMessage(m.label));
  }
  const choose = (way: Way): void => {
    if (submitAction({ valid: true, agreed, busy: false }) === 'ask') setAsking(way);
    else go(way);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Owner, 2026-10-03: the icon on top, the name under it, then a row of covers that
          moves on every second; the ways in at the bottom — email full width, Google and
          Facebook side by side. */}
      <Box className="px-screen-x pt-section">
        <Image source={require('../../assets/app-icon.png')} style={LOGO} className="rounded-2xl" accessibilityIgnoresInvertColors />
        <Text style={display(56, c.text, { tracking: -1.5, leading: 58 })} className="text-text mt-section" accessibilityRole="header">SocialNet</Text>
      </Box>
      {/* Owner, 2026-10-03: room above the covers. */}
      <Box style={ROW_TOP}>
        <ArtWall urls={art} onReady={() => signInPage.setWhole(true)} />
      </Box>
      <Box className="flex-1" />
      <Box className="px-screen-x pb-section">
        <AuthButton mark={{ icon: 'mail-outline' }} label="Continue with email" text="Continue with email" className="rounded-pill" tall bold disabled={false} onPress={() => choose('email')} />
        <Box className="flex-row gap-row mt-row">
          {OTHER_METHODS.map((m) => (
            <AuthButton key={m.id} outline mark={m.mark} label={m.label} text={m.short} className="flex-1 rounded-pill" disabled={false} onPress={() => choose(m.id)} />
          ))}
        </Box>
        {/* Owner, 2026-09-27: the consent box sits under the ways in. */}
        <ConsentRow agreed={agreed} onToggle={() => setAgreed((a) => !a)} open={legal.open} />
      </Box>
      <ConsentDialog
        visible={asking !== undefined}
        action="continue"
        open={legal.open}
        onCancel={() => setAsking(undefined)}
        onAgree={() => { const way = asking; setAsking(undefined); setAgreed(true); if (way) go(way); }}
      />
      {legal.overlay}
    </SafeAreaView>
  );
}
