// Sign-in start page: the wall of tiles, the app's name, Continue with email, the other ways when built, and the consent box.
/**
 * The sign-in landing page (owner's reference screenshots, 2026-09-27 and 2026-10-03): the icon, the app's name, the ways in
 * and the consent box — each way in opening its own page. The layout follows the reference; nothing of the reference's own
 * (logo, covers, words) is used.
 *
 * Signing in is required (owner, 2026-09-27): no close button, no swipe back (the stack option), and Android's back does
 * nothing here.
 *
 * M31 S-C (T061; design-pulse2 `settings.html` `signInPage`, `auth-sign-in--screen`, layout Stage): the wall of tiles fills the top
 * 430 and fades to the page; the bottom zone sits by the thumb, 24 from the sides and 6 above the edge, 14 between its parts —
 * the app icon (48) beside "SocialNet" in Unbounded 800 40, then Continue with email (light, 56, the mail mark 20 from the left),
 * then the consent row. Google and Facebook are not drawn until they are built (M25 L3c): `<OtherWays>` renders nothing while no
 * method is ready, and then sits as ring pills under the email button. Continuing without the tick opens "Before you continue".
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { Image } from '@/ui/lib/image';
import { Box } from '@/ui/lib/box';
import { bars } from '@/design';
import { Type } from '@/ui/kit/Type';
import { askForNotifications } from '@/notify/permission';
import { expoNotify } from '@/notify/expo';
import { signInPage } from '@/ui/shell/launch';
import { AuthButton } from '@/ui/auth/AuthShell';
import { ArtWall, WallFade } from '@/ui/auth/ArtWall';
import { ConsentDialog, ConsentRow, useLegalOverlay } from '@/ui/auth/Consent';
import { AUTH, AUTH_TYPE } from '@/ui/auth/measures';
import { submitAction } from '@/ui/auth/rules';
import { type OtherMethod } from '@/ui/auth/methods';
import { OtherWays } from '@/ui/auth/OtherWays';

type Way = 'email' | OtherMethod;

export default function SignInScreen(): React.ReactElement {
  const legal = useLegalOverlay();
  const [agreed, setAgreed] = useState(false);
  // Which way in is waiting on the consent sheet.
  const [asking, setAsking] = useState<Way | undefined>(undefined);
  // The page appears whole, once its wall is in (owner, 2026-09-27): whatever is over the app (the launch screen, or the Terms
  // right after Agree) lifts only then — never a splash of this page's own (owner, 2026-09-29).
  useEffect(() => () => signInPage.setWhole(false), []);

  // Owner, 2026-09-27: the OS asks for notification permission when this page opens.
  useEffect(() => {
    void askForNotifications(expoNotify);
  }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  function go(way: Way): void {
    if (way === 'email') {
      router.push({ pathname: '/auth/email', params: { agreed: '1' } });
      return;
    }
    // M25 L3c: only a ready method is drawn (none today); its own sign-in flow goes here when built.
  }
  const choose = (way: Way): void => {
    if (submitAction({ valid: true, agreed, busy: false }) === 'ask') setAsking(way);
    else go(way);
  };

  return (
    <Box className="flex-1 bg-void">
      <ArtWall onReady={() => signInPage.setWhole(true)} />
      <WallFade />
      <Box testID="sign-in-zone" className="absolute" style={{ left: AUTH.zone.side, right: AUTH.zone.side, bottom: bars.pushedGap, gap: AUTH.zone.gap, zIndex: 5 }}>
        <Box className="flex-row items-center" style={{ gap: AUTH.zone.iconGap }}>
          <Image source={require('../../assets/app-icon.png')} style={{ width: AUTH.zone.icon, height: AUTH.zone.icon, borderRadius: AUTH.zone.iconRadius }} accessibilityIgnoresInvertColors />
          <Type step="hero" className="text-text flex-1" style={AUTH_TYPE.wordmark} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit>SocialNet</Type>
        </Box>
        <AuthButton mark={{ icon: 'mail-outline' }} label="Continue with email" text="Continue with email" disabled={false} onPress={() => choose('email')} />
        <OtherWays onChoose={(id) => choose(id)} />
        <ConsentRow agreed={agreed} onToggle={() => setAgreed((a) => !a)} open={legal.open} />
      </Box>
      <ConsentDialog
        visible={asking !== undefined}
        action="continue"
        open={legal.open}
        onCancel={() => setAsking(undefined)}
        onAgree={() => {
          const way = asking;
          setAsking(undefined);
          setAgreed(true);
          if (way) go(way);
        }}
      />
      {legal.overlay}
    </Box>
  );
}
