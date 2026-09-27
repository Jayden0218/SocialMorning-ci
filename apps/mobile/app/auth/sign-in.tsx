/**
 * The sign-in landing page (owner's reference screenshot, 2026-09-27): a wall of show
 * covers, the app's name, the consent box, then the ways in. Each way opens its own page
 * — the email form is `/auth/email`. The layout follows the reference; nothing of the
 * reference's own (logo, covers, words) is used.
 */
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, SafeAreaView, Text, View } from 'react-native';
import { hit } from '../../src/design';
import { createDiscover } from '../../src/discover/cache';
import { useSocial } from '../../src/social/context';
import { useStores, useToast } from '../../src/ui/providers';
import { askForNotifications } from '../../src/notify/permission';
import { expoNotify } from '../../src/notify/expo';
import { AuthButton } from '../../src/ui/auth/AuthShell';
import { ArtWall } from '../../src/ui/auth/ArtWall';
import { landingArt } from '../../src/ui/auth/art';
import { ConsentDialog, ConsentRow, useLegalOverlay } from '../../src/ui/auth/Consent';
import { submitAction } from '../../src/ui/auth/rules';
import { OTHER_METHODS, notReadyMessage, type OtherMethod } from '../../src/ui/auth/methods';

const TAP = { minHeight: hit.min, minWidth: hit.min };
const LOGO = { width: 48, height: 48 };

type Way = 'email' | 'sign-up' | OtherMethod;

/** The quiet row under the main button names each way in short; its accessible name is the full label. */
const SHORT: Record<OtherMethod, string> = { code: 'Email code', google: 'Google', facebook: 'Facebook' };

function close(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function SignInScreen(): React.ReactElement {
  const { api } = useSocial();
  const stores = useStores();
  const toast = useToast();
  const legal = useLegalOverlay();
  const [agreed, setAgreed] = useState(false);
  // Which way in is waiting on the consent dialog.
  const [asking, setAsking] = useState<Way | undefined>(undefined);

  // Owner, 2026-09-27: the OS asks for notification permission when this page opens.
  useEffect(() => { void askForNotifications(expoNotify); }, []);

  const art = useMemo(() => landingArt({
    subscribed: stores.subscriptions.list().map((s) => stores.feeds.getShow(s.feedUrl)?.imageUrl),
    discover: createDiscover({ api, cache: stores.feedCache, now: () => Date.now() }).cached()?.body,
  }), [api, stores]);

  function go(way: Way): void {
    if (way === 'email') { router.push({ pathname: '/auth/email', params: { agreed: '1' } }); return; }
    if (way === 'sign-up') { router.push('/auth/sign-up'); return; }
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
      <View className="flex-1">
        <ArtWall urls={art} />
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" className="absolute top-2 right-2 items-center justify-center" style={TAP}>
          <Text className="text-muted text-lg">✕</Text>
        </Pressable>
      </View>
      <View className="px-screen-x pb-section">
        <View className="flex-row items-center justify-center gap-row">
          <Image source={require('../../assets/app-icon.png')} style={LOGO} className="rounded-row" accessibilityIgnoresInvertColors />
          <Text className="text-text text-lg font-bold" accessibilityRole="header">SocialNet</Text>
        </View>
        <ConsentRow agreed={agreed} onToggle={() => setAgreed((a) => !a)} open={legal.open} />
        <AuthButton label="Sign in with email" disabled={false} onPress={() => choose('email')} />
        <Pressable onPress={() => choose('sign-up')} accessibilityRole="link" accessibilityLabel="Create an account" className="items-center justify-center mt-row" style={TAP}>
          <Text className="text-muted text-sm">Create an account</Text>
        </Pressable>
        <View className="flex-row justify-center gap-section">
          {OTHER_METHODS.map((m) => (
            <Pressable key={m.id} onPress={() => choose(m.id)} accessibilityRole="button" accessibilityLabel={m.label} className="items-center justify-center" style={TAP}>
              <Text className="text-muted text-xs">{SHORT[m.id]}</Text>
            </Pressable>
          ))}
        </View>
      </View>
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
