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
 */
import { useRouter } from 'expo-router';
import { Pressable } from '../../src/ui/lib/pressable';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { SafeAreaView } from '../../src/ui/lib/safe-area-view';
import { useSocial } from '../../src/social/context';
import { useStores } from '../../src/ui/providers';
import { useColours } from '../../src/ui/useColours';
import { Icon } from '../../src/ui/Icon';
import { OTHER_METHODS } from '../../src/ui/auth/methods';
import { PageHeader } from '../../src/ui/PageHeader';
import { Card } from '../../src/ui/Card';
import { Eyebrow } from '../../src/ui/Eyebrow';
import { size } from '../../src/design';

const AVATAR = { width: 56, height: 56 };
const TAP = { minHeight: size.row };

export default function AccountSecurityScreen(): React.ReactElement {
  const router = useRouter();
  const stores = useStores();
  const c = useColours(stores.settings);
  const { listener } = useSocial();

  const masked = listener?.email ? listener.email.replace(/^(.)(.*)(.@.*)$/, (_m, a: string, mid: string, b: string) => `${a}${'*'.repeat(Math.min(6, mid.length))}${b}`) : '';
  const initial = (listener?.displayName || listener?.email || '?').slice(0, 1).toUpperCase();
  return (
    <>
    <PageHeader title="Account and security" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-section gap-section">
      {/* M10 (owner, 2026-09-27), after the reference: the ways you sign in, then deletion.
          SocialNet signs in by an emailed code; Google and Facebook are not set up yet. */}
      <Card className="py-section gap-row">
        <Box className="flex-row items-center gap-row">
          <Box className="rounded-pill bg-accentTint items-center justify-center" style={AVATAR} accessible={false}>
            <Text className="text-text text-base font-display">{initial}</Text>
          </Box>
          <Box className="flex-1">
            <Text className="text-muted text-xs">You sign in with</Text>
            <Text className="text-text text-base font-display">Email</Text>
          </Box>
        </Box>
        <Box className="flex-row items-center gap-row bg-background rounded-row px-row" style={TAP} accessible accessibilityLabel={`Email: ${masked || 'Not signed in'}`}>
          <Icon name="mail-outline" size={20} color={c.accent} />
          <Text className="text-text text-body font-semibold flex-1" numberOfLines={1}>{masked || 'Not signed in'}</Text>
        </Box>
        <Text className="text-muted text-xs">We send a one-time code each time; there is no password.</Text>
      </Card>
      <Box className="gap-row">
        <Eyebrow accent>Other ways to sign in</Eyebrow>
        <Box className="flex-row gap-row">
          {OTHER_METHODS.map((m) => (
            <Box key={m.id} className="flex-1 rounded-row border border-dashed border-border p-section gap-1" accessible accessibilityLabel={`${m.label.replace('Continue with ', '')}: not set up yet`}>
              <Icon name={m.icon} size={24} color={c.muted} />
              <Text className="text-text text-title font-display mt-row">{m.label.replace('Continue with ', '')}</Text>
              <Text className="text-muted text-xs">Not set up yet</Text>
            </Box>
          ))}
        </Box>
      </Box>
    </ScrollView>
    {/* M12 FR-096: deletion sits one level down, under More — a pushed page (M17), pinned to the foot. */}
    <SafeAreaView edges={['bottom']} className="bg-background px-screen-x">
      <Box className="border-t-hairline border-separator">
        <Pressable onPress={() => router.push('/settings/account-more')} accessibilityRole="button" accessibilityLabel="More account options" className="flex-row items-center gap-gap" style={TAP}>
          <Text className="text-text text-sm font-semibold flex-1">More</Text>
          <Text className="text-muted text-xs">Delete account</Text>
          <Icon name="chevron-forward" size={16} color={c.muted} />
        </Pressable>
      </Box>
    </SafeAreaView>
    </>
  );
}
