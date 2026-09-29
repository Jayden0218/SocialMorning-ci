/**
 * Settings (设置, M10, owner 2026-09-27) — at `/account`, the path Me → "Account and
 * settings" and every older link already use (G3, G4). Laid out after the reference: one
 * list of pages, then Sign out.
 *
 * M6 (FR-027) required four things to be reachable from Account; each still is, one page
 * down: the privacy policy and community rules (About), "Report a problem" (Help and
 * feedback), and account deletion (Account and security).
 *
 * Not here, on purpose: Appearance (the app has one palette, measured for contrast — a
 * dark one is its own piece of work), lock-screen live activities, Siri, CarPlay and
 * widgets (each needs native code outside this Expo app), a paid account and tips (the
 * app takes no payments — everything is free).
 */
import { Stack } from 'expo-router';
import { ScrollView } from '../src/ui/lib/scroll-view';
import { SignOut } from '../src/ui/SignOut';
import { useSocial } from '../src/social/context';
import { Divider, LinkRow } from '../src/ui/settings/rows';
import { DARK_READY } from '../src/design/theme';


export default function SettingsScreen(): React.ReactElement {
  const { auth, listener } = useSocial();
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-row pb-24">
      <Stack.Screen options={{ title: 'Settings' }} />
      <LinkRow href="/settings/account" icon="person-circle-outline" label="Account and security" />
      <Divider />
      {/* M10b US4: shown once dark mode is wired end to end (DARK_READY, flipped by M9). */}
      {DARK_READY ? <LinkRow href="/settings/appearance" icon="contrast-outline" label="Appearance" /> : null}
      <LinkRow href="/settings/downloads" icon="download-outline" label="Downloads and cache" />
      <LinkRow href="/settings/push" icon="notifications-outline" label="Notifications" />
      <LinkRow href="/settings/privacy" icon="lock-closed-outline" label="Privacy" />
      <LinkRow href="/settings/minor" icon="umbrella-outline" label="Minor mode" />
      <LinkRow href="/settings/more" icon="play-circle-outline" label="More" />
      <Divider />
      <LinkRow href="/settings/sharing" icon="alert-circle-outline" label="Third-party sharing list" />
      <LinkRow href="/settings/collected" icon="document-text-outline" label="Personal information we collect" />
      <LinkRow href="/settings/help" icon="help-circle-outline" label="Help and feedback" />
      <LinkRow href="/settings/about" icon="planet-outline" label="About SocialNet" />
      {listener ? (
        <SignOut onSignOut={() => void auth.signOut()} className="items-center justify-center bg-surface rounded-artwork mt-section" />
      ) : null}
    </ScrollView>
  );
}
