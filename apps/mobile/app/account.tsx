// Settings: account card, everyday settings tiles, info pages, Sign out. From Me.
/**
 * Settings (设置, M10, owner 2026-09-27) — at `/account`, the path Me → "Account and
 * settings" and every older link already use (G3, G4). Laid out after the reference: one
 * list of pages, then Sign out.
 *
 * M6 (FR-027) required four things to be reachable from Account; each still is, one page
 * down: the privacy policy and community rules (About), "Report a problem" (Help and
 * feedback), and account deletion (Account and security).
 *
 * M17 (`Account-B`, constitution v3.0.0): the same eleven links and Sign out, in the Editorial
 * layout — "Account and security" as a white hero card (yellow disc, serif label), the six
 * everyday pages as a two-column grid of tiles (`MenuTile`, as on Me), then the four
 * information pages as plain rows under a hairline, and Sign out centred at the foot with its
 * confirm unchanged. Every name and destination is the one the list had before.
 *
 * Not here, on purpose: lock-screen live activities, Siri, CarPlay and widgets (each needs
 * native code outside this Expo app), a paid account and tips (the app takes no payments —
 * everything is free).
 */
import { Link } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { SignOut } from '@/ui/me/SignOut';
import { useSocial } from '@/social/context';
import { LinkRow } from '@/ui/settings/rows';
import { MenuTile } from '@/ui/me/parts';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Icon } from '@/ui/kit/Icon';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';

/** The hero card is 88 pt tall at the default text size (`Account-B`), and grows with it. */
const HERO = { minHeight: 88 };

export default function SettingsScreen(): React.ReactElement {
  const { auth, listener } = useSocial();
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <>
    <PageHeader title="Settings" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-gap pb-24 gap-row">
      <Link href="/settings/account" asChild>
        <Pressable accessibilityRole="link" accessibilityLabel="Account and security" className="flex-row items-center gap-section bg-surface border border-border rounded-row p-section" style={HERO}>
          <Box className="w-12 h-12 rounded-pill bg-primary items-center justify-center"><Icon name="person-circle-outline" size={26} color={c.onPrimary} /></Box>
          <Text className="flex-1 text-text text-base font-display-semibold" numberOfLines={2}>Account and security</Text>
          <Icon name="chevron-forward" size={16} color={c.muted} />
        </Pressable>
      </Link>
      {/* M17: Appearance holds the accent colour only (dark mode removed, constitution v3.0.0). */}
      <Box className="gap-gap">
        <Box className="flex-row gap-gap">
          <Link href="/settings/appearance" asChild accessibilityLabel="Appearance"><MenuTile icon="contrast-outline" label="Appearance" /></Link>
          <Link href="/settings/downloads" asChild accessibilityLabel="Downloads and cache"><MenuTile icon="download-outline" label="Downloads and cache" /></Link>
        </Box>
        <Box className="flex-row gap-gap">
          <Link href="/settings/push" asChild accessibilityLabel="Notifications"><MenuTile icon="notifications-outline" label="Notifications" /></Link>
          <Link href="/settings/privacy" asChild accessibilityLabel="Privacy"><MenuTile icon="lock-closed-outline" label="Privacy" /></Link>
        </Box>
        <Box className="flex-row gap-gap">
          <Link href="/settings/minor" asChild accessibilityLabel="Minor mode"><MenuTile icon="umbrella-outline" label="Minor mode" /></Link>
          <Link href="/settings/more" asChild accessibilityLabel="More"><MenuTile icon="play-circle-outline" label="More" /></Link>
        </Box>
      </Box>
      <Box className="border-t-hairline border-separator mt-gap">
        {/* M19 T022: what For You no longer recommends, each with Restore. */}
        <LinkRow href="/settings/not-interested" icon="eye-off-outline" label="Not interested" line="Episodes and shows hidden from For You" />
        <LinkRow href="/settings/sharing" icon="alert-circle-outline" label="Third-party sharing list" />
        <LinkRow href="/settings/collected" icon="document-text-outline" label="Personal information we collect" />
        <LinkRow href="/settings/help" icon="help-circle-outline" label="Help and feedback" />
        <LinkRow href="/settings/about" icon="planet-outline" label="About SocialNet" />
      </Box>
      {listener ? (
        <SignOut onSignOut={() => void auth.signOut()} className="items-center justify-center mt-section" />
      ) : null}
    </ScrollView>
    </>
  );
}
