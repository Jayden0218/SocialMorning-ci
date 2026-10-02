/**
 * Account and security (M10: moved here from /account, which is now Settings).
 * Account (US5): who you are and the ways you sign in. Deleting the account sits one level
 * down, under More (M12 FR-096) — its own page, `app/settings/account-more.tsx`.
 *
 * M16a (phone walk 2026-10-02, Tier B row "Settings → Account → More" FAILED): "More" was a
 * sub-view toggled by a state flag inside this route, so the stack had one page where the listener
 * saw two — both ← and the edge swipe popped the route and skipped "Account and security".
 * It is a real route now, pushed like every other page. Guard: __tests__/account-more-route.test.ts.
 */
import { useRouter } from 'expo-router';
import { Pressable } from '../../src/ui/lib/pressable';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { useSocial } from '../../src/social/context';
import { useStores } from '../../src/ui/providers';
import { useColours } from '../../src/ui/useColours';
import { Icon } from '../../src/ui/Icon';
import { OTHER_METHODS } from '../../src/ui/auth/methods';
import { PageHeader } from '../../src/ui/PageHeader';

export default function AccountSecurityScreen(): React.ReactElement {
  const router = useRouter();
  const stores = useStores();
  const c = useColours(stores.settings);
  const { listener } = useSocial();

  const masked = listener?.email ? listener.email.replace(/^(.)(.*)(.@.*)$/, (_m, a: string, mid: string, b: string) => `${a}${'*'.repeat(Math.min(6, mid.length))}${b}`) : '';
  return (
    <>
    <PageHeader title="Account and security" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-section gap-3">
      {/* M10 (owner, 2026-09-27), after the reference: the ways you sign in, then deletion.
          SocialNet signs in by an emailed code; Google and Facebook are not set up yet. */}
      <Box className="flex-row items-center gap-section min-h-14">
        <Icon name="mail-outline" size={24} color={c.accent} />
        <Text className="text-text text-sm flex-1">Email</Text>
        <Text className="text-muted text-xs">{masked || 'Not signed in'}</Text>
      </Box>
      {OTHER_METHODS.map((m) => (
        <Box key={m.id} className="flex-row items-center gap-section min-h-14" accessible accessibilityLabel={`${m.label.replace('Continue with ', '')}: not set up yet`}>
          <Icon name={m.icon} size={24} color={c.muted} />
          <Text className="text-text text-sm flex-1">{m.label.replace('Continue with ', '')}</Text>
          <Text className="text-muted text-xs">Not set up yet</Text>
        </Box>
      ))}
      <Box className="border-b-hairline border-separator my-2" />
      {/* M12 FR-096: deletion sits one level down, under More — a pushed page (M17). */}
      <Pressable onPress={() => router.push('/settings/account-more')} accessibilityRole="button" accessibilityLabel="More account options" className="flex-row items-center min-h-14">
        <Text className="text-text text-sm flex-1">More</Text>
        <Icon name="chevron-forward" size={20} color={c.muted} />
      </Pressable>
    </ScrollView>
    </>
  );
}
