/**
 * The sign-in landing page (owner's reference screenshot, 2026-09-27): a wall of show
 * covers, the app's name, the consent box, then the ways in — each an icon and its name
 * in one row, each opening its own page. The layout follows the reference; nothing of the
 * reference's own (logo, covers, words) is used.
 *
 * Signing in is required (owner, 2026-09-27): no close button, no swipe back (the stack
 * option), and Android's back does nothing here.
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
import { askForNotifications } from '../../src/notify/permission';
import { expoNotify } from '../../src/notify/expo';
import { signInPage } from '../../src/ui/launch';
import { AuthButton } from '../../src/ui/auth/AuthShell';
import { ArtWall } from '../../src/ui/auth/ArtWall';
import { landingArt } from '../../src/ui/auth/art';
import { ConsentDialog, ConsentRow, useLegalOverlay } from '../../src/ui/auth/Consent';
import { submitAction } from '../../src/ui/auth/rules';
import { OTHER_METHODS, notReadyMessage, type OtherMethod } from '../../src/ui/auth/methods';

const LOGO = { width: 48, height: 48 };

type Way = 'email' | OtherMethod;

export default function SignInScreen(): React.ReactElement {
  const { api } = useSocial();
  const stores = useStores();
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
      <Box className="flex-1">
        <ArtWall urls={art} onReady={() => signInPage.setWhole(true)} />
      </Box>
      <Box className="px-screen-x pb-section">
        {/* Owner, 2026-09-27: a clear gap between the name and the ways in. */}
        <Box className="flex-row items-center justify-center gap-row mb-section">
          <Image source={require('../../assets/app-icon.png')} style={LOGO} className="rounded-row" accessibilityIgnoresInvertColors />
          <Text className="text-text text-lg font-bold" accessibilityRole="header">SocialNet</Text>
        </Box>
        <AuthButton mark={{ icon: 'mail-outline' }} label="Continue with email" disabled={false} onPress={() => choose('email')} />
        {OTHER_METHODS.map((m) => (
          <AuthButton key={m.id} outline mark={m.mark} label={m.label} disabled={false} onPress={() => choose(m.id)} />
        ))}
        {/* Owner, 2026-09-27: the consent box sits under the three ways in. */}
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
