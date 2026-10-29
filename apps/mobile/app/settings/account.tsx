// Account and security: how you sign in, masked email, link to More.
/**
 * Account and security (M10: moved here from /account, which is now Settings).
 * Account (US5): who you are and the ways you sign in. Deleting the account sits one level
 * down, under More (M12 FR-096) — its own page, `app/settings/account-more.tsx`.
 *
 * M16a (phone walk 2026-10-02, Tier B row "Settings → Account → More" FAILED): "More" was a
 * sub-view toggled by a state flag inside this route, so the stack had one page where the listener
 * saw two — both ← and the edge swipe popped the route and skipped "Account and security".
 * It is a real route now, pushed like every other page. Guard: __tests__/account-more-route.test.ts.
 *
 * M17 (`SettingsAccount-B`, T082): the Editorial layout — a card for the way you sign in (a
 * monogram, "You sign in with / Email", the masked address on a tinted strip, the no-password
 * line), "Other ways to sign in" as two dashed cards (Google, Facebook: still "Not set up yet" and
 * not tappable — FR-016), and the More row pinned to the foot of the page.
 *
 * M24 US16: "Change" on the email strip opens `app/settings/account-email.tsx`.
 * M25 SB: "Signed-in devices" opens `app/settings/devices.tsx`.
 *
 * M31 S-A (T060; design-pulse2 `settings-account--screen`, `settings-account--signed-out`; Panel): one sign-in tile (avatar 56 with the initial in
 * hot-text on a tint, "You sign in with" 12 over "Email" in Unbounded 20; the masked address in mono 14 on a void strip, radius 16, 56 tall, with
 * **Change** in hot-text when signed in; the no-password line in 12), then "Signed-in devices" as a group row when signed in, then **More** as a
 * group row at the foot with "Delete account" in mono on its right (it was the bottom bar, so the bottom stays for the title bar). Edge labels
 * SIGN-IN, DEVICES, MORE; title "Account and security" at 26 in the bottom title bar.
 */
import { useRouter } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { useSocial } from '@/social/context';
import { readyMethods } from '@/ui/auth/methods';
import { PanelGroup } from '@/ui/me/Panel';
import { Icon } from '@/ui/kit/Icon';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { Note, Sec, SetCard, SetPage, SetRow } from '@/ui/settings/hub-parts';
import { SET, SET_TYPE } from '@/ui/settings/hub-measures';

const AVATAR = 56;
const DASHED = { borderWidth: 1.5, minHeight: 120 };

export default function AccountSecurityScreen(): React.ReactElement {
  const router = useRouter();
  const { listener } = useSocial();

  const masked = listener?.email ? listener.email.replace(/^(.)(.*)(.@.*)$/, (_m, a: string, mid: string, b: string) => `${a}${'*'.repeat(Math.min(6, mid.length))}${b}`) : '';
  const initial = (listener?.displayName || listener?.email || '?').slice(0, 1).toUpperCase();
  const methods = readyMethods();
  return (
    <PushedPage title="Account and security" size={26}>
      {(layout) => (
        <SetPage layout={layout}>
          {/* M10 (owner, 2026-09-27), after the reference: the ways you sign in, then deletion.
              SocialNet signs in by an emailed code; Google and Facebook are not set up yet. */}
          <Sec label="Sign-in">
            <SetCard testID="signin-card" gap={12}>
              <Box className="flex-row items-center" style={{ gap: SET.rowGap }}>
                <Box className={listener ? 'items-center justify-center bg-hotSoft' : 'items-center justify-center bg-raise2'} style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 }} accessible={false}>
                  <Type step="lede" className={listener ? 'text-hotText font-bold' : 'text-text font-bold'} style={SET_TYPE.display20}>{listener ? initial : '?'}</Type>
                </Box>
                <Box>
                  <Type step="caption" className="text-text2" style={SET_TYPE.line12}>You sign in with</Type>
                  <Type step="heading" className="text-text font-bold">Email</Type>
                </Box>
              </Box>
              <Box testID="email-strip" className="flex-row items-center bg-void" style={{ gap: 10, borderRadius: 16, paddingHorizontal: 14, minHeight: 56 }} accessible accessibilityLabel={`Email: ${masked || 'Not signed in'}`}>
                <Icon name="mail-outline" size={20} color={colour.hotText} />
                <Type step="mono" className="text-text flex-1" style={SET_TYPE.mono14} numberOfLines={1}>{masked || 'Not signed in'}</Type>
                {/* M24 US16: change the sign-in email (a code goes to the new address). */}
                {listener ? (
                  <Pressable onPress={() => router.push('/settings/account-email')} accessibilityRole="button" accessibilityLabel="Change email" className="justify-center" style={{ minHeight: 48 }}>
                    <Type step="row" className="text-hotText">Change</Type>
                  </Pressable>
                ) : null}
              </Box>
              <Note>We send a one-time code each time; there is no password.</Note>
            </SetCard>
          </Sec>
          {/* M25 SB: every place this account is signed in, with sign out one or all others. */}
          {listener ? (
            <Sec label="Devices">
              <PanelGroup>
                <SetRow icon="phone-portrait-outline" label="Signed-in devices" line="See where you are signed in; sign a device out" onPress={() => router.push('/settings/devices')} />
              </PanelGroup>
            </Sec>
          ) : null}
          {/* M25 L3c (App Review 2.1): a way in that is not built is not listed (none is today). */}
          {methods.length > 0 ? (
            <Sec label="Other ways">
              <Box className="flex-row" style={{ gap: SET.rowGap }}>
                {methods.map((m) => (
                  <Box key={m.id} className="flex-1 border-dashed border-handle" style={{ ...DASHED, borderRadius: SET.radius, padding: SET.tilePad, gap: 4 }} accessible accessibilityLabel={`${m.label.replace('Continue with ', '')}: not linked yet`}>
                    <Icon name={m.icon} size={24} color={colour.text2} />
                    <Type step="heading" className="text-text font-bold" style={{ marginTop: SET.rowGap }}>{m.label.replace('Continue with ', '')}</Type>
                    <Note>Not linked yet</Note>
                  </Box>
                ))}
              </Box>
            </Sec>
          ) : null}
          {/* M12 FR-096: deletion sits one level down, under More — a pushed page, now a group row at the foot. */}
          <Sec label="More">
            <PanelGroup>
              <SetRow
                icon="trash-outline"
                label="More"
                right={<Box className="flex-row items-center" style={{ gap: SET.rowGap }}><Type step="mono" className="text-text2" style={SET_TYPE.mono12}>Delete account</Type><Icon name="chevron-forward" size={SET.chevron} color={colour.text3} /></Box>}
                accessibilityLabel="More account options"
                onPress={() => router.push('/settings/account-more')}
              />
            </PanelGroup>
          </Sec>
        </SetPage>
      )}
    </PushedPage>
  );
}
