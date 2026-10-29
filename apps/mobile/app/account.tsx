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
 *
 * M31 S-A (T060; design-pulse2 `settings.html` `account--screen`, `account--signed-out`, `account--sign-out-dialog`; Panel + Mosaic): the
 * same eleven links and Sign out, drawn as three groups under edge labels ACCOUNT, EVERYDAY and INFO. "Account and security" is a full-width
 * hero tile (88, radius 22: avatar 52, the name of the page in Unbounded 17, the masked email in mono 12, a chevron); the seven everyday pages
 * are large two-column tiles (112, radius 22) with a one-line state in mono 12 (the accent, the space used, whether new-episode pushes are on …);
 * the four information pages are rows in one group tile with 1 px dividers; Sign out is a ring pill centred at the foot of the scroll and asks
 * first. The title "Settings" and its back sit low in the bottom title bar. Not drawn from the server: Privacy's and Notifications' states
 * (the drawing says "Listening public" and "Allowed"), which are the server's and the phone's, not read here — Privacy says "What others see",
 * Notifications says whether new-episode pushes are on.
 *
 * Not here, on purpose: the widgets, the lock-screen live activity and Siri's "play my latest
 * episode" (built in M10b US9, `src/outside/`; they have no settings), CarPlay (not built: M20
 * Q1 = B), and PLUS, paid shows and tips — those live in Wallet (on Me), which on iPhone says
 * "not available yet" until the paid Apple program (M20 Q1 = B).
 */
import { Link } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import type { ComponentProps } from 'react';
import { colour } from '@/design';
import { ACCENTS } from '@/design';
import { readAccent } from '@/design/accent';
import { getPref } from '@/settings/prefs';
import { sizeLabel } from '@/storage/clear-cache';
import { useSocial } from '@/social/context';
import { useProfileApi } from '@/social/profile-api';
import { useMyAvatar } from '@/me/my-avatar';
import { PanelGroup } from '@/ui/me/Panel';
import { SignOut } from '@/ui/me/SignOut';
import { Avatar } from '@/ui/kit/Avatar';
import { Icon } from '@/ui/kit/Icon';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { useDownloads, useStores } from '@/ui/shell/providers';
import { BigGrid, BigTile, SetPage, SetRow, Sec } from '@/ui/settings/hub-parts';
import { SET, SET_TYPE } from '@/ui/settings/hub-measures';

/** The hero tile (`hubPage` `hero`): raise, radius 22, padding 16, 14 between, at least 88 tall. Takes the Link's press. */
function Hero({ signedIn, name, avatarUrl, masked, ...rest }: { signedIn: boolean; name?: string | undefined; avatarUrl?: string | undefined; masked: string } & Omit<ComponentProps<typeof Pressable>, 'children'>): React.ReactElement {
  return (
    <Pressable {...rest} accessibilityRole="link" accessibilityLabel="Account and security" testID="settings-hero" className="flex-row items-center bg-raise" style={{ minHeight: SET.heroMin, borderRadius: SET.radius, padding: SET.tilePad, gap: SET.heroGap }}>
      {signedIn ? <Avatar size={SET.heroAvatar} url={avatarUrl} name={name} /> : (
        <Box className="bg-raise2 items-center justify-center" style={{ width: SET.heroAvatar, height: SET.heroAvatar, borderRadius: SET.heroAvatar / 2 }} accessible={false}>
          <Icon name="person-outline" size={26} color={colour.text} />
        </Box>
      )}
      <Box className="flex-1 min-w-0">
        <Type step="lede" className="text-text font-bold" style={SET_TYPE.display17} numberOfLines={2}>Account and security</Type>
        <Type step="mono" className="text-text2" style={SET_TYPE.mono12} numberOfLines={1}>{signedIn ? masked : 'Not signed in'}</Type>
      </Box>
      <Icon name="chevron-forward" size={SET.chevron} color={colour.text3} />
    </Pressable>
  );
}

export default function SettingsScreen(): React.ReactElement {
  const { auth, listener } = useSocial();
  const stores = useStores();
  const downloads = useDownloads();
  const profileApi = useProfileApi();
  const avatarUrl = useMyAvatar(stores.settings, listener !== undefined, profileApi.me);
  const masked = listener?.email ? listener.email.replace(/^(.)(.*)(.@.*)$/, (_m, a: string, mid: string, b: string) => `${a}${'*'.repeat(Math.min(6, mid.length))}${b}`) : '';
  const signedIn = listener !== undefined;
  return (
    <PushedPage title="Settings">
      {(layout) => (
        <SetPage layout={layout}>
          <Sec label="Account">
            <Link href="/settings/account" asChild accessibilityLabel="Account and security">
              <Hero signedIn={signedIn} name={listener?.displayName} avatarUrl={avatarUrl} masked={masked} />
            </Link>
          </Sec>
          <Sec label="Everyday">
            <BigGrid>
              <Link href="/settings/appearance" asChild accessibilityLabel="Appearance"><BigTile icon="diamond-outline" label="Appearance" state={ACCENTS[readAccent(stores.settings)].label} /></Link>
              <Link href="/settings/downloads" asChild accessibilityLabel="Downloads and cache"><BigTile icon="download-outline" label="Downloads and cache" state={sizeLabel(downloads.usedBytes())} /></Link>
              <Link href="/settings/push" asChild accessibilityLabel="Notifications"><BigTile icon="notifications-outline" label="Notifications" state={signedIn ? (getPref(stores.settings, 'newEpisodePush') ? 'New episodes on' : 'New episodes off') : 'Sign in'} /></Link>
              <Link href="/settings/privacy" asChild accessibilityLabel="Privacy"><BigTile icon="lock-closed-outline" label="Privacy" state={signedIn ? 'What others see' : '—'} /></Link>
              <Link href="/settings/minor" asChild accessibilityLabel="Minor mode"><BigTile icon="moon-outline" label="Minor mode" state={getPref(stores.settings, 'hideExplicit') ? 'On' : 'Off'} /></Link>
              <Link href="/settings/more" asChild accessibilityLabel="More"><BigTile icon="play" label="More" state="OPML · For You" /></Link>
              {/* M21 US10 (T110): the playback switches have their own page. */}
              <Link href="/settings/playback" asChild accessibilityLabel="Playback"><BigTile icon="headset-outline" label="Playback" state={getPref(stores.settings, 'skipSilence') ? 'Skip silence on' : 'Skip silence off'} /></Link>
            </BigGrid>
          </Sec>
          {/* M24 US20 (`Account-B`): "Not interested" moved to More › Recommendations, beside "How For You works". */}
          <Sec label="Info">
            <PanelGroup>
              <Link href="/settings/sharing" asChild accessibilityLabel="Third-party sharing list"><SetRow icon="information-circle-outline" label="Third-party sharing list" /></Link>
              <Link href="/settings/collected" asChild accessibilityLabel="Personal information we collect"><SetRow icon="document-text-outline" label="Personal information we collect" /></Link>
              <Link href="/settings/help" asChild accessibilityLabel="Help and feedback"><SetRow icon="chatbox-ellipses-outline" label="Help and feedback" /></Link>
              <Link href="/settings/about" asChild accessibilityLabel="About SocialNet"><SetRow icon="globe-outline" label="About SocialNet" /></Link>
            </PanelGroup>
          </Sec>
          {listener ? <SignOut onSignOut={() => void auth.signOut()} className="items-center" /> : null}
        </SetPage>
      )}
    </PushedPage>
  );
}
