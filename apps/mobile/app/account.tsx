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
 * information pages as plain rows under a hairline (M24: four small muted rows; "Not interested"
 * moved to More › Recommendations), and Sign out centred at the foot with its
 * confirm unchanged. Every name and destination is the one the list had before.
 *
 * Not here, on purpose: the widgets, the lock-screen live activity and Siri's "play my latest
 * episode" (built in M10b US9, `src/outside/`; they have no settings), CarPlay (not built: M20
 * Q1 = B), and PLUS, paid shows and tips — those live in Wallet (on Me), which on iPhone says
 * "not available yet" until the paid Apple program (M20 Q1 = B).
 */
import { Link } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { SignOut } from '@/ui/me/SignOut';
import { useSocial } from '@/social/context';
import { MenuTile } from '@/ui/me/parts';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Icon, type IconName } from '@/ui/kit/Icon';
import type { ComponentProps } from 'react';
import { hit } from '@/design';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';

/** The hero card is 88 pt tall at the default text size (`Account-B`), and grows with it. */
const HERO = { minHeight: 88 };
const INFO = { minHeight: hit.min };

/** M24 (`Account-B`): one quiet information row — 18 pt accent icon, 13 pt muted words, chevron. */
function InfoRow({ icon, label, ...rest }: { icon: IconName; label: string } & Omit<ComponentProps<typeof Pressable>, 'children'>): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <Pressable {...rest} accessibilityRole="link" accessibilityLabel={label} className="flex-row items-center gap-row" style={INFO}>
      <Icon name={icon} size={18} color={c.accent} />
      <Text className="flex-1 text-muted text-meta font-semibold" numberOfLines={1}>{label}</Text>
      <Icon name="chevron-forward" size={16} color={c.muted} />
    </Pressable>
  );
}

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
      <Box className="gap-2.5">
        <Box className="flex-row gap-2.5">
          <Link href="/settings/appearance" asChild accessibilityLabel="Appearance"><MenuTile size="large" icon="contrast-outline" label="Appearance" /></Link>
          <Link href="/settings/downloads" asChild accessibilityLabel="Downloads and cache"><MenuTile size="large" icon="download-outline" label="Downloads and cache" /></Link>
        </Box>
        <Box className="flex-row gap-2.5">
          <Link href="/settings/push" asChild accessibilityLabel="Notifications"><MenuTile size="large" icon="notifications-outline" label="Notifications" /></Link>
          <Link href="/settings/privacy" asChild accessibilityLabel="Privacy"><MenuTile size="large" icon="lock-closed-outline" label="Privacy" /></Link>
        </Box>
        <Box className="flex-row gap-2.5">
          <Link href="/settings/minor" asChild accessibilityLabel="Minor mode"><MenuTile size="large" icon="umbrella-outline" label="Minor mode" /></Link>
          <Link href="/settings/more" asChild accessibilityLabel="More"><MenuTile size="large" icon="play-circle-outline" label="More" /></Link>
        </Box>
        {/* M21 US10 (T110): the playback switches have their own page. */}
        <Box className="flex-row gap-2.5">
          <Link href="/settings/playback" asChild accessibilityLabel="Playback"><MenuTile size="large" icon="headset-outline" label="Playback" /></Link>
          <Box className="flex-1" />
        </Box>
      </Box>
      {/* M24 US20 (`Account-B`): the four information pages as small muted rows under a hairline.
          "Not interested" moved to More › Recommendations, beside "How For You works". */}
      <Box className="border-t-hairline border-separator mt-gap pt-1">
        <Link href="/settings/sharing" asChild accessibilityLabel="Third-party sharing list"><InfoRow icon="alert-circle-outline" label="Third-party sharing list" /></Link>
        <Link href="/settings/collected" asChild accessibilityLabel="Personal information we collect"><InfoRow icon="document-text-outline" label="Personal information we collect" /></Link>
        <Link href="/settings/help" asChild accessibilityLabel="Help and feedback"><InfoRow icon="help-circle-outline" label="Help and feedback" /></Link>
        <Link href="/settings/about" asChild accessibilityLabel="About SocialNet"><InfoRow icon="planet-outline" label="About SocialNet" /></Link>
      </Box>
      {listener ? (
        <SignOut onSignOut={() => void auth.signOut()} className="items-center justify-center mt-section" />
      ) : null}
    </ScrollView>
    </>
  );
}
